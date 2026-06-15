import { STORAGE_KEYS } from '../src/database/schema.js';
import { setItem } from '../src/services/storage.service.js';
import { resolveShowcaseMovementUserName } from '../src/modules/estoque/estoque.module.js';

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

assert(
  resolveShowcaseMovementUserName('user-admin') === 'Administrador',
  'showcase movement should display user name instead of id'
);
assert(
  resolveShowcaseMovementUserName('b632d3e-b980-49f3-ac73-5f2c63dad3ec') === 'b632d3e-b980-49f3-ac73-5f2c63dad3ec',
  'unknown showcase movement user should fall back to id'
);
assert(resolveShowcaseMovementUserName('') === '-', 'blank showcase movement user should display dash');

console.log('estoque module ok');
