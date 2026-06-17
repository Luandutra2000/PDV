import { STORAGE_KEYS } from '../src/database/schema.js';
import { setItem } from '../src/services/storage.service.js';
import { readFile } from 'node:fs/promises';
import {
  resolveShowcaseMovementCommandReference,
  resolveShowcaseMovementUserName,
  initEstoqueModule
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
setItem(STORAGE_KEYS.currentSession, { userId: 'user-admin', startedAt: '2026-06-15T10:00:00.000Z' });

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

const estoqueSource = await readFile(new URL('../src/modules/estoque/estoque.module.js', import.meta.url), 'utf8');
assert(estoqueSource.includes('data-showcase-movements-more'), 'showcase history should expose a show more button');
assert(estoqueSource.includes('movementHistoryExpanded ? 30 : 8'), 'showcase history should start collapsed with fewer rows');

globalThis.localStorage.clear();
setItem(STORAGE_KEYS.users, [{
  id: 'user-denied',
  name: 'Operador bloqueado',
  username: 'bloqueado',
  password: '1234',
  role: 'operador',
  active: true
}]);
setItem(STORAGE_KEYS.currentSession, { userId: 'user-denied', startedAt: '2026-06-15T10:00:00.000Z' });
setItem(STORAGE_KEYS.userPermissionOverrides, {
  'user-denied': {
    'showcase.launch': 'deny',
    'showcase.edit': 'deny',
    'stock.writeoff': 'deny'
  }
});
setItem(STORAGE_KEYS.categories, [{ id: 'salgados', name: 'Salgados', showInShowcase: true }]);
setItem(STORAGE_KEYS.products, [{
  id: 'coxinha',
  name: 'Coxinha',
  categoryId: 'salgados',
  price: 8,
  stock: 0,
  active: true
}]);
setItem(STORAGE_KEYS.stockLaunches, [{
  id: 'launch-1',
  produtoId: 'coxinha',
  produtoNome: 'Coxinha',
  categoriaNome: 'Salgados',
  quantidade: 5,
  valorUnitario: 8,
  valorTotal: 40,
  status: 'ativo',
  dataHora: new Date().toISOString(),
  usuarioNome: 'Operador bloqueado'
}]);

const deniedContainer = {
  innerHTML: '',
  addEventListener() {},
  querySelector() {
    return null;
  }
};

initEstoqueModule(deniedContainer);
assert(!deniedContainer.innerHTML.includes('Lancar no estoque'), 'denied user should not see stock launch submit');
assert(!deniedContainer.innerHTML.includes('data-action="edit-launch"'), 'denied user should not see stock launch edit');
assert(!deniedContainer.innerHTML.includes('data-action="cancel-launch"'), 'denied user should not see stock launch cancel');
assert(!deniedContainer.innerHTML.includes('data-action="delete-comparison-row"'), 'denied user should not see destructive comparison action');

console.log('estoque module ok');
