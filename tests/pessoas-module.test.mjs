import assert from 'node:assert/strict';

const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

class FakeElement {
  constructor() {
    this.innerHTML = '';
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(handler);
  }
}

function dispatchRoleChange(container, value) {
  container.listeners.change[0]({
    target: {
      value,
      closest(selector) {
        if (selector === '[data-role-select]') {
          return this;
        }

        if (selector === '[data-people-screen]') {
          return {};
        }

        return null;
      }
    }
  });
}

const storage = await import('../src/services/storage.service.js');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js');

store.clear();
storage.setItem('pdv.users', [{
  id: 'user-seed',
  name: 'Usuario Seed',
  username: 'seed',
  password: '1234',
  role: 'operador',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'user-seed', startedAt: '2026-06-16T10:00:00.000Z' });
storage.setItem('pdv.userPermissionOverrides', {});
storage.setItem('pdv.auditLogs', []);

const container = new FakeElement();
initPessoasModule(container);

assert(container.innerHTML.includes('data-role-select'), 'role select should expose data-role-select');
assert(container.innerHTML.includes('<option value="admin"'), 'role select should include admin');
assert(container.innerHTML.includes('>Administrador</option>'), 'role select should label admin');
assert(container.innerHTML.includes('<option value="gerente"'), 'role select should include gerente');
assert(container.innerHTML.includes('>Gerente</option>'), 'role select should label gerente');
assert(container.innerHTML.includes('<option value="operador"'), 'role select should include operador');
assert(container.innerHTML.includes('>Operador/Caixa</option>'), 'role select should label operador');
assert(container.innerHTML.includes('<option value="dono"'), 'role select should include dono');
assert(container.innerHTML.includes('>Visualizador/Dono</option>'), 'role select should label dono');
assert(container.innerHTML.includes('data-permission-checkbox'), 'permission checklist should expose data-permission-checkbox');

const expectedSelections = [
  ['admin', 'Administrador'],
  ['gerente', 'Gerente'],
  ['operador', 'Operador/Caixa'],
  ['dono', 'Visualizador/Dono']
];

for (const [role, label] of expectedSelections) {
  dispatchRoleChange(container, role);
  assert(
    container.innerHTML.includes(`<option value="${role}" selected>${label}</option>`),
    `${role} option should remain selected after change`
  );
}

dispatchRoleChange(container, 'admin');
assert(
  container.innerHTML.includes('data-permission-checkbox')
    && container.innerHTML.includes('disabled'),
  'admin checklist should be locked'
);

dispatchRoleChange(container, 'gerente');
assert(container.innerHTML.includes('Aplicar desconto'), 'gerente checklist should include discount permission');
assert(
  container.innerHTML.includes('data-permission-id="sales.discount"')
    && container.innerHTML.includes('checked'),
  'gerente checklist should check discount by default'
);

console.log('pessoas module ok');
