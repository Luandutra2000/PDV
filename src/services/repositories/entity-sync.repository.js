function readJson(key, fallback) {
  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn(`Valor local invalido para ${key}.`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function createStatus(state = 'idle', pending = 0, error = '') {
  return { state, pending, error };
}

export function createEntitySyncRepository({ adapter, getClient, emitChange = () => {} }) {
  let status = createStatus('idle', readQueue().length);
  let channel = null;

  function readCache() {
    return readJson(adapter.cacheKey, []);
  }

  function writeCache(items) {
    return writeJson(adapter.cacheKey, items);
  }

  function readQueue() {
    return readJson(adapter.queueKey, []);
  }

  function writeQueue(queue) {
    status = createStatus(queue.length ? 'pending' : status.state, queue.length, status.error);
    return writeJson(adapter.queueKey, queue);
  }

  function applyQueuedOperations(items, queue = readQueue()) {
    return queue.reduce((nextItems, operation) => {
      if (operation.action === 'delete') {
        return nextItems.filter((item) => item.id !== operation.id);
      }

      if (operation.action === 'upsert' && operation.item) {
        const pendingItem = { ...operation.item, syncPending: true };
        const exists = nextItems.some((item) => item.id === pendingItem.id);
        return exists
          ? nextItems.map((item) => (item.id === pendingItem.id ? pendingItem : item))
          : [...nextItems, pendingItem];
      }

      return nextItems;
    }, items);
  }

  function setStatusFromQueue(queue, error = '') {
    setStatus({
      state: queue.length ? 'pending' : 'synced',
      pending: queue.length,
      error
    });
  }

  function setStatus(nextStatus) {
    status = { ...status, ...nextStatus };
    emitChange({ type: 'status', status });
  }

  async function list() {
    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { data, error } = await client.from(adapter.table).select(adapter.select || '*');

      if (error) {
        throw error;
      }

      const queue = readQueue();
      const items = applyQueuedOperations(Array.isArray(data) ? data.map(adapter.fromRow) : [], queue);
      writeCache(items);
      setStatusFromQueue(queue);
      return items;
    } catch (error) {
      const cached = readCache();
      setStatus({
        state: cached.length ? 'cache' : 'error',
        pending: readQueue().length,
        error: error.message || 'Erro ao carregar dados.'
      });
      return cached;
    }
  }

  async function save(item) {
    const nextItem = { ...item };

    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { error } = await client.from(adapter.table).upsert([adapter.toRow(nextItem)]);

      if (error) {
        throw error;
      }

      const queue = readQueue();
      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      const nextCache = exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate))
        : [...cached, nextItem];
      writeCache(applyQueuedOperations(nextCache, queue));
      setStatusFromQueue(queue);
      emitChange({ type: 'saved', item: nextItem });
      return nextItem;
    } catch (error) {
      const queue = [...readQueue(), { action: 'upsert', item: nextItem, createdAt: new Date().toISOString() }];
      writeQueue(queue);
      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      writeCache(exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? { ...nextItem, syncPending: true } : candidate))
        : [...cached, { ...nextItem, syncPending: true }]);
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Alteracao pendente.' });
      emitChange({ type: 'queued', item: nextItem });
      return nextItem;
    }
  }

  async function remove(id) {
    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { error } = await client.from(adapter.table).delete().eq('id', id);

      if (error) {
        throw error;
      }

      const queue = readQueue();
      writeCache(applyQueuedOperations(readCache().filter((item) => item.id !== id), queue));
      setStatusFromQueue(queue);
      emitChange({ type: 'removed', id });
    } catch (error) {
      const queue = [...readQueue(), { action: 'delete', id, createdAt: new Date().toISOString() }];
      writeQueue(queue);
      writeCache(readCache().filter((item) => item.id !== id));
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Exclusao pendente.' });
      emitChange({ type: 'queued-delete', id });
    }
  }

  async function flushQueue() {
    const queue = readQueue();

    if (!queue.length) {
      setStatus({ state: 'synced', pending: 0, error: '' });
      return;
    }

    const remaining = [];

    try {
      const client = await getClient();

      if (!client) {
        throw new Error('Cliente Supabase indisponivel.');
      }

      for (const operation of queue) {
        try {
          if (operation.action === 'delete') {
            const { error } = await client.from(adapter.table).delete().eq('id', operation.id);

            if (error) {
              remaining.push(operation);
            }
          }

          if (operation.action === 'upsert') {
            const { error } = await client.from(adapter.table).upsert([adapter.toRow(operation.item)]);

            if (error) {
              remaining.push(operation);
            }
          }
        } catch (error) {
          remaining.push(operation);
        }
      }
    } catch (error) {
      writeQueue(queue);
      writeCache(applyQueuedOperations(readCache(), queue));
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Sincronizacao pendente.' });
      return;
    }

    writeQueue(remaining);
    setStatusFromQueue(remaining, remaining.length ? 'Algumas alteracoes continuam pendentes.' : '');

    await list();

    if (remaining.length) {
      setStatus({
        state: 'pending',
        pending: remaining.length,
        error: 'Algumas alteracoes continuam pendentes.'
      });
    }
  }

  function subscribe() {
    if (channel) {
      return channel;
    }

    getClient().then((client) => {
      channel = client
        .channel(`${adapter.table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table: adapter.table }, async () => {
          await list();
          emitChange({ type: 'realtime' });
        })
        .subscribe();
    });

    return channel;
  }

  async function unsubscribe() {
    if (!channel) {
      return;
    }

    const client = await getClient();
    client.removeChannel(channel);
    channel = null;
  }

  return {
    list,
    save,
    remove,
    flushQueue,
    subscribe,
    unsubscribe,
    getSyncStatus() {
      return status;
    }
  };
}
