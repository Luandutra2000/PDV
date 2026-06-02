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

      const items = Array.isArray(data) ? data.map(adapter.fromRow) : [];
      writeCache(items);
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
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

      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      writeCache(exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate))
        : [...cached, nextItem]);
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
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

      writeCache(readCache().filter((item) => item.id !== id));
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
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
    const client = await getClient();

    for (const operation of queue) {
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
    }

    writeQueue(remaining);
    setStatus({
      state: remaining.length ? 'pending' : 'synced',
      pending: remaining.length,
      error: remaining.length ? 'Algumas alteracoes continuam pendentes.' : ''
    });

    await list();
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
