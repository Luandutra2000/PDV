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
      form: null,
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

function dispatchFieldChange(container, name, value, checked = false) {
  const type = name === 'active' ? 'checkbox' : 'text';

  container.listeners.change[0]({
    target: {
      name,
      value,
      checked,
      type,
      closest(selector) {
        if (selector === '[data-user-form]') {
          return {};
        }

        if (selector === '[data-people-screen]') {
          return {};
        }

        return null;
      }
    }
  });
}

function assertPermissionChecked(html, permissionId, message) {
  const permissionIndex = html.indexOf(`data-permission-id="${permissionId}"`);
  assert.notEqual(permissionIndex, -1, `${permissionId} checkbox should exist`);

  const checkboxFragment = html.slice(permissionIndex, html.indexOf('>', permissionIndex));
  assert(checkboxFragment.includes('checked'), message);
}

const storage = await import('../src/services/storage.service.js');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js');

store.clear();
storage.setItem('pdv.users', [{
  id: 'user-seed',
  name: 'Usuario Seed',
  username: 'seed',
  password: '1234',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', { userId: 'user-seed', startedAt: '2026-06-16T10:00:00.000Z' });
storage.setItem('pdv.userPermissionOverrides', {});
storage.setItem('pdv.auditLogs', []);

const container = new FakeElement();
initPessoasModule(container);

assert(container.innerHTML.includes('data-role-select'), 'role select should expose data-role-select');
assert(container.innerHTML.includes('data-action="delete-user"'), 'users.delete should render delete buttons for admin');
assert(container.innerHTML.includes('<option value="admin"'), 'role select should include admin');
assert(container.innerHTML.includes('>Administrador</option>'), 'role select should label admin');
assert(container.innerHTML.includes('<option value="gerente"'), 'role select should include gerente');
assert(container.innerHTML.includes('>Gerente</option>'), 'role select should label gerente');
assert(container.innerHTML.includes('<option value="operador"'), 'role select should include operador');
assert(container.innerHTML.includes('>Operador/Caixa</option>'), 'role select should label operador');
assert(container.innerHTML.includes('<option value="dono"'), 'role select should include dono');
assert(container.innerHTML.includes('>Visualizador/Dono</option>'), 'role select should label dono');
assert(container.innerHTML.includes('data-permission-checkbox'), 'permission checklist should expose data-permission-checkbox');
assert(!container.innerHTML.includes('Permissoes de'), 'people screen should not render the individual permissions panel');
assert(!container.innerHTML.includes('data-permission-select'), 'people screen should not render individual permission override selects');

dispatchFieldChange(container, 'name', 'Maria Gerente');
dispatchFieldChange(container, 'username', 'maria@example.test');
dispatchFieldChange(container, 'password', 'senha-secreta');
dispatchFieldChange(container, 'active', '', false);
dispatchRoleChange(container, 'gerente');

assert(container.innerHTML.includes('value="Maria Gerente"'), 'typed name should survive role change');
assert(container.innerHTML.includes('value="maria@example.test"'), 'typed username should survive role change');
assert(container.innerHTML.includes('value="senha-secreta"'), 'typed password should survive role change');
assert(!container.innerHTML.includes('name="active" checked'), 'typed inactive state should survive role change');

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
assertPermissionChecked(container.innerHTML, 'sales.discount', 'gerente checklist should check discount by default');

store.clear();
storage.setItem('pdv.users', [
  {
    id: 'viewer-user',
    name: 'Viewer',
    username: 'viewer',
    password: '1234',
    role: 'operador',
    active: true
  },
  {
    id: 'target-user',
    name: 'Alvo',
    username: 'alvo',
    password: '1234',
    role: 'operador',
    active: true
  }
]);
storage.setItem('pdv.currentSession', { userId: 'viewer-user', startedAt: '2026-06-16T11:00:00.000Z' });
storage.setItem('pdv.userPermissionOverrides', {
  'viewer-user': {
    'users.edit': 'allow',
    'permissions.manage': 'deny',
    'audit.view': 'deny'
  }
});
storage.setItem('pdv.auditLogs', [{
  id: 'audit-1',
  action: 'user.update',
  entityType: 'user',
  entityId: 'target-user',
  userName: 'Admin',
  createdAt: '2026-06-16T11:05:00.000Z'
}]);

const limitedContainer = new FakeElement();
initPessoasModule(limitedContainer);

assert(limitedContainer.innerHTML.includes('data-action="edit-user"'), 'users.edit should allow editing users from Pessoas');
assert(!limitedContainer.innerHTML.includes('data-action="new-user"'), 'users.edit alone should not allow creating users');
assert(!limitedContainer.innerHTML.includes('data-action="delete-user"'), 'users.edit alone should not allow deleting users');
assert(!limitedContainer.innerHTML.includes('data-permission-checkbox'), 'permissions.manage should be required for checklist editing');
assert(!limitedContainer.innerHTML.includes('data-permission-select'), 'individual permission override selects should not be rendered');
assert(!limitedContainer.innerHTML.includes('Permissoes de'), 'individual permissions panel should not be rendered');
assert(!limitedContainer.innerHTML.includes('user-audit-list'), 'audit.view should be required to render user audit history');

store.clear();
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};
storage.setItem('pdv.users', [{
  id: 'admin-online',
  name: 'Admin Online',
  username: 'admin@example.test',
  password: '',
  role: 'admin',
  active: true
}]);
storage.setItem('pdv.currentSession', {
  userId: 'admin-online',
  accessToken: 'admin-token',
  startedAt: '2026-06-17T12:00:00.000Z'
});
storage.setItem('pdv.userPermissionOverrides', {});
storage.setItem('pdv.auditLogs', []);

const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://example.supabase.co/functions/v1/admin-users', 'Pessoas should load users through admin-users function');
  assert.equal(options.headers.Authorization, 'Bearer admin-token', 'Pessoas should use the authenticated admin token');

  return {
    ok: true,
    async json() {
      return {
        users: [
          {
            id: 'admin-online',
            name: 'Admin Online',
            username: 'admin@example.test',
            role: 'admin',
            active: true
          },
          {
            id: 'remote-created-user',
            name: 'Novo Remoto',
            username: 'novo@example.test',
            role: 'operador',
            active: true
          }
        ]
      };
    }
  };
};

const onlineContainer = new FakeElement();
initPessoasModule(onlineContainer);
await new Promise((resolve) => setTimeout(resolve, 0));

assert(onlineContainer.innerHTML.includes('Novo Remoto'), 'Pessoas should render users loaded from Supabase');
assert(onlineContainer.innerHTML.includes('Operador/Caixa - Ativo'), 'remote user should use the loaded role in the list');

globalThis.fetch = originalFetch;
globalThis.__PDV_RUNTIME_CONFIG__ = null;

console.log('pessoas module ok');
