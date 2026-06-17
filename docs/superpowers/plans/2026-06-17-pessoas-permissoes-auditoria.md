# Pessoas Permissoes Auditoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir o perfil do modal Pessoas/Usuarios, centralizar permissoes, alinhar Supabase e aplicar bloqueios/auditoria reais nas acoes existentes.

**Architecture:** Manter `permission.service.js` como fachada publica e catalogo central para reduzir churn na base `c82798a`. O modulo Pessoas passara a ter estado explicito de modal (`modalRole` e `modalPermissions`), enquanto services sensiveis usam `requirePermission`/`assertPermission` para bloquear execucao mesmo quando botoes forem escondidos.

**Tech Stack:** JavaScript ES Modules, HTML/CSS puro, localStorage, testes Node `.mjs`, Supabase SQL migrations e Edge Function Deno para administracao de usuarios quando Supabase estiver ativo.

---

## File Structure

- Modify `src/services/permission.service.js`: catalogo central, defaults por perfil, aliases legados, `can`, `hasPermission`, `requirePermission`, `assertPermission` e auditoria de negacao.
- Modify `src/modules/pessoas/pessoas.module.js`: modal/fluxo de usuarios, perfil selecionado em estado, checklist por catalogo, auditoria administrativa e bloqueios no frontend.
- Modify `src/services/auth.service.js`: normalizar roles legados para `operador` ao salvar/carregar e proteger ultimo admin no caminho local.
- Modify `src/app.js`: usar chaves canonicas de permissao para rotas diretas.
- Modify `src/components/sidebar.component.js`: usar chaves canonicas de permissao para menus.
- Modify `src/services/financial.service.js`: trocar permissoes financeiras legadas pelas canonicas do checklist e diferenciar entrada/saida/pagar/cancelar.
- Modify `src/services/transaction.service.js`: diferenciar `cash.movement` para entrada e `cash.withdrawal` para saida/sangria; manter vendas e cancelamentos protegidos.
- Modify `src/services/estoque.service.js`: diferenciar `showcase.launch`, `showcase.edit` e `stock.writeoff`.
- Modify `src/modules/despesas/despesas.module.js`, `src/modules/vendas/vendas.module.js`, `src/modules/estoque/estoque.module.js`, `src/modules/produtos/produtos.module.js`, `src/modules/mobile/mobile-dashboard.module.js`: esconder/desabilitar botoes conforme permissao quando necessario, deixando service como barreira real.
- Create `src/services/user-admin.service.js`: camada comum para create/update/checklist local e Supabase.
- Create `supabase/functions/admin-users/index.ts`: operacoes administrativas com service role, autorizacao por perfil/permissao e auditoria.
- Create `supabase/migrations/202606170001_align_people_permissions_audit.sql`: roles, permissoes, defaults, overrides, policies e funcao de permissao.
- Create `tests/pessoas-module.test.mjs`: modal, perfil e checklist.
- Modify `tests/permission-service.test.mjs`: catalogo canonical, aliases e denied audit.
- Create `tests/people-permissions-migration.test.mjs`: migration contem permissoes e policies.
- Create `tests/admin-users-function.test.mjs`: Edge Function nao usa `user_metadata` para autorizacao e exige permissoes corretas.
- Modify existing module/service tests as needed: `tests/financial-service.test.mjs`, `tests/transaction-service.test.mjs`, `tests/estoque-service.test.mjs`, `tests/vercel-cache-config.test.mjs`.

---

### Task 1: Central Permission Catalog And Helpers

**Files:**
- Modify: `src/services/permission.service.js`
- Modify: `tests/permission-service.test.mjs`

- [ ] **Step 1: Write failing catalog/helper tests**

Append these assertions to `tests/permission-service.test.mjs` after current role assertions:

```js
const requiredCatalogShape = permissions.PERMISSIONS.every((permission) => (
  permission.id
    && permission.key === permission.id
    && permission.label
    && permission.name === permission.label
    && permission.description
    && permission.group
    && permission.module
    && Array.isArray(permission.defaultRoles)
));
assert(requiredCatalogShape, 'every permission should expose canonical catalog metadata');

const expectedPermissionIds = [
  'sales.access',
  'sales.create',
  'sales.cancel',
  'sales.discount',
  'cash.movement',
  'cash.withdrawal',
  'cash.close',
  'cash.balance.view',
  'showcase.access',
  'showcase.launch',
  'showcase.edit',
  'stock.writeoff',
  'products.manage',
  'categories.manage',
  'reports.view',
  'crm.view',
  'owner_app.view',
  'financial.expense.access',
  'financial.income.create',
  'financial.expense.create',
  'financial.entries.edit',
  'financial.entries.delete',
  'financial.categories.manage',
  'financial.bill.pay',
  'users.manage',
  'users.edit',
  'permissions.manage',
  'audit.view',
  'data.export'
];

assert(
  expectedPermissionIds.every((permissionId) => permissions.PERMISSIONS.some((permission) => permission.id === permissionId)),
  'catalog should include every requested permission'
);
assert(
  permissions.PERMISSIONS.every((permission) => expectedPermissionIds.includes(permission.id)),
  'catalog should not expose duplicate legacy permissions'
);
assert(permissions.resolvePermissionId('financial.view') === 'financial.expense.access', 'financial.view should map to canonical access permission');
assert(permissions.resolvePermissionId('financial.transaction.create') === 'financial.income.create', 'legacy create should map to income create by default');
assert(permissions.resolvePermissionId('financial.payable.pay') === 'financial.bill.pay', 'legacy payable pay should map to canonical bill pay');
assert(permissions.normalizeRole('caixa') === 'operador', 'caixa should normalize to operador');
assert(permissions.normalizeRole('operator') === 'operador', 'operator should normalize to operador');
assert(permissions.can('sales.create', operator), 'can should check an explicit user');
assertThrows(
  () => permissions.requirePermission('sales.discount', operator),
  'Usuario sem permissao para esta acao.',
  'requirePermission should throw for denied actions'
);
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected: FAIL mentioning missing `key`, `module`, `defaultRoles`, `resolvePermissionId`, `can`, or `requirePermission`.

- [ ] **Step 3: Implement catalog and helpers**

Replace `PERMISSIONS` and defaults in `src/services/permission.service.js` with catalog entries like:

```js
const PERMISSION_CATALOG = [
  {
    id: 'sales.access',
    key: 'sales.access',
    label: 'Acessar frente de caixa',
    name: 'Acessar frente de caixa',
    group: 'Vendas',
    module: 'Vendas',
    description: 'Permite abrir a frente de caixa e comandas.',
    defaultRoles: ['admin', 'gerente', 'operador']
  },
  {
    id: 'sales.create',
    key: 'sales.create',
    label: 'Finalizar venda',
    name: 'Finalizar venda',
    group: 'Vendas',
    module: 'Vendas',
    description: 'Permite concluir comandas e registrar pagamentos.',
    defaultRoles: ['admin', 'gerente', 'operador']
  },
  {
    id: 'sales.cancel',
    key: 'sales.cancel',
    label: 'Cancelar venda',
    name: 'Cancelar venda',
    group: 'Vendas',
    module: 'Vendas',
    description: 'Permite cancelar comandas ja lancadas.',
    defaultRoles: ['admin', 'gerente']
  }
];
```

Include all 29 canonical permissions listed in Step 1. Use these role defaults:

```js
const DEFAULT_ROLE_IDS = ['admin', 'gerente', 'operador', 'dono'];
const LEGACY_PERMISSION_ALIASES = {
  'financial.view': 'financial.expense.access',
  'financial.transaction.create': 'financial.income.create',
  'financial.transaction.edit': 'financial.entries.edit',
  'financial.transaction.cancel': 'financial.entries.delete',
  'financial.category.manage': 'financial.categories.manage',
  'financial.payable.pay': 'financial.bill.pay'
};
```

Add/adjust exported helpers:

```js
export const PERMISSIONS = PERMISSION_CATALOG;

export const ROLE_PERMISSION_DEFAULTS = DEFAULT_ROLE_IDS.reduce((defaults, role) => {
  defaults[role] = PERMISSIONS
    .filter((permission) => permission.defaultRoles.includes(role) || role === ROLES.admin)
    .map((permission) => permission.id);
  return defaults;
}, {});

ROLE_PERMISSION_DEFAULTS.caixa = ROLE_PERMISSION_DEFAULTS.operador;
ROLE_PERMISSION_DEFAULTS.operator = ROLE_PERMISSION_DEFAULTS.operador;

export function resolvePermissionId(permissionId) {
  return LEGACY_PERMISSION_ALIASES[permissionId] || permissionId;
}

export function normalizeRole(role) {
  if (role === ROLES.operator || role === ROLES.caixa) {
    return ROLES.operador;
  }

  return role || ROLES.operador;
}

export function can(permissionId, user = getCurrentUserSafe()) {
  return hasPermission(user, permissionId);
}

export function requirePermission(permissionId, user = getCurrentUserSafe(), metadata = {}) {
  if (!hasPermission(user, permissionId)) {
    recordPermissionDenied(user, permissionId, metadata);
    throw new Error('Usuario sem permissao para esta acao.');
  }
}

export function assertPermission(user, permissionId, metadata = {}) {
  requirePermission(permissionId, user, metadata);
}
```

Avoid a static top-level import cycle from `auth.service.js`; use dynamic-safe local helpers:

```js
function getCurrentUserSafe() {
  return null;
}

function recordPermissionDenied(user, permissionId, metadata = {}) {
  const logs = getItem(STORAGE_KEYS.auditLogs, []);
  const entry = {
    id: `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    action: 'permission.denied',
    entityType: 'permission',
    entityId: resolvePermissionId(permissionId),
    userId: user?.id || '',
    userName: user?.name || 'Sistema',
    reason: 'Usuario sem permissao para esta acao.',
    metadata: {
      permissionId: resolvePermissionId(permissionId),
      ...metadata
    },
    createdAt: new Date().toISOString()
  };
  setItem(STORAGE_KEYS.auditLogs, [entry, ...logs]);
}
```

If a real current-user `can(permission)` is needed later, update `can` call sites to pass the user explicitly instead of introducing a cycle.

- [ ] **Step 4: Run test and verify it passes**

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected: `permission service ok`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/services/permission.service.js tests/permission-service.test.mjs
git commit -m "feat: centralize permission catalog"
```

---

### Task 2: Pessoas Modal Role State And Checklist

**Files:**
- Modify: `src/modules/pessoas/pessoas.module.js`
- Create: `tests/pessoas-module.test.mjs`

- [ ] **Step 1: Write failing Pessoas module test**

Create `tests/pessoas-module.test.mjs`:

```js
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

  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }
}

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js');
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js');

storage.ensureSeedData();
storage.setItem(STORAGE_KEYS.users, [
  {
    id: 'admin-1',
    name: 'Admin',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true,
    createdAt: '2026-06-17T10:00:00.000Z',
    updatedAt: '2026-06-17T10:00:00.000Z'
  }
]);

const container = new FakeElement();
initPessoasModule(container);

assert(container.innerHTML.includes('Novo usuario') || container.innerHTML.includes('Cadastrar usuario'), 'people screen should render user form');
assert(container.innerHTML.includes('Administrador'), 'role select should include Administrador');
assert(container.innerHTML.includes('Gerente'), 'role select should include Gerente');
assert(container.innerHTML.includes('Operador/Caixa'), 'role select should include Operador/Caixa');
assert(container.innerHTML.includes('Visualizador/Dono'), 'role select should include Visualizador/Dono');
assert(container.innerHTML.includes('data-role-select'), 'role select should expose data-role-select');
assert(container.innerHTML.includes('data-permission-checkbox'), 'modal should render checkbox checklist');

container.listeners.change({
  target: {
    matches(selector) {
      return selector === '[data-role-select]';
    },
    closest(selector) {
      return selector === '[data-people-screen]' ? true : null;
    },
    value: 'admin'
  }
});

assert(container.innerHTML.includes('<option value="admin" selected>Administrador</option>'), 'admin should stay selected after change');
assert(!container.innerHTML.includes('data-permission-checkbox') || container.innerHTML.includes('disabled'), 'admin checklist should be locked');

container.listeners.change({
  target: {
    matches(selector) {
      return selector === '[data-role-select]';
    },
    closest(selector) {
      return selector === '[data-people-screen]' ? true : null;
    },
    value: 'gerente'
  }
});

assert(container.innerHTML.includes('<option value="gerente" selected>Gerente</option>'), 'gerente should stay selected after change');
assert(container.innerHTML.includes('Aplicar desconto'), 'gerente checklist should include sales discount');

container.listeners.change({
  target: {
    matches(selector) {
      return selector === '[data-role-select]';
    },
    closest(selector) {
      return selector === '[data-people-screen]' ? true : null;
    },
    value: 'operador'
  }
});

assert(container.innerHTML.includes('<option value="operador" selected>Operador/Caixa</option>'), 'operator should stay selected after change');

container.listeners.change({
  target: {
    matches(selector) {
      return selector === '[data-role-select]';
    },
    closest(selector) {
      return selector === '[data-people-screen]' ? true : null;
    },
    value: 'dono'
  }
});

assert(container.innerHTML.includes('<option value="dono" selected>Visualizador/Dono</option>'), 'owner viewer should stay selected after change');

console.log('pessoas module ok');
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node tests\pessoas-module.test.mjs
```

Expected: FAIL because the current form only has `operator/admin` and no checklist checkbox flow.

- [ ] **Step 3: Implement modal role state**

In `src/modules/pessoas/pessoas.module.js`, add:

```js
const ROLE_OPTIONS = [
  { id: 'admin', label: 'Administrador' },
  { id: 'gerente', label: 'Gerente' },
  { id: 'operador', label: 'Operador/Caixa' },
  { id: 'dono', label: 'Visualizador/Dono' }
];

const peopleState = {
  editingUserId: null,
  selectedUserId: null,
  modalRole: 'operador',
  modalPermissions: {}
};
```

When clicking `new-user`:

```js
peopleState.editingUserId = null;
peopleState.modalRole = 'operador';
peopleState.modalPermissions = buildRolePermissionState('operador');
renderPeople(container);
```

When clicking `edit-user`:

```js
const user = getUsers().find((candidate) => candidate.id === button.dataset.userId);
peopleState.editingUserId = button.dataset.userId;
peopleState.selectedUserId = button.dataset.userId;
peopleState.modalRole = normalizeRole(user?.role || 'operador');
peopleState.modalPermissions = user ? buildUserPermissionState(user) : buildRolePermissionState(peopleState.modalRole);
renderPeople(container);
```

Add role change handling:

```js
if (event.target.matches('[data-role-select]')) {
  peopleState.modalRole = normalizeRole(event.target.value);
  peopleState.modalPermissions = buildRolePermissionState(peopleState.modalRole);
  renderPeople(container);
  return;
}

if (event.target.matches('[data-permission-checkbox]')) {
  peopleState.modalPermissions[event.target.value] = event.target.checked;
  return;
}
```

Update `renderUserForm(user)` role select:

```js
const role = peopleState.modalRole || normalizeRole(user?.role || 'operador');
```

Render options with exact selected attributes:

```js
<select class="field" name="role" data-role-select required>
  ${ROLE_OPTIONS.map((option) => `<option value="${option.id}" ${role === option.id ? 'selected' : ''}>${option.label}</option>`).join('')}
</select>
```

Render checklist below fields:

```js
<div class="permission-checklist">
  ${groupPermissions().map(([group, permissions]) => `
    <section class="permission-group">
      <h3>${escapeHtml(group)}</h3>
      ${permissions.map((permission) => renderPermissionCheckbox(role, permission)).join('')}
    </section>
  `).join('')}
</div>
```

Add helpers:

```js
function renderPermissionCheckbox(role, permission) {
  const checked = Object.hasOwn(peopleState.modalPermissions, permission.id)
    ? peopleState.modalPermissions[permission.id]
    : getRolePermissions(role).includes(permission.id);
  const disabled = role === 'admin';

  return `
    <label class="permission-check">
      <input
        type="checkbox"
        name="permissions"
        value="${permission.id}"
        data-permission-checkbox
        ${checked || disabled ? 'checked' : ''}
        ${disabled ? 'disabled' : ''}
      >
      <span>
        <strong>${escapeHtml(permission.label)}</strong>
        <small>${escapeHtml(permission.description || '')}</small>
      </span>
    </label>
  `;
}

function buildRolePermissionState(role) {
  const defaults = new Set(role === 'admin' ? PERMISSIONS.map((permission) => permission.id) : getRolePermissions(role));
  return PERMISSIONS.reduce((state, permission) => {
    state[permission.id] = defaults.has(permission.id);
    return state;
  }, {});
}

function buildUserPermissionState(user) {
  return PERMISSIONS.reduce((state, permission) => {
    state[permission.id] = isPermissionAllowed(user, permission.id);
    return state;
  }, {});
}
```

Import `normalizeRole` and `hasPermission` from `permission.service.js`.

- [ ] **Step 4: Run test and verify it passes**

Run:

```powershell
node tests\pessoas-module.test.mjs
node tests\permission-service.test.mjs
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/modules/pessoas/pessoas.module.js tests/pessoas-module.test.mjs
git commit -m "fix: keep selected people profile state"
```

---

### Task 3: User Admin Save, Overrides And Last Admin Protection

**Files:**
- Create: `src/services/user-admin.service.js`
- Modify: `src/modules/pessoas/pessoas.module.js`
- Modify: `src/services/auth.service.js`
- Create: `tests/user-admin-service.test.mjs`
- Modify: `tests/auth-service.test.mjs`

- [ ] **Step 1: Write failing user admin tests**

Create `tests/user-admin-service.test.mjs`:

```js
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

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrowsAsync = async (callback, expectedMessage, message) => {
  try {
    await callback();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `${message}: got "${error.message}"`);
    return;
  }
  throw new Error(message);
};

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const admin = await import('../src/services/user-admin.service.js');
const auth = await import('../src/services/auth.service.js');

storage.ensureSeedData();
storage.setItem(STORAGE_KEYS.users, [
  { id: 'admin-1', name: 'Admin', username: 'admin', password: 'admin123', role: 'admin', active: true },
  { id: 'gerente-1', name: 'G', username: 'g', password: '123', role: 'gerente', active: true }
]);

const created = await admin.createManagedUser({
  name: 'Novo Gerente',
  username: 'gerente@teste.com',
  password: '123456',
  role: 'gerente',
  active: true
});
assert(created.role === 'gerente', 'local create should preserve gerente role');

const updated = await admin.updateManagedUser(created.id, { role: 'dono', active: true });
assert(updated.role === 'dono', 'local update should preserve owner viewer role');

await admin.saveManagedPermissionChecklist(updated, {
  'owner_app.view': true,
  'sales.access': false
});
const overrides = storage.getItem(STORAGE_KEYS.userPermissionOverrides, {});
assert(overrides[updated.id]['sales.access'] === 'deny', 'checklist should save deny override');

await assertThrowsAsync(
  () => admin.updateManagedUser('admin-1', { active: false }),
  'Nao e permitido desativar o ultimo administrador ativo.',
  'last active admin should be protected'
);

const users = auth.getUsers();
assert(users.find((user) => user.id === updated.id).role === 'dono', 'auth cache should load saved role');

console.log('user admin service ok');
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```powershell
node tests\user-admin-service.test.mjs
```

Expected: FAIL because `user-admin.service.js` does not exist.

- [ ] **Step 3: Implement local user admin service**

Create `src/services/user-admin.service.js`:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { createUser, getUsers, updateUser } from './auth.service.js';
import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js';
import { getItem, setItem } from './storage.service.js';
import {
  PERMISSIONS,
  getRolePermissions,
  normalizeRole,
  setUserPermissionOverride
} from './permission.service.js';

export async function createManagedUser(input) {
  if (isSupabaseEnabled()) {
    const user = await invokeAdminUsers('createUser', input);
    cacheManagedUser(user);
    return user;
  }

  return createUser({ ...input, role: normalizeRole(input.role) });
}

export async function updateManagedUser(userId, patch) {
  assertNotLastActiveAdmin(userId, patch);

  if (isSupabaseEnabled()) {
    const user = await invokeAdminUsers('updateUser', { id: userId, ...patch, role: patch.role ? normalizeRole(patch.role) : undefined });
    cacheManagedUser(user);
    return user;
  }

  return updateUser(userId, { ...patch, role: patch.role ? normalizeRole(patch.role) : patch.role });
}

export async function saveManagedPermissionChecklist(user, checklist) {
  if (!user?.id || normalizeRole(user.role) === 'admin') {
    return;
  }

  const overrides = buildPermissionOverrides(user, checklist);

  if (isSupabaseEnabled()) {
    await invokeAdminUsers('savePermissionOverrides', {
      userId: user.id,
      overrides
    });
  }

  overrides.forEach((override) => {
    setUserPermissionOverride(user.id, override.permissionId, override.state);
  });
}

function buildPermissionOverrides(user, checklist = {}) {
  const defaults = new Set(getRolePermissions(user.role));

  return PERMISSIONS.map((permission) => {
    const checked = Boolean(checklist[permission.id]);
    const defaultChecked = defaults.has(permission.id);
    return {
      permissionId: permission.id,
      state: checked === defaultChecked ? 'default' : checked ? 'allow' : 'deny'
    };
  });
}
```

Add `assertNotLastActiveAdmin`, `invokeAdminUsers`, `cacheManagedUser`, and `getAccessTokenFallback` based on the existing patterns in `auth.service.js` and `app-config.service.js`. `assertNotLastActiveAdmin` must count active admins from `getUsers()` and throw:

```js
throw new Error('Nao e permitido desativar o ultimo administrador ativo.');
```

when the target admin would become inactive or non-admin.

- [ ] **Step 4: Wire Pessoas submit to user admin service**

In `src/modules/pessoas/pessoas.module.js`, replace `createUser/updateUser` imports with:

```js
import {
  createManagedUser,
  saveManagedPermissionChecklist,
  updateManagedUser
} from '../../services/user-admin.service.js';
```

In submit handler, use:

```js
const user = editingUserId
  ? await updateManagedUser(editingUserId, payload)
  : await createManagedUser(payload);

await saveManagedPermissionChecklist(user, peopleState.modalPermissions);
```

Record `user.role.change` when the previous role differs from the saved role:

```js
if (previousUser && normalizeRole(previousUser.role) !== normalizeRole(user.role)) {
  recordAudit({
    action: 'user.role.change',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      fromRole: normalizeRole(previousUser.role),
      toRole: normalizeRole(user.role)
    }
  });
}
```

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
node tests\user-admin-service.test.mjs
node tests\pessoas-module.test.mjs
node tests\auth-service.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/services/user-admin.service.js src/modules/pessoas/pessoas.module.js src/services/auth.service.js tests/user-admin-service.test.mjs tests/auth-service.test.mjs
git commit -m "feat: save managed users and permission checklist"
```

---

### Task 4: Apply Canonical Permission Enforcement

**Files:**
- Modify: `src/app.js`
- Modify: `src/components/sidebar.component.js`
- Modify: `src/services/financial.service.js`
- Modify: `src/services/transaction.service.js`
- Modify: `src/services/estoque.service.js`
- Modify: relevant module tests

- [ ] **Step 1: Write failing action-permission assertions**

Add to `tests/financial-service.test.mjs`:

```js
permissions.setUserPermissionOverride('operator-1', 'financial.income.create', 'allow');
permissions.setUserPermissionOverride('operator-1', 'financial.expense.create', 'deny');
auth.login({ username: 'operador', password: '123456' });

financial.createFinancialTransaction({
  type: 'income',
  description: 'Entrada permitida',
  amount: 10,
  categoryId: 'aporte-dono',
  status: 'paid'
});

assertThrows(
  () => financial.createFinancialTransaction({
    type: 'expense',
    description: 'Saida bloqueada',
    amount: 10,
    categoryId: 'fornecedor',
    status: 'paid'
  }),
  'Usuario sem permissao para esta acao.',
  'expense create should require financial.expense.create'
);
```

Add to `tests/transaction-service.test.mjs`:

```js
permissions.setUserPermissionOverride(operator.id, 'cash.movement', 'allow');
permissions.setUserPermissionOverride(operator.id, 'cash.withdrawal', 'deny');
auth.login({ username: operator.username, password: operator.password });

transactions.registerCashMovement({
  type: 'entrada',
  amount: 5,
  category: 'reforco-caixa',
  description: 'Entrada permitida'
});

assertThrows(
  () => transactions.registerCashMovement({
    type: 'saida',
    amount: 5,
    category: 'fornecedor',
    description: 'Saida bloqueada'
  }),
  'Usuario sem permissao para esta acao.',
  'cash output should require cash.withdrawal'
);
```

- [ ] **Step 2: Run targeted tests and verify fail**

Run:

```powershell
node tests\financial-service.test.mjs
node tests\transaction-service.test.mjs
```

Expected: FAIL because services still use legacy/broad permissions.

- [ ] **Step 3: Update route/menu permissions**

In `src/app.js`, set:

```js
const routePermissions = {
  'frente-caixa': 'sales.access',
  dashboard: 'reports.view',
  produtos: 'products.manage',
  estoque: 'showcase.access',
  'fechar-caixa': 'cash.close',
  relatorios: 'reports.view',
  mobile: 'owner_app.view',
  pessoas: 'users.manage',
  despesas: 'financial.expense.access'
};
```

In `src/components/sidebar.component.js`, use `financial.expense.access` for the Financeiro menu.

- [ ] **Step 4: Update services with canonical permissions**

In `src/services/financial.service.js`, change:

```js
assertPermission(user, input.type === 'income' || input.type === 'entrada'
  ? 'financial.income.create'
  : 'financial.expense.create');
```

For pay:

```js
assertPermission(user, 'financial.bill.pay');
```

For cancel/delete:

```js
assertPermission(user, 'financial.entries.delete');
```

If edit/upsert is user-facing, protect with:

```js
assertPermission(user, 'financial.entries.edit');
```

In `src/services/transaction.service.js`, before validating type:

```js
const requiredPermission = type === 'entrada' ? 'cash.movement' : 'cash.withdrawal';
assertPermission(user, requiredPermission);
```

In `src/services/estoque.service.js`:

```js
assertPermission(user, 'showcase.launch'); // createStockLaunch
assertPermission(user, 'showcase.edit'); // updateStockLaunch and cancelStockLaunch
assertPermission(user, 'stock.writeoff'); // createShowcaseWriteOff
```

- [ ] **Step 5: Run targeted tests and verify pass**

Run:

```powershell
node tests\financial-service.test.mjs
node tests\transaction-service.test.mjs
node tests\estoque-service.test.mjs
node tests\permission-service.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/app.js src/components/sidebar.component.js src/services/financial.service.js src/services/transaction.service.js src/services/estoque.service.js tests
git commit -m "feat: enforce canonical permissions"
```

---

### Task 5: Supabase Alignment

**Files:**
- Create: `supabase/migrations/202606170001_align_people_permissions_audit.sql`
- Create: `supabase/functions/admin-users/index.ts`
- Create: `tests/people-permissions-migration.test.mjs`
- Create: `tests/admin-users-function.test.mjs`
- Modify: `src/services/user-admin.service.js`
- Modify: `src/services/providers/supabase.provider.js`

- [ ] **Step 1: Write migration and function tests**

Create `tests/people-permissions-migration.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const sql = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/202606170001_align_people_permissions_audit.sql', import.meta.url)),
  'utf8'
);

[
  'sales.access',
  'sales.create',
  'sales.cancel',
  'sales.discount',
  'cash.movement',
  'cash.withdrawal',
  'cash.close',
  'cash.balance.view',
  'showcase.access',
  'showcase.launch',
  'showcase.edit',
  'stock.writeoff',
  'products.manage',
  'categories.manage',
  'reports.view',
  'crm.view',
  'owner_app.view',
  'financial.expense.access',
  'financial.income.create',
  'financial.expense.create',
  'financial.entries.edit',
  'financial.entries.delete',
  'financial.categories.manage',
  'financial.bill.pay',
  'users.manage',
  'users.edit',
  'permissions.manage',
  'audit.view',
  'data.export'
].forEach((permissionId) => {
  assert(sql.includes(`'${permissionId}'`), `migration should include ${permissionId}`);
});

assert(sql.includes('create table if not exists public.user_permission_overrides'), 'migration should create overrides table');
assert(sql.includes('private.current_profile_has_permission'), 'migration should update permission helper');
assert(sql.includes("p.role_id = 'admin'"), 'admin should be allowed by database helper');

console.log('people permissions migration ok');
```

Create `tests/admin-users-function.test.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const source = readFileSync(
  fileURLToPath(new URL('../supabase/functions/admin-users/index.ts', import.meta.url)),
  'utf8'
);

assert(source.includes("requirePermission(actor.id, 'users.manage'"), 'create should require users.manage');
assert(source.includes("requirePermission(actor.id, 'users.edit'"), 'update should require users.edit');
assert(source.includes("requirePermission(actor.id, 'permissions.manage'"), 'checklist should require permissions.manage');
assert(source.includes('assertNotLastActiveAdmin'), 'function should protect last active admin');
assert(source.includes('user_permission_overrides'), 'function should save permission overrides');
assert(source.includes('permission.denied'), 'function should audit denied attempts');
assert(!source.includes('user_metadata.role'), 'function should not authorize from user metadata');

console.log('admin users function ok');
```

- [ ] **Step 2: Run tests and verify fail**

Run:

```powershell
node tests\people-permissions-migration.test.mjs
node tests\admin-users-function.test.mjs
```

Expected: FAIL because files do not exist.

- [ ] **Step 3: Add Supabase migration**

Create SQL with these core sections:

```sql
insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('gerente', 'Gerente'),
  ('operador', 'Operador/Caixa'),
  ('dono', 'Visualizador/Dono')
on conflict (id) do update set name = excluded.name;

update public.profiles set role_id = 'operador' where role_id in ('caixa', 'operator');

insert into public.permissions (id, description) values
  ('sales.access', 'Acessar frente de caixa'),
  ('sales.create', 'Finalizar venda'),
  ('sales.cancel', 'Cancelar venda'),
  ('sales.discount', 'Aplicar desconto'),
  ('cash.movement', 'Registrar entrada'),
  ('cash.withdrawal', 'Registrar saida'),
  ('cash.close', 'Fechar caixa'),
  ('cash.balance.view', 'Ver saldo do caixa'),
  ('showcase.access', 'Acessar vitrine'),
  ('showcase.launch', 'Lancar producao'),
  ('showcase.edit', 'Editar vitrine'),
  ('stock.writeoff', 'Baixar estoque'),
  ('products.manage', 'Gerenciar produtos'),
  ('categories.manage', 'Gerenciar categorias'),
  ('reports.view', 'Ver relatorios'),
  ('crm.view', 'Ver CRM'),
  ('owner_app.view', 'Acessar app do dono'),
  ('financial.expense.access', 'Acessar despesas'),
  ('financial.income.create', 'Criar entrada financeira'),
  ('financial.expense.create', 'Criar saida financeira'),
  ('financial.entries.edit', 'Editar lancamentos financeiros'),
  ('financial.entries.delete', 'Excluir lancamentos financeiros'),
  ('financial.categories.manage', 'Gerenciar categorias financeiras'),
  ('financial.bill.pay', 'Marcar conta como paga'),
  ('users.manage', 'Cadastrar usuarios'),
  ('users.edit', 'Editar usuarios'),
  ('permissions.manage', 'Editar permissoes'),
  ('audit.view', 'Ver auditoria'),
  ('data.export', 'Exportar dados')
on conflict (id) do update set description = excluded.description;
```

Delete and reinsert role defaults for `admin`, `gerente`, `operador`, `dono`. Create `user_permission_overrides`, enable RLS, and define `private.current_profile_has_permission(_permission_id text)` to allow admin, explicit `allow`, and role defaults unless explicit `deny`.

- [ ] **Step 4: Add Edge Function**

Create `supabase/functions/admin-users/index.ts` based on Deno and `@supabase/supabase-js@2`, with actions:

```ts
type AdminAction = 'createUser' | 'updateUser' | 'savePermissionOverrides';
```

Implement server-side:

```ts
await requirePermission(actor.id, 'users.manage'); // createUser
await requirePermission(actor.id, 'users.edit', 'users.manage'); // updateUser
await requirePermission(actor.id, 'permissions.manage'); // savePermissionOverrides
```

On denied permission, call:

```ts
await recordAudit(actor, {
  action: 'permission.denied',
  entityType: 'permission',
  entityId: permissionIds.join(','),
  details: 'Tentativa bloqueada por falta de permissao'
});
```

Normalize roles with only `admin`, `gerente`, `operador`, `dono`. Map `caixa` and `operator` to `operador`.

- [ ] **Step 5: Run tests and verify pass**

Run:

```powershell
node tests\people-permissions-migration.test.mjs
node tests\admin-users-function.test.mjs
node tests\supabase-provider.test.mjs
node tests\user-admin-service.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add supabase/migrations/202606170001_align_people_permissions_audit.sql supabase/functions/admin-users/index.ts tests/people-permissions-migration.test.mjs tests/admin-users-function.test.mjs src/services/user-admin.service.js src/services/providers/supabase.provider.js
git commit -m "feat: align supabase people permissions"
```

---

### Task 6: UI Gating And Blocked Audit Polish

**Files:**
- Modify: `src/modules/despesas/despesas.module.js`
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `src/modules/estoque/estoque.module.js`
- Modify: `src/modules/produtos/produtos.module.js`
- Modify: `src/modules/mobile/mobile-dashboard.module.js`
- Modify: relevant tests

- [ ] **Step 1: Add module render tests for hidden buttons**

In existing module tests, assert operator render output does not expose advanced actions when denied. Example for finance:

```js
assert(!htmlForOperator.includes('data-finance-action="open-expense"'), 'operator without expense permission should not see expense button');
assert(!htmlForOperator.includes('data-payable-id='), 'operator without bill pay permission should not see pay button');
```

For estoque:

```js
assert(!htmlForViewer.includes('data-action="cancel-launch"'), 'viewer without showcase.edit should not see cancel launch');
assert(!htmlForViewer.includes('data-action="delete-comparison-row"'), 'viewer without stock.writeoff should not see writeoff/delete action');
```

- [ ] **Step 2: Run module tests and verify fail**

Run:

```powershell
node tests\despesas-module.test.mjs
node tests\estoque-module.test.mjs
node tests\mobile-dashboard-module.test.mjs
```

Expected: FAIL where buttons are currently unconditional.

- [ ] **Step 3: Hide buttons with explicit user checks**

In each module, import:

```js
import { getCurrentUser } from '../../services/auth.service.js';
import { hasPermission } from '../../services/permission.service.js';
```

Use helpers:

```js
function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
}
```

Render buttons conditionally:

```js
${canCurrentUser('financial.income.create') ? '<button class="button button--success" type="button" data-finance-action="open-income">+ Entrada</button>' : ''}
${canCurrentUser('financial.expense.create') ? '<button class="button button--danger" type="button" data-finance-action="open-expense">- Saida</button>' : ''}
${canCurrentUser('financial.bill.pay') ? `<button class="button button--small" type="button" data-payable-id="${transaction.id}">Pagar</button>` : ''}
```

Keep all service validations from Task 4, because UI gating is not security by itself.

- [ ] **Step 4: Run module tests and verify pass**

Run:

```powershell
node tests\despesas-module.test.mjs
node tests\estoque-module.test.mjs
node tests\mobile-dashboard-module.test.mjs
node tests\vendas-module.test.mjs
```

Expected: all existing/updated module tests pass. If `tests\vendas-module.test.mjs` does not exist in this base, skip it and rely on service tests for vendas.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/modules tests
git commit -m "feat: gate permissioned action buttons"
```

---

### Task 7: Cache Version And Full Verification

**Files:**
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `tests/vercel-cache-config.test.mjs`

- [ ] **Step 1: Update cache/version tests**

In `tests/vercel-cache-config.test.mjs`, update expected app query/cache references to the next version:

```js
assert(index.includes('app.js?v=20260617-01'), 'index should reference app deploy cache version');
assert(serviceWorker.includes("pdv-v53"), 'service worker should use pdv-v53 cache');
```

- [ ] **Step 2: Run test and verify fail**

Run:

```powershell
node tests\vercel-cache-config.test.mjs
```

Expected: FAIL until cache strings are updated.

- [ ] **Step 3: Update deploy cache strings**

In `index.html`, update the app import query to:

```html
<script type="module" src="./src/app.js?v=20260617-01"></script>
```

In `service-worker.js`, update:

```js
const CACHE_NAME = 'pdv-v53';
```

- [ ] **Step 4: Run full test suite**

Run:

```powershell
Get-ChildItem tests -Filter *.mjs | Sort-Object Name | ForEach-Object { node $_.FullName }
```

Expected: all tests print `ok`; Node may still print `MODULE_TYPELESS_PACKAGE_JSON` warnings.

- [ ] **Step 5: Inspect final diff**

Run:

```powershell
git status --short
git diff --stat
```

Expected: only files from this plan are modified.

- [ ] **Step 6: Commit**

Run:

```powershell
git add index.html service-worker.js tests/vercel-cache-config.test.mjs
git commit -m "chore: bump cache for permission fixes"
```

---

## Self-Review

- Spec coverage: Tasks cover modal profile state, centralized catalog, helper functions, route/menu/service/action gating, Supabase roles/permissions/overrides/audit logs, denied audit, last admin protection and tests.
- Placeholder scan: The plan uses concrete file paths, commands, permission IDs, test snippets and implementation snippets. No intentionally deferred sections remain.
- Type consistency: The canonical permission property remains `id` for compatibility and adds `key/name/module/defaultRoles`. Roles write as `admin`, `gerente`, `operador`, `dono`; legacy `caixa/operator` normalize to `operador`.
