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
  let subscriptionPromise = null;
  let listRequestId = 0;
  let mutationVersion = 0;

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

  function applyCompletedOperations(items, operations) {
    return operations.reduce((nextItems, operation) => {
      if (operation.action === 'delete') {
        return nextItems.filter((item) => item.id !== operation.id);
      }

      if (operation.action === 'upsert' && operation.item) {
        const completedItem = { ...operation.item };
        delete completedItem.syncPending;
        const exists = nextItems.some((item) => item.id === completedItem.id);
        return exists
          ? nextItems.map((item) => (item.id === completedItem.id ? completedItem : item))
          : [...nextItems, completedItem];
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
    const requestId = ++listRequestId;
    const requestMutationVersion = mutationVersion;
    const previousError = status.error;

    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { data, error } = await client.from(adapter.table).select(adapter.select || '*');

      if (error) {
        throw error;
      }

      if (requestId !== listRequestId || requestMutationVersion !== mutationVersion) {
        return readCache();
      }

      const queue = readQueue();
      const items = applyQueuedOperations(Array.isArray(data) ? data.map(adapter.fromRow) : [], queue);
      writeCache(items);
      setStatusFromQueue(queue, queue.length ? previousError : '');
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
    mutationVersion += 1;

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
      mutationVersion += 1;
      writeCache(applyQueuedOperations(nextCache, queue));
      setStatusFromQueue(queue);
      emitChange({ type: 'saved', item: nextItem });
      return nextItem;
    } catch (error) {
      const queue = enqueueLatestOperation(readQueue(), { action: 'upsert', item: nextItem, createdAt: new Date().toISOString() });
      writeQueue(queue);
      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      mutationVersion += 1;
      writeCache(exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? { ...nextItem, syncPending: true } : candidate))
        : [...cached, { ...nextItem, syncPending: true }]);
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Alteracao pendente.' });
      emitChange({ type: 'queued', item: nextItem });
      return nextItem;
    }
  }

  async function remove(id) {
    mutationVersion += 1;

    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { error } = await client.from(adapter.table).delete().eq('id', id);

      if (error) {
        throw error;
      }

      const queue = readQueue();
      mutationVersion += 1;
      writeCache(applyQueuedOperations(readCache().filter((item) => item.id !== id), queue));
      setStatusFromQueue(queue);
      emitChange({ type: 'removed', id });
    } catch (error) {
      const queue = enqueueLatestOperation(readQueue(), { action: 'delete', id, createdAt: new Date().toISOString() });
      writeQueue(queue);
      mutationVersion += 1;
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
    let firstError = '';

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
              firstError ||= error.message || 'Falha ao excluir registro remoto.';
            }
          }

          if (operation.action === 'upsert') {
            const { error } = await client.from(adapter.table).upsert([adapter.toRow(operation.item)]);

            if (error) {
              remaining.push(operation);
              firstError ||= error.message || 'Falha ao enviar registro remoto.';
            }
          }
        } catch (error) {
          remaining.push(operation);
          firstError ||= error.message || 'Falha ao sincronizar registro remoto.';
        }
      }
    } catch (error) {
      writeQueue(queue);
      writeCache(applyQueuedOperations(readCache(), queue));
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Sincronizacao pendente.' });
      return;
    }

    writeQueue(remaining);
    const completed = queue.filter((operation) => !remaining.includes(operation));
    writeCache(applyQueuedOperations(applyCompletedOperations(readCache(), completed), remaining));
    setStatusFromQueue(remaining, remaining.length ? firstError || 'Algumas alteracoes continuam pendentes.' : '');

    await list();

    setStatusFromQueue(remaining, remaining.length ? firstError || 'Algumas alteracoes continuam pendentes.' : '');
  }

  async function clearQueue() {
    writeQueue([]);
    setStatus({ state: 'synced', pending: 0, error: '' });
    await list();
  }

  async function subscribe() {
    if (channel) {
      return channel;
    }

    if (subscriptionPromise) {
      return subscriptionPromise;
    }

    subscriptionPromise = (async () => {
      try {
        const client = await getClient();

        if (!client) {
          return null;
        }

        channel = client
          .channel(`${adapter.table}-changes`)
          .on('postgres_changes', { event: '*', schema: 'public', table: adapter.table }, async () => {
            await list();
            emitChange({ type: 'realtime' });
          })
          .subscribe();

        return channel;
      } catch (error) {
        return null;
      } finally {
        subscriptionPromise = null;
      }
    })();

    return subscriptionPromise;
  }

  async function unsubscribe() {
    const nextChannel = channel || (subscriptionPromise ? await subscriptionPromise : null);

    if (!nextChannel) {
      channel = null;
      return;
    }

    try {
      const client = await getClient();

      if (client) {
        client.removeChannel(nextChannel);
      }
    } catch (error) {
      // Nothing else to clean up when the client cannot be reached.
    }

    channel = null;
  }

  return {
    list,
    save,
    remove,
    flushQueue,
    clearQueue,
    subscribe,
    unsubscribe,
    getSyncStatus() {
      return status;
    }
  };
}

function enqueueLatestOperation(queue, operation) {
  const operationId = operation.item?.id || operation.id;
  const existingIndex = queue.findIndex((candidate) => (
    candidate.action === operation.action
      && (candidate.item?.id || candidate.id) === operationId
  ));
  if (existingIndex < 0) return [...queue, operation];
  return queue.map((candidate, index) => (
    index === existingIndex
      ? { ...operation, createdAt: candidate.createdAt || operation.createdAt }
      : candidate
  ));
}
