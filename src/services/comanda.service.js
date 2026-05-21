import { STORAGE_KEYS, SYNC_EVENTS } from '../database/schema.js';
import { emit } from './event-bus.service.js';
import { getItem, setItem } from './storage.service.js';

export function getActiveComanda() {
  return getItem(STORAGE_KEYS.activeComanda, {
    id: 'comanda-local',
    number: 1,
    status: 'aberta',
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export function addItem(product) {
  if (!product) {
    console.warn('Produto inexistente. Item nao adicionado a comanda.');
    return getActiveComanda();
  }

  const comanda = getActiveComanda();
  const existingItem = comanda.items.find((item) => item.productId === product.id);

  if (existingItem) {
    existingItem.quantity += 1;
    existingItem.total = existingItem.quantity * existingItem.unitPrice;
  } else {
    comanda.items.push({
      productId: product.id,
      name: product.name,
      unitPrice: product.price,
      quantity: 1,
      total: product.price
    });
  }

  comanda.updatedAt = new Date().toISOString();
  saveComanda(comanda);
  emit(SYNC_EVENTS.comandaItemAdded, { comandaId: comanda.id, productId: product.id, comanda });

  return comanda;
}

export function removeItem(productId) {
  const comanda = getActiveComanda();
  comanda.items = comanda.items.filter((item) => item.productId !== productId);
  comanda.updatedAt = new Date().toISOString();
  saveComanda(comanda);
  emit(SYNC_EVENTS.comandaItemRemoved, { comandaId: comanda.id, productId, comanda });

  return comanda;
}

export function updateQuantity(productId, quantity) {
  const normalizedQuantity = Number(quantity);

  if (normalizedQuantity < 1) {
    return removeItem(productId);
  }

  const comanda = getActiveComanda();
  const item = comanda.items.find((currentItem) => currentItem.productId === productId);

  if (!item) {
    return comanda;
  }

  item.quantity = normalizedQuantity;
  item.total = item.quantity * item.unitPrice;
  comanda.updatedAt = new Date().toISOString();
  saveComanda(comanda);
  emit(SYNC_EVENTS.comandaQuantityChanged, { comandaId: comanda.id, productId, quantity: item.quantity, comanda });

  return comanda;
}

export function clearComanda() {
  const comanda = getActiveComanda();
  comanda.items = [];
  comanda.updatedAt = new Date().toISOString();
  saveComanda(comanda);
  emit(SYNC_EVENTS.comandaCleared, { comandaId: comanda.id, comanda });

  return comanda;
}

export function startNewComanda(number) {
  const newComanda = {
    id: `comanda-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    number,
    status: 'aberta',
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  saveComanda(newComanda);

  return newComanda;
}

export function getSubtotal(comanda = getActiveComanda()) {
  return comanda.items.reduce((total, item) => total + item.total, 0);
}

function saveComanda(comanda) {
  setItem(STORAGE_KEYS.activeComanda, comanda);
}
