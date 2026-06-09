# Pessoas/Usuarios Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Pessoas/Usuarios page create, edit, persist, and enforce real Supabase users, profiles, roles, and permissions.

**Architecture:** Keep the static JavaScript app, but split identity management into focused services. The browser reads safe data through Supabase client/REST and calls a Supabase Edge Function for privileged Auth operations. Local mode remains supported for development, while Supabase mode becomes the source of truth for users and permissions.

**Tech Stack:** JavaScript ES Modules, HTML/CSS, Node `.mjs` tests, Supabase Postgres/RLS, Supabase Auth, Supabase Edge Functions on Deno.

---

## File Structure

- Modify: `src/database/schema.js`
  - Add UI event keys for auth/user/permission changes.
- Modify: `src/services/permission.service.js`
  - Expand roles to `admin`, `gerente`, `caixa`, `operador`.
  - Align permission ids with the approved catalog.
  - Keep local permission resolution pure and testable.
- Create: `src/services/user-admin.service.js`
  - Single front-end facade for listing users, creating/editing users, and saving permission overrides.
  - Delegates to local storage in local mode and Supabase/Edge Function in online mode.
- Modify: `src/services/auth.service.js`
  - Stop creating local password users in Supabase mode.
  - Hydrate session user from `profiles`, not from unsafe metadata.
- Modify: `src/services/providers/supabase.provider.js`
  - Add mappers/hydration for user-facing permission tables only where safe.
- Create: `supabase/migrations/<generated>_align_users_permissions.sql`
  - Add roles, align permissions, add `user_permission_overrides`, update RLS/functions.
- Create: `supabase/functions/admin-users/index.ts`
  - Privileged Auth/Profile/override operations using `SUPABASE_SERVICE_ROLE_KEY`.
- Modify: `src/modules/pessoas/pessoas.module.js`
  - Use the new async service, loading/error/success states, four profiles, and improved UI states.
- Modify: `src/styles/cards.css`
  - Polish list/cards using existing theme colors.
- Modify: `src/styles/forms.css`
  - Polish form/permission grid using existing theme colors.
- Modify: `src/app.js`
  - Hydrate auth/permission data after login and refresh sidebar when permissions change.
- Modify: `src/components/sidebar.component.js`
  - Add missing permission ids and keep filtering via `hasPermission`.
- Modify: `src/services/transaction.service.js`
  - Split cancel sale permission from cancel cash movement if needed.
- Modify: `src/services/cash-closing.service.js`
  - Keep `cash.close` enforcement and update tests around new role defaults.
- Modify: `src/services/estoque.service.js`
  - Keep `showcase.launch` enforcement and update tests around new role defaults.
- Test: `tests/permission-service.test.mjs`
- Test: `tests/auth-service.test.mjs`
- Create: `tests/user-admin-service.test.mjs`
- Create: `tests/pessoas-module.test.mjs`
- Modify: `tests/supabase-provider.test.mjs`
- Create: `tests/users-permissions-migration.test.mjs`

## Permission Catalog

Use this shared catalog in code and migration:

```js
export const ROLES = {
  admin: 'admin',
  gerente: 'gerente',
  caixa: 'caixa',
  operador: 'operador'
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
  { id: 'crm.view', label: 'Ver CRM', group: 'Gestao' },
  { id: 'owner_app.view', label: 'Acessar App do Dono', group: 'Gestao' },
  { id: 'users.manage', label: 'Cadastrar e editar usuarios', group: 'Sistema' },
  { id: 'permissions.manage', label: 'Editar permissoes', group: 'Sistema' },
  { id: 'audit.view', label: 'Ver auditoria', group: 'Sistema' }
];

export const ROLE_PERMISSION_DEFAULTS = {
  admin: PERMISSIONS.map((permission) => permission.id),
  gerente: [
    'sales.access', 'sales.create', 'sales.cancel', 'sales.discount',
    'cash.movement', 'cash.close',
    'showcase.access', 'showcase.launch',
    'products.manage', 'reports.view', 'crm.view', 'owner_app.view', 'audit.view'
  ],
  caixa: [
    'sales.access', 'sales.create', 'sales.cancel',
    'cash.movement', 'cash.close',
    'showcase.access'
  ],
  operador: [
    'sales.access', 'sales.create',
    'showcase.access', 'showcase.launch'
  ]
};
```

---

### Task 1: Align Local Permission Catalog

**Files:**
- Modify: `src/services/permission.service.js`
- Modify: `tests/permission-service.test.mjs`

- [ ] **Step 1: Write the failing role/default permission tests**

Replace the role default section in `tests/permission-service.test.mjs` with:

```js
const gerente = { id: 'gerente-1', role: 'gerente', active: true };
const caixa = { id: 'caixa-1', role: 'caixa', active: true };
const operador = { id: 'operador-1', role: 'operador', active: true };

assert(permissions.hasPermission(admin, 'permissions.manage'), 'admin should edit permissions');
assert(permissions.hasPermission(gerente, 'reports.view'), 'gerente should see reports');
assert(permissions.hasPermission(gerente, 'sales.discount'), 'gerente should apply discounts');
assert(!permissions.hasPermission(gerente, 'users.manage'), 'gerente should not manage users by default');
assert(permissions.hasPermission(caixa, 'cash.close'), 'caixa should close cash');
assert(!permissions.hasPermission(caixa, 'sales.discount'), 'caixa should not discount by default');
assert(permissions.hasPermission(operador, 'showcase.launch'), 'operador should launch showcase');
assert(!permissions.hasPermission(operador, 'cash.close'), 'operador should not close cash by default');
assert(!permissions.hasPermission(inactive, 'sales.create'), 'inactive user should not have permissions');

permissions.setUserPermissionOverride('operador-1', 'cash.close', 'allow');
assert(permissions.hasPermission(operador, 'cash.close'), 'allow override should grant permission');

permissions.setUserPermissionOverride('operador-1', 'showcase.launch', 'deny');
assert(!permissions.hasPermission(operador, 'showcase.launch'), 'deny override should block role permission');

permissions.setUserPermissionOverride('operador-1', 'showcase.launch', 'default');
assert(permissions.hasPermission(operador, 'showcase.launch'), 'default should fall back to role permission');
```

- [ ] **Step 2: Run the permission test to verify it fails**

Run: `node tests/permission-service.test.mjs`

Expected: FAIL because `gerente`, `caixa`, `operador`, `crm.view`, and `permissions.manage` defaults are not fully implemented.

- [ ] **Step 3: Update `permission.service.js` role catalog**

Replace the top role/default definitions with the catalog from the "Permission Catalog" section. Keep `isKnownPermission`, `assertKnownPermission`, `getUserPermissionOverride`, and `setUserPermissionOverride`, but update `hasPermission()` and `getRolePermissions()`:

```js
export function hasPermission(user, permissionId) {
  if (!isKnownPermission(permissionId)) {
    return false;
  }

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

  return getRolePermissions(user.role).includes(permissionId);
}

export function getRolePermissions(role) {
  return ROLE_PERMISSION_DEFAULTS[role] ? [...ROLE_PERMISSION_DEFAULTS[role]] : [];
}
```

- [ ] **Step 4: Run the permission test to verify it passes**

Run: `node tests/permission-service.test.mjs`

Expected: PASS with `permission service ok`.

- [ ] **Step 5: Commit**

```bash
git add src/services/permission.service.js tests/permission-service.test.mjs
git commit -m "feat: align permission roles"
```

---

### Task 2: Add Supabase Schema Migration For Roles And Overrides

**Files:**
- Create: `supabase/migrations/<timestamp>_align_users_permissions.sql`
- Create: `tests/users-permissions-migration.test.mjs`

- [ ] **Step 1: Create the migration file with Supabase CLI**

Run: `npx.cmd supabase migration new align_users_permissions`

Expected: a new SQL file under `supabase/migrations`.

- [ ] **Step 2: Write the migration structure test**

Create `tests/users-permissions-migration.test.mjs`:

```js
import { readFile, readdir } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const files = await readdir(new URL('../supabase/migrations/', import.meta.url));
const migrationName = files.find((name) => name.endsWith('_align_users_permissions.sql'));
assert(migrationName, 'align users permissions migration should exist');

const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

[
  "insert into public.roles",
  "'gerente'",
  "'caixa'",
  "'operador'",
  "'permissions.manage'",
  "'crm.view'",
  'create table if not exists public.user_permission_overrides',
  'alter table public.user_permission_overrides enable row level security',
  'current_profile_has_permission',
  "permissions.manage"
].forEach((fragment) => {
  assert(sql.includes(fragment), `migration should include ${fragment}`);
});

assert(!sql.includes('create table if not exists public.users'), 'migration must not create duplicate users table');
assert(!sql.includes('create table if not exists public.usuarios'), 'migration must not create duplicate usuarios table');
assert(!sql.includes('create table if not exists public.pessoas'), 'migration must not create duplicate pessoas table');

console.log('users permissions migration ok');
```

- [ ] **Step 3: Run the migration test to verify it fails**

Run: `node tests/users-permissions-migration.test.mjs`

Expected: FAIL until the migration contains roles, permissions, overrides, and RLS.

- [ ] **Step 4: Fill the migration SQL**

Use the generated migration file and add:

```sql
insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('gerente', 'Gerente'),
  ('caixa', 'Caixa'),
  ('operador', 'Operador')
on conflict (id) do update set name = excluded.name;

insert into public.permissions (id, description) values
  ('sales.access', 'Acessar frente de caixa'),
  ('sales.create', 'Finalizar venda'),
  ('sales.cancel', 'Cancelar venda'),
  ('sales.discount', 'Aplicar desconto'),
  ('cash.movement', 'Registrar entrada, saida e sangria'),
  ('cash.close', 'Fechar caixa'),
  ('showcase.access', 'Acessar vitrine'),
  ('showcase.launch', 'Lancar vitrine/producao'),
  ('products.manage', 'Gerenciar produtos'),
  ('reports.view', 'Ver relatorios'),
  ('crm.view', 'Ver CRM'),
  ('owner_app.view', 'Acessar App do Dono'),
  ('users.manage', 'Cadastrar e editar usuarios'),
  ('permissions.manage', 'Editar permissoes'),
  ('audit.view', 'Ver auditoria')
on conflict (id) do update set description = excluded.description;

delete from public.role_permissions
where role_id in ('admin', 'gerente', 'caixa', 'operador');

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('gerente', 'sales.access'),
  ('gerente', 'sales.create'),
  ('gerente', 'sales.cancel'),
  ('gerente', 'sales.discount'),
  ('gerente', 'cash.movement'),
  ('gerente', 'cash.close'),
  ('gerente', 'showcase.access'),
  ('gerente', 'showcase.launch'),
  ('gerente', 'products.manage'),
  ('gerente', 'reports.view'),
  ('gerente', 'crm.view'),
  ('gerente', 'owner_app.view'),
  ('gerente', 'audit.view'),
  ('caixa', 'sales.access'),
  ('caixa', 'sales.create'),
  ('caixa', 'sales.cancel'),
  ('caixa', 'cash.movement'),
  ('caixa', 'cash.close'),
  ('caixa', 'showcase.access'),
  ('operador', 'sales.access'),
  ('operador', 'sales.create'),
  ('operador', 'showcase.access'),
  ('operador', 'showcase.launch')
on conflict do nothing;

create table if not exists public.user_permission_overrides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  state text not null check (state in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_id)
);

alter table public.user_permission_overrides enable row level security;

drop policy if exists "active users read user permission overrides" on public.user_permission_overrides;
create policy "active users read user permission overrides" on public.user_permission_overrides
  for select to authenticated using (private.current_profile_is_active());

drop policy if exists "permission managers manage user permission overrides" on public.user_permission_overrides;
create policy "permission managers manage user permission overrides" on public.user_permission_overrides
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));

create or replace function private.current_profile_has_permission(_permission_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.role_permissions rp on rp.role_id = p.role_id
    left join public.user_permission_overrides upo
      on upo.user_id = p.id and upo.permission_id = _permission_id
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role_id = 'admin'
        or upo.state = 'allow'
        or (upo.state is distinct from 'deny' and rp.permission_id = _permission_id)
      )
  );
$$;

drop policy if exists "user managers manage profiles" on public.profiles;
create policy "user managers manage profiles" on public.profiles
  for all to authenticated
  using (private.current_profile_has_permission('users.manage'))
  with check (private.current_profile_has_permission('users.manage'));

drop policy if exists "user managers manage role permissions" on public.role_permissions;
create policy "permission managers manage role permissions" on public.role_permissions
  for all to authenticated
  using (private.current_profile_has_permission('permissions.manage'))
  with check (private.current_profile_has_permission('permissions.manage'));
```

- [ ] **Step 5: Run the migration test**

Run: `node tests/users-permissions-migration.test.mjs`

Expected: PASS with `users permissions migration ok`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations tests/users-permissions-migration.test.mjs
git commit -m "feat: add user permission schema"
```

---

### Task 3: Build User Admin Front-End Service

**Files:**
- Create: `src/services/user-admin.service.js`
- Modify: `src/database/schema.js`
- Create: `tests/user-admin-service.test.mjs`

- [ ] **Step 1: Add UI event constants test coverage**

In `tests/user-admin-service.test.mjs`, start with:

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
const userAdmin = await import('../src/services/user-admin.service.js');
const { STORAGE_KEYS, UI_EVENTS } = await import('../src/database/schema.js');

assert(UI_EVENTS.usersChanged === 'USERS_CHANGED', 'users changed event should exist');
assert(UI_EVENTS.permissionsChanged === 'PERMISSIONS_CHANGED', 'permissions changed event should exist');

storage.setItem(STORAGE_KEYS.users, []);
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {});
storage.ensureSeedData();
auth.login({ username: 'admin', password: 'admin123' });
```

- [ ] **Step 2: Add local mode behavior tests**

Append:

```js
const created = await userAdmin.createManagedUser({
  name: 'Operador Vitrine',
  username: 'operador-vitrine',
  password: '1234',
  role: 'operador',
  active: true
});

assert(created.id, 'created local user should have id');
assert(created.role === 'operador', 'created local user should use operador role');
assert(!Object.hasOwn(created, 'password'), 'created user should not expose password');

const updated = await userAdmin.updateManagedUser(created.id, {
  name: 'Operador Balcao',
  username: 'operador-balcao',
  role: 'caixa',
  active: false
});

assert(updated.name === 'Operador Balcao', 'updated user should change name');
assert(updated.role === 'caixa', 'updated user should change role');
assert(updated.active === false, 'updated user should change active status');

await userAdmin.setManagedPermissionOverride(created.id, 'sales.discount', 'allow');
assert(userAdmin.getManagedPermissionOverride(created.id, 'sales.discount') === 'allow', 'allow override should persist locally');

await userAdmin.setManagedPermissionOverride(created.id, 'sales.discount', 'default');
assert(userAdmin.getManagedPermissionOverride(created.id, 'sales.discount') === 'default', 'default override should remove local override');

console.log('user admin service ok');
```

- [ ] **Step 3: Run the user admin service test to verify it fails**

Run: `node tests/user-admin-service.test.mjs`

Expected: FAIL because `src/services/user-admin.service.js` and new UI events do not exist.

- [ ] **Step 4: Add UI events**

In `src/database/schema.js`, extend `UI_EVENTS`:

```js
  usersChanged: 'USERS_CHANGED',
  permissionsChanged: 'PERMISSIONS_CHANGED'
```

- [ ] **Step 5: Create `user-admin.service.js`**

Add:

```js
import { UI_EVENTS } from '../database/schema.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { createUser, getUsers, updateUser } from './auth.service.js';
import { emit } from './event-bus.service.js';
import {
  getUserPermissionOverride,
  setUserPermissionOverride
} from './permission.service.js';

export async function listManagedUsers() {
  if (isSupabaseEnabled()) {
    return listSupabaseProfiles();
  }

  return getUsers();
}

export async function createManagedUser(input) {
  if (isSupabaseEnabled()) {
    const user = await invokeAdminUsers('createUser', input);
    emit(UI_EVENTS.usersChanged, user);
    return user;
  }

  const user = createUser(input);
  emit(UI_EVENTS.usersChanged, user);
  return user;
}

export async function updateManagedUser(userId, patch) {
  if (isSupabaseEnabled()) {
    const user = await invokeAdminUsers('updateUser', { id: userId, ...patch });
    emit(UI_EVENTS.usersChanged, user);
    return user;
  }

  const user = updateUser(userId, patch);
  emit(UI_EVENTS.usersChanged, user);
  return user;
}

export function getManagedPermissionOverride(userId, permissionId) {
  return getUserPermissionOverride(userId, permissionId);
}

export async function setManagedPermissionOverride(userId, permissionId, state) {
  if (isSupabaseEnabled()) {
    await saveSupabasePermissionOverride({ userId, permissionId, state });
  }

  setUserPermissionOverride(userId, permissionId, state);
  emit(UI_EVENTS.permissionsChanged, { userId, permissionId, state });
}

async function listSupabaseProfiles() {
  const { getSupabaseClient } = await import('./supabase-client.service.js');
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('profiles')
    .select('id,name,role_id,is_active,created_at,updated_at')
    .order('name');

  if (error) {
    throw error;
  }

  return (data || []).map(mapProfile);
}

async function saveSupabasePermissionOverride({ userId, permissionId, state }) {
  const { getSupabaseClient } = await import('./supabase-client.service.js');
  const client = await getSupabaseClient();

  if (state === 'default') {
    const { error } = await client
      .from('user_permission_overrides')
      .delete()
      .eq('user_id', userId)
      .eq('permission_id', permissionId);

    if (error) {
      throw error;
    }
    return;
  }

  const { error } = await client.from('user_permission_overrides').upsert({
    user_id: userId,
    permission_id: permissionId,
    state,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw error;
  }
}

async function invokeAdminUsers(action, payload) {
  const { getSupabaseClient } = await import('./supabase-client.service.js');
  const client = await getSupabaseClient();
  const { data, error } = await client.functions.invoke('admin-users', {
    body: { action, payload }
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return mapProfile(data.user || data.profile || data);
}

function mapProfile(profile) {
  return {
    id: profile.id,
    name: profile.name,
    username: profile.email || profile.username || '',
    role: profile.role_id || profile.role || 'operador',
    active: profile.is_active !== false,
    createdAt: profile.created_at || profile.createdAt || '',
    updatedAt: profile.updated_at || profile.updatedAt || ''
  };
}
```

- [ ] **Step 6: Run the user admin service test**

Run: `node tests/user-admin-service.test.mjs`

Expected: PASS with `user admin service ok`.

- [ ] **Step 7: Commit**

```bash
git add src/database/schema.js src/services/user-admin.service.js tests/user-admin-service.test.mjs
git commit -m "feat: add user admin service"
```

---

### Task 4: Update Auth Service For Supabase Profiles

**Files:**
- Modify: `src/services/auth.service.js`
- Modify: `tests/auth-service.test.mjs`

- [ ] **Step 1: Add Supabase profile hydration assertions**

In `tests/auth-service.test.mjs`, update the fake Supabase client with a `.from('profiles')` handler:

```js
let profileSelectCalled = false;
supabaseClient.configureSupabaseClientForTests({
  client: {
    auth: {
      async setSession(session) {
        supabaseSessionPayload = session;
      },
      async getUser() {
        return { data: { user: { id: 'supabase-user', email: 'luandutra27@gmail.com' } }, error: null };
      }
    },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                single() {
                  profileSelectCalled = table === 'profiles';
                  return Promise.resolve({
                    data: {
                      id: 'supabase-user',
                      name: 'Luan Dutra',
                      role_id: 'gerente',
                      is_active: true
                    },
                    error: null
                  });
                }
              };
            }
          };
        }
      };
    }
  }
});
```

Add after Supabase login:

```js
assert(profileSelectCalled, 'supabase login should load public profile');
assert(supabaseSession.user.role === 'gerente', 'supabase login should use profile role');
```

- [ ] **Step 2: Run auth test to verify it fails**

Run: `node tests/auth-service.test.mjs`

Expected: FAIL because login still uses `user_metadata` fallback instead of loading `profiles`.

- [ ] **Step 3: Implement profile loading**

Add helper in `auth.service.js`:

```js
async function getSupabaseProfile(userId) {
  const client = await getSupabaseClient();

  if (!client?.from) {
    return null;
  }

  const { data, error } = await client
    .from('profiles')
    .select('id,name,role_id,is_active,created_at,updated_at')
    .eq('id', userId)
    .single();

  if (error) {
    return null;
  }

  return data;
}
```

Update `loginWithSupabase()`:

```js
const profile = await getSupabaseProfile(data.user.id);

return {
  user: ensureSupabaseLocalSession(data.user, profile),
  session: data.session
};
```

Update `ensureSupabaseLocalSession()` signature and user mapping:

```js
function ensureSupabaseLocalSession(authUser, profile = null) {
  const users = getRawUsers();
  const email = normalizeEmail(authUser.email || '');
  const existingUser = users.find((user) => user.id === authUser.id || user.username === email);
  const now = new Date().toISOString();
  const user = {
    ...(existingUser || {}),
    id: authUser.id,
    name: profile?.name || existingUser?.name || email || 'Usuario',
    username: email,
    password: existingUser?.password || '',
    role: profile?.role_id || existingUser?.role || 'operador',
    active: profile?.is_active !== false,
    createdAt: profile?.created_at || existingUser?.createdAt || now,
    updatedAt: profile?.updated_at || now
  };
```

- [ ] **Step 4: Run auth test**

Run: `node tests/auth-service.test.mjs`

Expected: PASS with `auth service ok`.

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.service.js tests/auth-service.test.mjs
git commit -m "feat: load supabase auth profiles"
```

---

### Task 5: Add Supabase Edge Function For Admin Users

**Files:**
- Create: `supabase/functions/admin-users/index.ts`
- Create: `supabase/functions/admin-users/deno.json`

- [ ] **Step 1: Create the function directory**

Run: `New-Item -ItemType Directory -Force -Path 'supabase\functions\admin-users'`

Expected: directory exists.

- [ ] **Step 2: Create `deno.json`**

Create `supabase/functions/admin-users/deno.json`:

```json
{
  "imports": {
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 3: Create the Edge Function**

Create `supabase/functions/admin-users/index.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type Action = 'createUser' | 'updateUser';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Metodo nao permitido.' }, 405);
  }

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL');
    const anonKey = requiredEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = req.headers.get('Authorization') || '';

    if (!authorization.startsWith('Bearer ')) {
      return json({ error: 'Sessao obrigatoria.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } }
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return json({ error: 'Sessao invalida.' }, 401);
    }

    const { action, payload } = await req.json() as { action: Action; payload: Record<string, unknown> };
    await assertPermission(adminClient, authData.user.id, action === 'updateUser' ? 'users.manage' : 'users.manage');

    if (action === 'createUser') {
      return json({ user: await createManagedUser(adminClient, payload) });
    }

    if (action === 'updateUser') {
      return json({ user: await updateManagedUser(adminClient, payload) });
    }

    return json({ error: 'Acao invalida.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 400);
  }
});

async function createManagedUser(client: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const name = requiredString(payload.name, 'Nome obrigatorio.');
  const email = normalizeEmail(requiredString(payload.username, 'Usuario/email obrigatorio.'));
  const password = requiredString(payload.password, 'Senha obrigatoria.');
  const role = requiredRole(payload.role);
  const active = payload.active !== false;

  const { data: created, error: createError } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (createError || !created.user) {
    throw new Error(createError?.message || 'Nao foi possivel criar usuario.');
  }

  const profile = await upsertProfile(client, {
    id: created.user.id,
    name,
    email,
    role,
    active
  });

  return profile;
}

async function updateManagedUser(client: ReturnType<typeof createClient>, payload: Record<string, unknown>) {
  const id = requiredString(payload.id, 'Usuario obrigatorio.');
  const name = optionalString(payload.name);
  const email = optionalString(payload.username);
  const password = optionalString(payload.password);
  const role = payload.role === undefined ? undefined : requiredRole(payload.role);
  const active = payload.active === undefined ? undefined : payload.active !== false;

  const authPatch: Record<string, unknown> = {};
  if (email) authPatch.email = normalizeEmail(email);
  if (password) authPatch.password = password;

  if (Object.keys(authPatch).length) {
    const { error } = await client.auth.admin.updateUserById(id, authPatch);
    if (error) throw new Error(error.message);
  }

  const { data: existing, error: existingError } = await client
    .from('profiles')
    .select('id,name,role_id,is_active')
    .eq('id', id)
    .single();

  if (existingError || !existing) {
    throw new Error('Usuario nao encontrado.');
  }

  return upsertProfile(client, {
    id,
    name: name || existing.name,
    email: email ? normalizeEmail(email) : undefined,
    role: role || existing.role_id,
    active: active ?? existing.is_active
  });
}

async function upsertProfile(
  client: ReturnType<typeof createClient>,
  profile: { id: string; name: string; email?: string; role: string; active: boolean }
) {
  const { data, error } = await client
    .from('profiles')
    .upsert({
      id: profile.id,
      name: profile.name,
      role_id: profile.role,
      is_active: profile.active,
      updated_at: new Date().toISOString()
    })
    .select('id,name,role_id,is_active,created_at,updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel salvar perfil.');
  }

  return {
    id: data.id,
    name: data.name,
    username: profile.email || '',
    role: data.role_id,
    active: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  };
}

async function assertPermission(client: ReturnType<typeof createClient>, userId: string, permissionId: string) {
  const { data: profile, error } = await client
    .from('profiles')
    .select('id,role_id,is_active')
    .eq('id', userId)
    .single();

  if (error || !profile || profile.is_active === false) {
    throw new Error('Usuario sem permissao para esta acao.');
  }

  if (profile.role_id === 'admin') {
    return;
  }

  const { data: override } = await client
    .from('user_permission_overrides')
    .select('state')
    .eq('user_id', userId)
    .eq('permission_id', permissionId)
    .maybeSingle();

  if (override?.state === 'allow') {
    return;
  }

  if (override?.state === 'deny') {
    throw new Error('Usuario sem permissao para esta acao.');
  }

  const { data: rolePermission } = await client
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', profile.role_id)
    .eq('permission_id', permissionId)
    .maybeSingle();

  if (!rolePermission) {
    throw new Error('Usuario sem permissao para esta acao.');
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variavel ${name} nao configurada.`);
  return value;
}

function requiredString(value: unknown, message: string) {
  const text = String(value || '').trim();
  if (!text) throw new Error(message);
  return text;
}

function optionalString(value: unknown) {
  const text = String(value || '').trim();
  return text || '';
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase().replace(/,com$/i, '.com');
}

function requiredRole(value: unknown) {
  const role = String(value || '').trim();
  if (!['admin', 'gerente', 'caixa', 'operador'].includes(role)) {
    throw new Error('Perfil invalido.');
  }
  return role;
}
```

- [ ] **Step 4: Validate TypeScript syntax with Deno or Supabase local serve**

Run: `npx.cmd supabase functions serve admin-users --no-verify-jwt`

Expected: the function starts without TypeScript syntax errors. Stop it after the compile check.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/admin-users
git commit -m "feat: add admin users edge function"
```

---

### Task 6: Refactor Pessoas Module To Async User Admin Service

**Files:**
- Modify: `src/modules/pessoas/pessoas.module.js`
- Create: `tests/pessoas-module.test.mjs`

- [ ] **Step 1: Write the Pessoas module interaction test**

Create `tests/pessoas-module.test.mjs` with a lightweight DOM harness:

```js
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

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

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js');

storage.setItem(STORAGE_KEYS.users, []);
storage.setItem(STORAGE_KEYS.userPermissionOverrides, {});
storage.ensureSeedData();
auth.login({ username: 'admin', password: 'admin123' });

const listeners = {};
const container = {
  innerHTML: '',
  addEventListener(eventName, handler) {
    listeners[eventName] = handler;
  },
  querySelector() {
    return null;
  }
};

await initPessoasModule(container);

assert(container.innerHTML.includes('Pessoas'), 'people screen should render title');
assert(container.innerHTML.includes('Gerente'), 'role select should include Gerente');
assert(container.innerHTML.includes('Caixa'), 'role select should include Caixa');
assert(container.innerHTML.includes('Operador'), 'role select should include Operador');
assert(container.innerHTML.includes('Cadastrar usuario'), 'new mode should show create label');
assert(container.innerHTML.includes('data-permission-select'), 'permissions should render selects');

console.log('pessoas module ok');
```

- [ ] **Step 2: Run Pessoas test to verify it fails**

Run: `node tests/pessoas-module.test.mjs`

Expected: FAIL if `initPessoasModule` is not async or roles do not include Gerente/Caixa/Operador.

- [ ] **Step 3: Update imports**

Replace imports from `auth.service.js` and permission writes with:

```js
import {
  createManagedUser,
  getManagedPermissionOverride,
  listManagedUsers,
  setManagedPermissionOverride,
  updateManagedUser
} from '../../services/user-admin.service.js';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js';
import { PERMISSIONS, getRolePermissions } from '../../services/permission.service.js';
```

- [ ] **Step 4: Add async state**

At the top:

```js
const peopleState = {
  editingUserId: null,
  selectedUserId: null,
  users: [],
  loading: false,
  message: '',
  error: ''
};
```

- [ ] **Step 5: Make initialization async**

Replace `initPessoasModule` with:

```js
export async function initPessoasModule(container) {
  peopleState.loading = true;
  renderPeople(container);

  if (!boundContainers.has(container)) {
    bindPeopleEvents(container);
    boundContainers.add(container);
  }

  try {
    peopleState.users = await listManagedUsers();
    peopleState.error = '';
  } catch (error) {
    peopleState.error = error.message || 'Nao foi possivel carregar usuarios.';
  } finally {
    peopleState.loading = false;
    ensureSelectedUser();
    renderPeople(container);
  }
}
```

- [ ] **Step 6: Replace user reads**

In `renderPeople()` and `ensureSelectedUser()`, use `peopleState.users` instead of `getUsers()`.

- [ ] **Step 7: Update submit handler to await service**

Make the submit event handler async and replace save call:

```js
const user = editingUserId
  ? await updateManagedUser(editingUserId, payload)
  : await createManagedUser(payload);

peopleState.message = editingUserId ? 'Usuario atualizado com sucesso.' : 'Usuario cadastrado com sucesso.';
peopleState.error = '';
peopleState.users = await listManagedUsers();
```

- [ ] **Step 8: Update permission change handler**

Make change listener async and replace permission save:

```js
await setManagedPermissionOverride(userId, permissionId, state);
peopleState.message = 'Permissao atualizada com sucesso.';
peopleState.users = await listManagedUsers();
```

- [ ] **Step 9: Add role options**

Replace role select options:

```html
<option value="operador" ${user?.role === 'operador' ? 'selected' : ''}>Operador</option>
<option value="caixa" ${user?.role === 'caixa' ? 'selected' : ''}>Caixa</option>
<option value="gerente" ${user?.role === 'gerente' ? 'selected' : ''}>Gerente</option>
<option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
```

- [ ] **Step 10: Update `getRoleLabel()`**

```js
function getRoleLabel(role) {
  const labels = {
    admin: 'Administrador',
    gerente: 'Gerente',
    caixa: 'Caixa',
    operador: 'Operador',
    operator: 'Operador'
  };

  return labels[role] || 'Operador';
}
```

- [ ] **Step 11: Run Pessoas test**

Run: `node tests/pessoas-module.test.mjs`

Expected: PASS with `pessoas module ok`.

- [ ] **Step 12: Commit**

```bash
git add src/modules/pessoas/pessoas.module.js tests/pessoas-module.test.mjs
git commit -m "feat: connect pessoas module to user admin service"
```

---

### Task 7: Polish Pessoas Styles With Current Theme

**Files:**
- Modify: `src/styles/cards.css`
- Modify: `src/styles/forms.css`

- [ ] **Step 1: Update people card styles**

In `src/styles/cards.css`, update the people selectors:

```css
.people-grid {
  display: grid;
  grid-template-columns: minmax(260px, 0.8fr) minmax(360px, 1.2fr);
  gap: 16px;
  align-items: start;
}

.people-list {
  gap: 10px;
  max-height: 420px;
  overflow: auto;
}

.people-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
}

.people-row.is-selected {
  border-color: var(--color-primary);
  background: var(--crm-orange-soft);
}

.people-row__main {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--color-text);
  text-align: left;
  padding: 0;
}

.permission-panel {
  margin-top: 16px;
}
```

- [ ] **Step 2: Update permission grid styles**

In `src/styles/forms.css`, update the permission selectors:

```css
.people-form {
  padding: 16px;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 14px;
}

.permission-group {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 12px;
}

.permission-group h3 {
  margin: 0 0 10px;
  color: var(--color-text);
}

.permission-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(124px, 156px);
  gap: 10px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--color-border);
}

.permission-row:first-of-type {
  border-top: 0;
}

.permission-row strong {
  display: block;
  color: var(--color-text);
  line-height: 1.15;
}

.permission-row small {
  color: var(--color-text-muted);
}

@media (max-width: 860px) {
  .people-grid,
  .permission-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run layout-oriented tests**

Run:

```powershell
node tests/pessoas-module.test.mjs
node tests/permission-service.test.mjs
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add src/styles/cards.css src/styles/forms.css
git commit -m "style: polish pessoas screen"
```

---

### Task 8: Hydrate Permissions After Login And Refresh Navigation

**Files:**
- Modify: `src/app.js`
- Modify: `src/components/sidebar.component.js`
- Modify: `src/services/user-admin.service.js`

- [ ] **Step 1: Add permission hydration function**

In `user-admin.service.js`, add:

```js
export async function hydrateManagedUsersAndPermissions() {
  if (!isSupabaseEnabled()) {
    return;
  }

  const users = await listManagedUsers();
  await hydrateSupabasePermissionOverrides();
  emit(UI_EVENTS.usersChanged, users);
  emit(UI_EVENTS.permissionsChanged, {});
}

async function hydrateSupabasePermissionOverrides() {
  const { STORAGE_KEYS } = await import('../database/schema.js');
  const { setItem } = await import('./storage.service.js');
  const { getSupabaseClient } = await import('./supabase-client.service.js');
  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('user_permission_overrides')
    .select('user_id,permission_id,state');

  if (error) {
    throw error;
  }

  const overrides = {};
  (data || []).forEach((row) => {
    overrides[row.user_id] = overrides[row.user_id] || {};
    overrides[row.user_id][row.permission_id] = row.state;
  });

  setItem(STORAGE_KEYS.userPermissionOverrides, overrides);
}
```

- [ ] **Step 2: Call hydration in app bootstrap**

In `src/app.js`, import:

```js
import { hydrateManagedUsersAndPermissions } from './services/user-admin.service.js';
```

Inside the authenticated bootstrap try block, after online data hydration:

```js
await hydrateManagedUsersAndPermissions();
```

- [ ] **Step 3: Add sidebar refresh listener**

After rendering the shell in `bootstrap()`, add:

```js
on(UI_EVENTS.permissionsChanged, () => {
  const user = getCurrentUser();
  const sidebar = app.querySelector('.sidebar');
  if (user && sidebar) {
    sidebar.outerHTML = renderSidebar(user);
    setActiveMenu(app, workspace.dataset.activeRoute);
  }
});
```

- [ ] **Step 4: Update sidebar permission names**

In `src/components/sidebar.component.js`, ensure CRM-related report entries use current permissions:

```js
{ id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX', permission: 'cash.close' },
{ id: 'fichario-fiado', label: 'Fichario / Fiado', icon: 'FI', permission: 'crm.view' },
{ id: 'despesas', label: 'Despesas', icon: 'DE', permission: 'crm.view' }
```

- [ ] **Step 5: Run app-adjacent tests**

Run:

```powershell
node tests/permission-service.test.mjs
node tests/user-admin-service.test.mjs
node tests/login-module.test.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/components/sidebar.component.js src/services/user-admin.service.js
git commit -m "feat: hydrate user permissions after login"
```

---

### Task 9: Verify Sensitive Service Permissions Against New Roles

**Files:**
- Modify: `tests/transaction-service.test.mjs`
- Modify: `tests/cash-closing-service.test.mjs`
- Modify: `tests/estoque-service.test.mjs`
- Modify: service files only if tests expose mismatches

- [ ] **Step 1: Add operator denial tests for cash close and discounts**

In `tests/transaction-service.test.mjs`, after the existing operator section, add:

```js
const operadorRestrito = auth.createUser({
  name: 'Operador Restrito',
  username: 'operador-restrito',
  password: '1234',
  role: 'operador'
});

auth.logout();
auth.login({ username: 'operador-restrito', password: '1234' });

let cashMovementDenied = false;
try {
  transactions.registerCashMovement({
    type: 'entrada',
    amount: 10,
    category: 'teste',
    description: 'Teste bloqueado'
  });
} catch (error) {
  cashMovementDenied = error.message === 'Usuario sem permissao para esta acao.';
}

assert(cashMovementDenied, 'operador should not register cash movement by default');
```

- [ ] **Step 2: Add caixa allowed cash close test**

In `tests/cash-closing-service.test.mjs`, add a user with role `caixa`, login, build a valid draft, and assert `confirmClosing()` succeeds:

```js
const caixaUser = auth.createUser({
  name: 'Caixa Fechamento',
  username: 'caixa-fechamento',
  password: '1234',
  role: 'caixa'
});

auth.logout();
auth.login({ username: 'caixa-fechamento', password: '1234' });

const caixaDraft = cashClosing.saveClosingDraft({
  countedCash: '0',
  checkedPix: '',
  checkedDebit: '',
  checkedCredit: '',
  leftovers: {},
  differences: []
});

const caixaClosing = cashClosing.confirmClosing(caixaDraft);
assert(caixaClosing.createdBy === caixaUser.id, 'caixa should close cash by default');
```

- [ ] **Step 3: Add operador showcase launch allowed test**

In `tests/estoque-service.test.mjs`, add:

```js
const operadorVitrine = auth.createUser({
  name: 'Operador Vitrine',
  username: 'operador-vitrine',
  password: '1234',
  role: 'operador'
});

auth.logout();
auth.login({ username: 'operador-vitrine', password: '1234' });

const launchByOperator = estoque.createStockLaunch({
  produtoId: mockProducts[0].id,
  quantidade: 1,
  note: 'Teste operador'
});

assert(launchByOperator.usuarioId === operadorVitrine.id, 'operador should launch showcase by default');
```

- [ ] **Step 4: Run tests to verify current enforcement**

Run:

```powershell
node tests/transaction-service.test.mjs
node tests/cash-closing-service.test.mjs
node tests/estoque-service.test.mjs
```

Expected: PASS if Task 1 role defaults are correct. If a test fails because the service uses the wrong permission id, update that service to the catalog id from the spec and rerun.

- [ ] **Step 5: Commit**

```bash
git add tests/transaction-service.test.mjs tests/cash-closing-service.test.mjs tests/estoque-service.test.mjs src/services/transaction.service.js src/services/cash-closing.service.js src/services/estoque.service.js
git commit -m "test: verify role permission enforcement"
```

---

### Task 10: Extend Supabase Provider Tests For User Permission Tables

**Files:**
- Modify: `src/services/providers/supabase.provider.js`
- Modify: `tests/supabase-provider.test.mjs`

- [ ] **Step 1: Add hydrate expectations**

In `tests/supabase-provider.test.mjs`, extend fake client `select()`:

```js
if (table === 'profiles') {
  return Promise.resolve({
    data: [{ id: 'user-1', name: 'Caixa', role_id: 'caixa', is_active: true }],
    error: null
  });
}

if (table === 'user_permission_overrides') {
  return Promise.resolve({
    data: [{ user_id: 'user-1', permission_id: 'sales.discount', state: 'allow' }],
    error: null
  });
}
```

After hydrate assertions:

```js
await provider.hydrate([STORAGE_KEYS.users, STORAGE_KEYS.userPermissionOverrides]);
assert(provider.read(STORAGE_KEYS.users, [])[0].role === 'caixa', 'hydrate should cache profiles as users');
assert(
  provider.read(STORAGE_KEYS.userPermissionOverrides, {})['user-1']['sales.discount'] === 'allow',
  'hydrate should cache permission overrides'
);
```

- [ ] **Step 2: Run provider test to verify it fails**

Run: `node tests/supabase-provider.test.mjs`

Expected: FAIL because provider does not map user keys yet.

- [ ] **Step 3: Add mappers**

In `TABLE_MAPPERS`, add:

```js
[STORAGE_KEYS.users]: {
  table: 'profiles',
  select: 'id,name,role_id,is_active,created_at,updated_at',
  unmap: (row) => ({
    id: row.id,
    name: row.name,
    username: row.email || '',
    role: row.role_id,
    active: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  })
},
[STORAGE_KEYS.userPermissionOverrides]: {
  table: 'user_permission_overrides',
  select: 'user_id,permission_id,state',
  unmapCollection: (rows) => rows.reduce((overrides, row) => {
    overrides[row.user_id] = overrides[row.user_id] || {};
    overrides[row.user_id][row.permission_id] = row.state;
    return overrides;
  }, {})
}
```

Update `hydrateCollection()`:

```js
if (Array.isArray(data)) {
  localProvider.write(key, mapper.unmapCollection ? mapper.unmapCollection(data) : data.map(mapper.unmap));
}
```

- [ ] **Step 4: Run provider test**

Run: `node tests/supabase-provider.test.mjs`

Expected: PASS with `supabase provider ok`.

- [ ] **Step 5: Commit**

```bash
git add src/services/providers/supabase.provider.js tests/supabase-provider.test.mjs
git commit -m "feat: hydrate user permission data"
```

---

### Task 11: Full Verification

**Files:**
- No code changes expected unless verification finds a bug.

- [ ] **Step 1: Run focused automated tests**

Run:

```powershell
node tests/permission-service.test.mjs
node tests/auth-service.test.mjs
node tests/user-admin-service.test.mjs
node tests/pessoas-module.test.mjs
node tests/supabase-provider.test.mjs
node tests/users-permissions-migration.test.mjs
node tests/transaction-service.test.mjs
node tests/cash-closing-service.test.mjs
node tests/estoque-service.test.mjs
node tests/login-module.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Start local server**

Run: `scripts\start-server.cmd`

Expected: local server serves `http://127.0.0.1:5500/`.

- [ ] **Step 3: Browser smoke test**

Open `http://127.0.0.1:5500/?username=admin&password=admin123&view=pessoas`.

Expected:

- Pessoas screen loads.
- User list is visible.
- Role select includes Administrador, Gerente, Caixa, Operador.
- Permission cards use current warm theme colors.
- New user mode and edit mode switch correctly.

- [ ] **Step 4: Supabase deployment checks**

Run:

```powershell
npx.cmd supabase migration list
npx.cmd supabase functions deploy admin-users
```

Expected:

- Migration list includes `align_users_permissions`.
- Function deploy succeeds.

- [ ] **Step 5: Manual online test checklist**

In the deployed/online app:

1. Login as administrator.
2. Create an Operador user.
3. Confirm the user appears in Pessoas immediately.
4. Confirm the user exists in Supabase Auth.
5. Confirm `public.profiles` has the same user id, name, role, and active status.
6. Edit name and role to Caixa.
7. Disable the user and confirm login is blocked.
8. Re-enable the user.
9. Set one permission to Bloqueado.
10. Logout/login as that user.
11. Confirm the blocked menu/action does not work.
12. Set the permission to Liberado.
13. Logout/login again and confirm the action works.
14. Open another browser/computer and confirm the same user and permissions appear.

- [ ] **Step 6: Commit any verification fixes**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: verify pessoas user permissions"
```

If no fixes were needed, do not create an empty commit.

---

## Plan Self-Review

- Spec coverage: The plan covers Supabase Auth through Edge Function, `profiles`, `roles`, `permissions`, `role_permissions`, new `user_permission_overrides`, four approved profiles, Pessoas UI, current theme colors, permission enforcement, automated tests, and manual online verification.
- Scope check: This remains one coherent subsystem: user and permission management. It touches auth, permissions, Pessoas, and route/action enforcement because those are required for the feature to work end to end.
- Placeholder scan: No `TBD`, `TODO`, or undefined task remains. Steps include exact files, commands, expected outcomes, and implementation snippets.
- Type consistency: Roles use `admin`, `gerente`, `caixa`, `operador`. Overrides use `default`, `allow`, `deny`; only `allow` and `deny` are stored in Supabase. User shape uses `id`, `name`, `username`, `role`, `active`, `createdAt`, `updatedAt`.
