const listeners = new Map();

export function on(eventName, handler) {
  if (!listeners.has(eventName)) {
    listeners.set(eventName, new Set());
  }

  listeners.get(eventName).add(handler);

  return () => off(eventName, handler);
}

export function off(eventName, handler) {
  const eventListeners = listeners.get(eventName);

  if (eventListeners) {
    eventListeners.delete(handler);
  }
}

export function emit(eventName, payload = {}) {
  const eventListeners = listeners.get(eventName);

  if (!eventListeners) {
    return;
  }

  // Observers update secondary views; one broken observer must not reject an
  // already recorded operation or prevent the remaining observers from running.
  eventListeners.forEach((handler) => {
    try {
      const result = handler(payload);
      if (result?.then) Promise.resolve(result).catch((error) => console.warn(`Falha ao atualizar observador de ${eventName}.`, error));
    } catch (error) {
      console.warn(`Falha ao atualizar observador de ${eventName}.`, error);
    }
  });
}
