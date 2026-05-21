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

  eventListeners.forEach((handler) => handler(payload));
}
