import { STORAGE_KEYS } from '../database/schema.js';
import { getItem } from './storage.service.js';

export function getCaixaSummary() {
  return getItem(STORAGE_KEYS.caixa, {
    status: 'fechado',
    currentAmount: 0,
    payments: {
      dinheiro: 0,
      pix: 0,
      debito: 0,
      credito: 0
    }
  });
}
