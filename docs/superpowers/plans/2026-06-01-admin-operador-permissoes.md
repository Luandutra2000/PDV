# Admin Operador Permissoes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar login local, perfis Administrador/Operador, permissoes individuais editaveis no app, bloqueios de acoes sensiveis e auditoria.

**Architecture:** A primeira versao sera local-first, usando `localStorage` via `storage.service.js`, mas com nomes e contratos alinhados ao Supabase. A autorizacao ficara em services pequenos (`auth`, `permission`, `audit`) e as telas consumirao esses services para esconder menus e bloquear rotas. Acoes sensiveis tambem serao validadas dentro dos services de dominio, nao apenas na interface.

**Tech Stack:** JavaScript ES modules, HTML/CSS existentes, `localStorage`, testes Node `.mjs` com asserts simples.

---

## File Structure

- Create: `src/services/auth.service.js`
  - Responsavel por usuarios locais, login, logout, sessao atual, ativacao/desativacao e atualizacao de dados basicos.
- Create: `src/services/permission.service.js`
  - Responsavel por catalogo de permissoes, permissoes padrao por perfil e resolucao final com excecoes individuais.
- Create: `src/services/audit.service.js`
  - Responsavel por registrar e consultar auditoria.
- Modify: `src/database/schema.js`
  - Adicionar chaves de storage para usuarios, sessao, permissoes individuais e auditoria.
- Modify: `src/services/storage.service.js`
  - Semear usuario administrador inicial, permissoes individuais vazias e auditoria vazia.
- Modify: `src/app.js`
  - Inicializar auth, renderizar login quando nao houver sessao, proteger rotas e exibir usuario logado.
- Modify: `src/components/sidebar.component.js`
  - Filtrar itens por permissao e expor Pessoas apenas para Administrador.
- Modify: `src/modules/pessoas/pessoas.module.js`
  - Construir tela de lista, cadastro/edicao de usuarios e permissoes individuais.
- Modify: `src/services/transaction.service.js`
  - Validar venda, cancelamento, desconto futuro e movimentacao de caixa; exigir motivo em cancelamento.
- Modify: `src/services/cash-closing.service.js`
  - Validar `cash.close` e registrar auditoria no fechamento.
- Modify: `src/services/estoque.service.js`
  - Validar `showcase.launch` para lancamentos e baixas de vitrine.
- Test: `tests/auth-service.test.mjs`
- Test: `tests/permission-service.test.mjs`
- Test: `tests/audit-service.test.mjs`
- Modify/Test: `tests/transaction-service.test.mjs`

---

### Task 1: Permission Service

**Files:**
- Create: `src/services/permission.service.js`
- Test: `tests/permission-service.test.mjs`
- Modify: `src/database/schema.js`

- [ ] **Step 1: Add permission storage keys**

In `src/database/schema.js`, add:

```js
users: 'pdv.users',
currentSession: 'pdv.currentSession',
userPermissionOverrides: 'pdv.userPermissionOverrides',
auditLogs: 'pdv.auditLogs',
```

- [ ] **Step 2: Write the failing permission tests**

Create `tests/permission-service.test.mjs`:

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

const { STORAGE_KEYS } = await import('../src/database/schema.js');
const storage = await import('../src/services/storage.service.js');
const permissions = await import('../src/services/permission.service.js');

storage.ensureSeedData();

const admin = { id: 'admin-1', role: 'admin', active: true };
const operator = { id: 'operator-1', role: 'operator', active: true };
const inactive = { id: 'operator-2', role: 'operator', active: false };

assert(permissions.hasPermission(admin, 'owner_app.view'), 'admin should access owner app');
assert(permissions.hasPermission(admin, 'sales.discount'), 'admin should apply discounts');
assert(permissions.hasPermission(operator, 'sales.create'), 'operator should create sales');
assert(permissions.hasPermission(operator, 'sales.cancel'), 'operator should cancel sales');
assert(permissions.hasPermission(operator, 'cash.close'), 'operator should close cash');
assert(!permissions.hasPermission(operator, 'sales.discount'), 'operator should not apply discounts by default');
assert(!permissions.hasPermission(operator, 'owner_app.view'), 'operator should not access owner app by default');
assert(!permissions.hasPermission(inactive, 'sales.create'), 'inactive user should not have permissions');

permissions.setUserPermissionOverride('operator-1', 'owner_app.view', 'allow');
assert(permissions.hasPermission(operator, 'owner_app.view'), 'allow override should grant permission');

permissions.setUserPermissionOverride('operator-1', 'sales.cancel', 'deny');
assert(!permissions.hasPermission(operator, 'sales.cancel'), 'deny override should block role permission');

permissions.setUserPermissionOverride('operator-1', 'sales.cancel', 'default');
assert(permissions.hasPermission(operator, 'sales.cancel'), 'default override should fall back to role permission');

const overrides = storage.getItem(STORAGE_KEYS.userPermissionOverrides, {});
assert(!overrides['operator-1']['sales.cancel'], 'default override should remove explicit override');

console.log('permission service ok');
```

- [ ] **Step 3: Run the permission test and verify it fails**

Run: `node tests/permission-service.test.mjs`

Expected: FAIL because `src/services/permission.service.js` does not exist.

- [ ] **Step 4: Implement `permission.service.js`**

Create `src/services/permission.service.js`:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export const ROLES = {
  admin: 'admin',
  operator: 'operator'
};

export const PERMISSIONS = [
  { id: 'sales.access', label: 'Acessar frente de caixa', group: 'Vendas' },
  { id: 'sales.create', label: 'Finalizar venda', group: 'Vendas' },
  { id: 'sales.cancel', label: 'Cancelar venda', group: 'Vendas' },
  { id: 'sales.discount', label: 'Aplicar desconto', group: 'Vendas' },
  { id: 'cash.movement', label: 'Registrar entrada, saida e sangria', group: 'Caixa' },
  { id: 'cash.close', label: 'Fechar caixa', group: 'Caixa' },
  { id: 'showcase.access', label: 'Acessar vitrine', group: 'Vitrine/Estoque' },
  { id: 'showcase.launch', label: 'Lancar vitrine/producao', group: 'Vitrine/Estoque' },
  { id: 'products.manage', label: 'Gerenciar produtos', group: 'Gestao' },
  { id: 'reports.view', label: 'Ver relatorios', group: 'Gestao' },
  { id: 'owner_app.view', label: 'Acessar App do Dono', group: 'Gestao' },
  { id: 'users.manage', label: 'Cadastrar e editar usuarios', group: 'Sistema' },
  { id: 'permissions.manage', label: 'Editar permissoes', group: 'Sistema' },
  { id: 'audit.view', label: 'Ver auditoria', group: 'Sistema' }
];

const OPERATOR_PERMISSIONS = new Set([
  'sales.access',
  'sales.create',
  'sales.cancel',
  'cash.movement',
  'cash.close',
  'showcase.access',
  'showcase.launch'
]);

export function hasPermission(user, permissionId) {
  if (!user || user.active === false) {
    return false;
  }

  if (user.role === ROLES.admin) {
    return true;
  }

  const override = getUserPermissionOverride(user.id, permissionId);

  if (override === 'deny') {
    return false;
  }

  if (override === 'allow') {
    return true;
  }

  return user.role === ROLES.operator && OPERATOR_PERMISSIONS.has(permissionId);
}

export function assertPermission(user, permissionId) {
  if (!hasPermission(user, permissionId)) {
    throw new Error('Usuario sem permissao para esta acao.');
  }
}

export function getUserPermissionOverride(userId, permissionId) {
  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  return overrides[userId]?.[permissionId] || 'default';
}

export function setUserPermissionOverride(userId, permissionId, state) {
  const overrides = getItem(STORAGE_KEYS.userPermissionOverrides, {});
  const userOverrides = { ...(overrides[userId] || {}) };

  if (state === 'default') {
    delete userOverrides[permissionId];
  } else {
    userOverrides[permissionId] = state;
  }

  setItem(STORAGE_KEYS.userPermissionOverrides, {
    ...overrides,
    [userId]: userOverrides
  });
}

export function getRolePermissions(role) {
  if (role === ROLES.admin) {
    return PERMISSIONS.map((permission) => permission.id);
  }

  if (role === ROLES.operator) {
    return Array.from(OPERATOR_PERMISSIONS);
  }

  return [];
}
```

- [ ] **Step 5: Run permission test and commit**

Run: `node tests/permission-service.test.mjs`

Expected: PASS with `permission service ok`.

Commit:

```bash
git add src/database/schema.js src/services/permission.service.js tests/permission-service.test.mjs
git commit -m "feat: add permission service"
```

---

### Task 2: Auth Service And Seed Users

**Files:**
- Create: `src/services/auth.service.js`
- Modify: `src/services/storage.service.js`
- Test: `tests/auth-service.test.mjs`

- [ ] **Step 1: Write the failing auth tests**

Create `tests/auth-service.test.mjs`:

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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');

storage.ensureSeedData();

const users = auth.getUsers();
assert(users.some((user) => user.role === 'admin'), 'seed should create admin user');

const adminSession = auth.login({ username: 'admin', password: 'admin123' });
assert(adminSession.user.name === 'Administrador', 'admin login should return session user');
assert(auth.getCurrentUser().username === 'admin', 'current user should be stored');

const operator = auth.createUser({
  name: 'Caixa 1',
  username: 'caixa',
  password: '1234',
  role: 'operator'
});

assert(operator.id, 'created user should have id');
assert(operator.active === true, 'created user should be active');

auth.logout();
auth.login({ username: 'caixa', password: '1234' });
assert(auth.getCurrentUser().role === 'operator', 'operator should log in');

auth.updateUser(operator.id, { active: false });
auth.logout();

let blocked = false;
try {
  auth.login({ username: 'caixa', password: '1234' });
} catch (error) {
  blocked = error.message === 'Usuario inativo.';
}

assert(blocked, 'inactive user should not log in');

console.log('auth service ok');
```

- [ ] **Step 2: Run the auth test and verify it fails**

Run: `node tests/auth-service.test.mjs`

Expected: FAIL because `src/services/auth.service.js` does not exist.

- [ ] **Step 3: Implement auth seed in storage**

In `src/services/storage.service.js`, import no new service. Add seed blocks to `ensureSeedData()`:

```js
if (!getItem(STORAGE_KEYS.users)) {
  setItem(STORAGE_KEYS.users, [{
    id: 'user-admin',
    name: 'Administrador',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }]);
}

if (!getItem(STORAGE_KEYS.currentSession)) {
  setItem(STORAGE_KEYS.currentSession, null);
}

if (!getItem(STORAGE_KEYS.userPermissionOverrides)) {
  setItem(STORAGE_KEYS.userPermissionOverrides, {});
}

if (!getItem(STORAGE_KEYS.auditLogs)) {
  setItem(STORAGE_KEYS.auditLogs, []);
}
```

Add equivalent resets to `resetAppData()`.

- [ ] **Step 4: Implement `auth.service.js`**

Create `src/services/auth.service.js`:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export function getUsers() {
  return getItem(STORAGE_KEYS.users, []);
}

export function getActiveUsers() {
  return getUsers().filter((user) => user.active !== false);
}

export function getCurrentUser() {
  const session = getItem(STORAGE_KEYS.currentSession, null);

  if (!session?.userId) {
    return null;
  }

  return getUsers().find((user) => user.id === session.userId) || null;
}

export function login({ username, password }) {
  const normalizedUsername = String(username || '').trim();
  const user = getUsers().find((candidate) => candidate.username === normalizedUsername);

  if (!user || user.password !== password) {
    throw new Error('Usuario ou senha invalidos.');
  }

  if (user.active === false) {
    throw new Error('Usuario inativo.');
  }

  const session = {
    userId: user.id,
    startedAt: new Date().toISOString()
  };

  setItem(STORAGE_KEYS.currentSession, session);

  return { user: sanitizeUser(user), session };
}

export function logout() {
  setItem(STORAGE_KEYS.currentSession, null);
}

export function createUser(input) {
  const users = getUsers();
  const username = String(input.username || '').trim();

  if (!input.name || !username || !input.password || !input.role) {
    throw new Error('Preencha nome, usuario, senha e perfil.');
  }

  if (users.some((user) => user.username === username)) {
    throw new Error('Ja existe usuario com este login.');
  }

  const now = new Date().toISOString();
  const user = {
    id: createId('user'),
    name: String(input.name).trim(),
    username,
    password: String(input.password),
    role: input.role,
    active: true,
    createdAt: now,
    updatedAt: now
  };

  setItem(STORAGE_KEYS.users, [...users, user]);

  return sanitizeUser(user);
}

export function updateUser(userId, patch) {
  let updatedUser = null;
  const users = getUsers().map((user) => {
    if (user.id !== userId) {
      return user;
    }

    updatedUser = {
      ...user,
      ...patch,
      updatedAt: new Date().toISOString()
    };

    return updatedUser;
  });

  if (!updatedUser) {
    throw new Error('Usuario nao encontrado.');
  }

  setItem(STORAGE_KEYS.users, users);

  return sanitizeUser(updatedUser);
}

export function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const { password, ...safeUser } = user;
  return safeUser;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 5: Run auth test and commit**

Run: `node tests/auth-service.test.mjs`

Expected: PASS with `auth service ok`.

Commit:

```bash
git add src/services/auth.service.js src/services/storage.service.js tests/auth-service.test.mjs
git commit -m "feat: add local auth service"
```

---

### Task 3: Audit Service

**Files:**
- Create: `src/services/audit.service.js`
- Test: `tests/audit-service.test.mjs`

- [ ] **Step 1: Write the failing audit tests**

Create `tests/audit-service.test.mjs`:

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

const storage = await import('../src/services/storage.service.js');
const audit = await import('../src/services/audit.service.js');

storage.ensureSeedData();

const entry = audit.recordAudit({
  action: 'sale.cancel',
  entityType: 'sale',
  entityId: 'sale-1',
  user: { id: 'operator-1', name: 'Caixa 1' },
  reason: 'Cliente desistiu',
  metadata: { total: 32 }
});

assert(entry.id, 'audit entry should have id');
assert(entry.userName === 'Caixa 1', 'audit should store user name');
assert(entry.reason === 'Cliente desistiu', 'audit should store reason');
assert(entry.metadata.total === 32, 'audit should store metadata');
assert(audit.getAuditLogs()[0].action === 'sale.cancel', 'new audit should be first');

console.log('audit service ok');
```

- [ ] **Step 2: Run audit test and verify it fails**

Run: `node tests/audit-service.test.mjs`

Expected: FAIL because `src/services/audit.service.js` does not exist.

- [ ] **Step 3: Implement audit service**

Create `src/services/audit.service.js`:

```js
import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';
import { getCurrentUser } from './auth.service.js';

export function recordAudit({
  action,
  entityType,
  entityId = '',
  user = getCurrentUser(),
  reason = '',
  metadata = {}
}) {
  const entry = {
    id: createId('audit'),
    action,
    entityType,
    entityId,
    userId: user?.id || '',
    userName: user?.name || 'Sistema',
    reason: String(reason || '').trim(),
    metadata,
    createdAt: new Date().toISOString()
  };

  const logs = getAuditLogs();
  setItem(STORAGE_KEYS.auditLogs, [entry, ...logs]);

  return entry;
}

export function getAuditLogs() {
  return getItem(STORAGE_KEYS.auditLogs, []);
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
```

- [ ] **Step 4: Run audit test and commit**

Run: `node tests/audit-service.test.mjs`

Expected: PASS with `audit service ok`.

Commit:

```bash
git add src/services/audit.service.js tests/audit-service.test.mjs
git commit -m "feat: add audit service"
```

---

### Task 4: Protect Transaction Actions

**Files:**
- Modify: `src/services/transaction.service.js`
- Modify: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Add tests for cancel reason and permission**

Extend `tests/transaction-service.test.mjs` after auth setup is available:

```js
const auth = await import('../src/services/auth.service.js');
const audit = await import('../src/services/audit.service.js');

auth.login({ username: 'admin', password: 'admin123' });
```

Add assertions near the cancellation section:

```js
let missingReasonBlocked = false;
try {
  transactions.cancelTransaction(entrada.id);
} catch (error) {
  missingReasonBlocked = error.message === 'Informe o motivo do cancelamento.';
}
assert(missingReasonBlocked, 'canceling transaction should require reason');

transactions.cancelTransaction(entrada.id, { reason: 'Lancamento duplicado' });
const cancelAudit = audit.getAuditLogs().find((entry) => entry.action === 'transaction.cancel' && entry.entityId === entrada.id);
assert(cancelAudit.reason === 'Lancamento duplicado', 'cancel audit should store reason');
```

Update existing `cancelClosedComanda` and `cancelTransaction` test calls to pass `{ reason: '...' }`.

- [ ] **Step 2: Run transaction test and verify it fails**

Run: `node tests/transaction-service.test.mjs`

Expected: FAIL because cancel functions do not require reason yet.

- [ ] **Step 3: Validate permissions and audit in transaction service**

In `src/services/transaction.service.js`, import:

```js
import { getCurrentUser } from './auth.service.js';
import { assertPermission } from './permission.service.js';
import { recordAudit } from './audit.service.js';
```

At the start of `finalizeComandaPayment`, add:

```js
const user = getCurrentUser();
assertPermission(user, 'sales.create');
```

Add `createdBy` and `userName` to the sale:

```js
createdBy: user?.id || '',
userName: user?.name || 'Sistema',
```

After `emit(UI_EVENTS.cashSummaryChanged, sale);`, add:

```js
recordAudit({
  action: 'sale.create',
  entityType: 'sale',
  entityId: sale.id,
  user,
  metadata: { total: sale.total, paymentMethod: sale.paymentMethod }
});
```

At the start of `registerCashMovement`, add:

```js
const user = getCurrentUser();
assertPermission(user, 'cash.movement');
```

Allow sangria:

```js
if (!['entrada', 'saida', 'sangria'].includes(type)) {
  throw new Error('Tipo de movimento invalido.');
}
```

Set movement user fields:

```js
userId: user?.id || '',
userName: user?.name || String(userName || 'Local').trim() || 'Local',
```

After movement emits, add audit:

```js
recordAudit({
  action: 'cash.movement',
  entityType: 'transaction',
  entityId: movement.id,
  user,
  reason: movement.description,
  metadata: { type: movement.type, amount: movement.amount, category: movement.category }
});
```

Change signatures:

```js
export function cancelClosedComanda(comandaId, { reason = '' } = {}) {
```

```js
export function cancelTransaction(transactionId, { reason = '' } = {}) {
```

At the start of each cancel function:

```js
const normalizedReason = String(reason || '').trim();
if (!normalizedReason) {
  throw new Error('Informe o motivo do cancelamento.');
}

const user = getCurrentUser();
assertPermission(user, 'sales.cancel');
```

Add cancellation metadata to canceled records:

```js
canceledBy: user?.id || '',
canceledByName: user?.name || 'Sistema',
cancelReason: normalizedReason,
```

After persistence in each cancel function, call:

```js
recordAudit({
  action: 'transaction.cancel',
  entityType: 'transaction',
  entityId: transactionId,
  user,
  reason: normalizedReason,
  metadata: { comandaId: canceledSaleComandaId }
});
```

For `cancelClosedComanda`, use action `comanda.cancel`, entity type `comanda`, and entity id `comandaId`.

- [ ] **Step 4: Run transaction test and commit**

Run: `node tests/transaction-service.test.mjs`

Expected: PASS with `transaction service ok`.

Commit:

```bash
git add src/services/transaction.service.js tests/transaction-service.test.mjs
git commit -m "feat: audit protected transaction actions"
```

---

### Task 5: Login Shell, Route Guard, And Sidebar Permissions

**Files:**
- Modify: `src/app.js`
- Modify: `src/components/sidebar.component.js`
- Modify: `src/styles/forms.css`
- Modify: `src/styles/layout.css`

- [ ] **Step 1: Update sidebar API**

Change `renderSidebar()` to receive the current user and filter menu items:

```js
import { hasPermission } from '../services/permission.service.js';

const menuGroups = [
  {
    title: 'Vendas',
    items: [
      { id: 'frente-caixa', label: 'Frente de Caixa', icon: 'FC', permission: 'sales.access' },
      { id: 'estoque', label: 'Vitrine', icon: 'VT', permission: 'showcase.access' },
      { id: 'dashboard', label: 'Historico de Transacoes', icon: 'HT', permission: 'reports.view' }
    ]
  },
  {
    title: 'Gestao',
    items: [
      { id: 'produtos', label: 'Produtos', icon: 'PR', permission: 'products.manage' },
      { id: 'pessoas', label: 'Pessoas', icon: 'PS', permission: 'users.manage' }
    ]
  },
  {
    title: 'Financeiro',
    items: [
      { id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX', permission: 'cash.close' }
    ]
  },
  {
    title: 'Outros',
    items: [
      { id: 'relatorios', label: 'Relatorios', icon: 'RE', permission: 'reports.view' },
      { id: 'mobile', label: 'App do Dono', icon: 'AD', permission: 'owner_app.view' }
    ]
  }
];

export function renderSidebar(currentUser) {
  const groups = menuGroups.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasPermission(currentUser, item.permission))
  })).filter((group) => group.items.length);
  // keep existing HTML mapping
}
```

- [ ] **Step 2: Add login render and route guard in app**

In `src/app.js`, import:

```js
import { getCurrentUser, login, logout } from './services/auth.service.js';
import { hasPermission } from './services/permission.service.js';
import { initPessoasModule } from './modules/pessoas/pessoas.module.js';
```

Add `pessoas` to routes:

```js
pessoas: initPessoasModule,
```

Add route permission map:

```js
const routePermissions = {
  'frente-caixa': 'sales.access',
  dashboard: 'reports.view',
  produtos: 'products.manage',
  estoque: 'showcase.access',
  'fechar-caixa': 'cash.close',
  relatorios: 'reports.view',
  mobile: 'owner_app.view',
  pessoas: 'users.manage'
};
```

In `bootstrap()`, after seed/init calls:

```js
const currentUser = getCurrentUser();
if (!currentUser) {
  renderLogin(app);
  return;
}
```

Pass user to sidebar:

```js
${renderSidebar(currentUser)}
```

Replace initial route selection with first permitted route:

```js
const initialView = getAuthorizedInitialView(currentUser);
```

Create:

```js
function getAuthorizedInitialView(currentUser) {
  const requestedView = getInitialView();

  if (routes[requestedView] && canAccessRoute(currentUser, requestedView)) {
    return requestedView;
  }

  return Object.keys(routes).find((routeId) => canAccessRoute(currentUser, routeId)) || 'frente-caixa';
}

function canAccessRoute(currentUser, routeId) {
  const permission = routePermissions[routeId];
  return !permission || hasPermission(currentUser, permission);
}
```

Create `renderLogin(app)` with form fields `username` and `password`, submit handler calling `login()`, and then `bootstrap()`.

Update logout button handler to call `logout()` and `bootstrap()`.

For route click in `bindNavigation`, before rendering:

```js
if (!canAccessRoute(getCurrentUser(), menuButton.dataset.menuId)) {
  renderPermissionDenied(workspace);
  return;
}
```

- [ ] **Step 3: Style login minimally**

Add small, scoped classes:

```css
.login-screen {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.login-panel {
  width: min(420px, 100%);
  display: grid;
  gap: 16px;
}
```

- [ ] **Step 4: Manual browser check and commit**

Run local server: `powershell -Command "$python = 'C:\Users\luand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'; Start-Process -FilePath $python -ArgumentList @('-m','http.server','5500','--bind','127.0.0.1') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden"`

Open: `http://127.0.0.1:5500/`

Expected:
- Login appears when no session exists.
- `admin` / `admin123` logs in.
- Admin sees Pessoas, Produtos, Relatorios and App do Dono.
- Operator created later does not see admin menus.

Commit:

```bash
git add src/app.js src/components/sidebar.component.js src/styles/forms.css src/styles/layout.css
git commit -m "feat: add login shell and route permissions"
```

---

### Task 6: Pessoas Module For Users And Individual Permissions

**Files:**
- Modify: `src/modules/pessoas/pessoas.module.js`
- Modify: `src/styles/forms.css`
- Modify: `src/styles/cards.css`

- [ ] **Step 1: Replace Pessoas placeholder**

Implement `initPessoasModule(workspace)` that renders:

```js
import { createUser, getUsers, updateUser } from '../../services/auth.service.js';
import { PERMISSIONS, getUserPermissionOverride, setUserPermissionOverride } from '../../services/permission.service.js';
import { recordAudit } from '../../services/audit.service.js';

export function initPessoasModule(workspace) {
  renderPeople(workspace);
  bindPeopleEvents(workspace);
}
```

Render:
- Header `Pessoas`
- Form with `name`, `username`, `password`, `role`, `active`
- User list
- Permission override selectors for selected user with options `Padrao`, `Liberado`, `Bloqueado`

- [ ] **Step 2: Save users**

On submit:

```js
const user = editingId
  ? updateUser(editingId, payload)
  : createUser(payload);

recordAudit({
  action: editingId ? 'user.update' : 'user.create',
  entityType: 'user',
  entityId: user.id,
  metadata: { username: user.username, role: user.role, active: user.active }
});
```

- [ ] **Step 3: Save permission overrides**

On permission select change:

```js
setUserPermissionOverride(userId, permissionId, state);
recordAudit({
  action: 'permission.override',
  entityType: 'user',
  entityId: userId,
  metadata: { permissionId, state }
});
```

- [ ] **Step 4: Manual UI check and commit**

Expected:
- Admin can create operator.
- Admin can edit operator.
- Admin can set `owner_app.view` to `allow` for operator.
- Admin can set `sales.cancel` to `deny` for operator.
- Changes persist after refresh.

Commit:

```bash
git add src/modules/pessoas/pessoas.module.js src/styles/forms.css src/styles/cards.css
git commit -m "feat: add user permission management"
```

---

### Task 7: Protect Cash Closing And Showcase Services

**Files:**
- Modify: `src/services/cash-closing.service.js`
- Modify: `src/services/estoque.service.js`
- Test: `tests/cash-closing-service.test.mjs`
- Test: `tests/estoque-service.test.mjs`

- [ ] **Step 1: Add permission setup to tests**

At the beginning of each test after imports:

```js
const auth = await import('../src/services/auth.service.js');
storage.ensureSeedData();
auth.login({ username: 'admin', password: 'admin123' });
```

- [ ] **Step 2: Protect cash closing**

In `cash-closing.service.js`, import `getCurrentUser`, `assertPermission`, and `recordAudit`.

Before closing or saving final closing:

```js
const user = getCurrentUser();
assertPermission(user, 'cash.close');
```

After creating closing:

```js
recordAudit({
  action: 'cash.close',
  entityType: 'cashClosing',
  entityId: closing.id,
  user,
  metadata: { totals: closing.totals }
});
```

- [ ] **Step 3: Protect showcase launches**

In `estoque.service.js`, import `getCurrentUser`, `assertPermission`, and `recordAudit`.

Before creating production/showcase launch or write-off:

```js
const user = getCurrentUser();
assertPermission(user, 'showcase.launch');
```

After persistence:

```js
recordAudit({
  action: 'showcase.launch',
  entityType: 'stockLaunch',
  entityId: launch.id,
  user,
  metadata: { productId: launch.productId, quantity: launch.quantity }
});
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node tests/cash-closing-service.test.mjs
node tests/estoque-service.test.mjs
```

Expected: both PASS.

Commit:

```bash
git add src/services/cash-closing.service.js src/services/estoque.service.js tests/cash-closing-service.test.mjs tests/estoque-service.test.mjs
git commit -m "feat: protect cash closing and showcase actions"
```

---

### Task 8: Final Verification

**Files:**
- No new files unless bugs are found.

- [ ] **Step 1: Run service tests**

Run:

```bash
node tests/permission-service.test.mjs
node tests/auth-service.test.mjs
node tests/audit-service.test.mjs
node tests/transaction-service.test.mjs
node tests/cash-closing-service.test.mjs
node tests/estoque-service.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run broader existing tests**

Run each existing `.mjs` test in `tests/`:

```bash
Get-ChildItem tests -Filter *.mjs | ForEach-Object { node $_.FullName }
```

Expected: all PASS.

- [ ] **Step 3: Browser verification**

Open `http://127.0.0.1:5500/`.

Check:
- No session shows login.
- Admin login works with `admin` / `admin123`.
- Admin sees all admin menus.
- Admin creates an operator.
- Operator login works.
- Operator sees only Frente de Caixa, Vitrine and Fechar Caixa.
- Operator can finalize venda.
- Operator can cancel venda only with motivo.
- Operator can register entrada, saida and sangria.
- Operator can close caixa.
- Operator cannot access Pessoas, Produtos, Relatorios or App do Dono by menu or direct `?view=`.

- [ ] **Step 4: Final commit if verification fixes were needed**

If any verification fixes are made:

```bash
git add <changed-files>
git commit -m "fix: polish admin operator permissions"
```

---

## Self-Review

- Spec coverage: login, roles, permission defaults, individual overrides, Pessoas module, sensitive service validation, cancel reason, audit, and route/menu protection are covered.
- Placeholder scan: no TBD/TODO placeholders are present.
- Type consistency: role ids use `admin` and `operator`; permission ids match the approved spec; override states use `default`, `allow`, and `deny`; user active state uses `active`.
