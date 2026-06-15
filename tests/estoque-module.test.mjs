import { STORAGE_KEYS } from '../src/database/schema.js';
import { setItem } from '../src/services/storage.service.js';
import {
  resolveShowcaseMovementCommandReference,
  resolveShowcaseMovementUserName
} from '../src/modules/estoque/estoque.module.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

globalThis.localStorage = {
  store: new Map(),
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  },
  setItem(key, value) {
    this.store.set(key, String(value));
  },
  removeItem(key) {
    this.store.delete(key);
  },
  clear() {
    this.store.clear();
  }
};

setItem(STORAGE_KEYS.users, [{
  id: 'user-admin',
  name: 'Administrador',
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  active: true
}]);
setItem(STORAGE_KEYS.closedComandas, [{
  id: 'comanda-12',
  number: 12,
  status: 'fechada'
}]);
setItem(STORAGE_KEYS.transactions, [{
  id: 'sale-13',
  type: 'venda',
  comandaId: 'comanda-13',
  comandaNumber: 13
}]);

assert(
  resolveShowcaseMovementUserName('user-admin') === 'Administrador',
  'showcase movement should display user name instead of id'
);
assert(
  resolveShowcaseMovementUserName('b632d3e-b980-49f3-ac73-5f2c63dad3ec') === 'b632d3e-b980-49f3-ac73-5f2c63dad3ec',
  'unknown showcase movement user should fall back to id'
);
assert(resolveShowcaseMovementUserName('') === '-', 'blank showcase movement user should display dash');
assert(
  resolveShowcaseMovementCommandReference({ commandId: 'comanda-12', saleId: 'sale-12' }) === 'Comanda 0012',
  'showcase movement should display command number when command is known'
);
assert(
  resolveShowcaseMovementCommandReference({ saleId: 'sale-13' }) === 'Comanda 0013',
  'showcase movement should display command number from sale when command id is missing'
);
assert(
  resolveShowcaseMovementCommandReference({ commandId: 'comanda-desconhecida', saleId: 'sale-unknown' }) === 'comanda-desconhecida',
  'unknown showcase movement command should fall back to command id'
);
assert(resolveShowcaseMovementCommandReference({}) === '-', 'blank showcase movement command should display dash');

console.log('estoque module ok');
