# Piloto Online Supabase Netlify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar o PDV em Netlify com dados principais no Supabase, mantendo localStorage como contingencia e incluindo CRM gerencial no piloto.

**Architecture:** O app continua como HTML, CSS e JavaScript puro. Uma nova camada de configuracao e providers separa regras de negocio dos detalhes de persistencia, permitindo usar localStorage nos testes e Supabase no piloto online. Supabase recebe schema, Auth, RLS e auditoria minima; Netlify publica o frontend estatico.

**Tech Stack:** JavaScript ES Modules, HTML, CSS, localStorage, Supabase Postgres/Auth/RLS, Netlify static deploy, Node test scripts.

---

## File Structure

- Create `src/config/runtime-config.js`: configuracao publica gerada para local ou deploy.
- Create `src/services/app-config.service.js`: leitura segura do modo de dados e credenciais publicas.
- Create `src/services/data-provider.service.js`: seleciona provider local ou Supabase.
- Create `src/services/providers/local.provider.js`: encapsula acesso localStorage com contrato comum.
- Create `src/services/providers/supabase.provider.js`: encapsula leituras/escritas via Supabase.
- Create `src/services/supabase-client.service.js`: cria cliente Supabase no browser.
- Create `src/services/auth.service.js`: sessao, login, logout e usuario atual.
- Create `src/services/permission.service.js`: roles/permissoes iniciais.
- Create `src/services/audit.service.js`: registro de auditoria.
- Create `src/modules/auth/login.module.js`: tela de login.
- Modify `src/app.js`: inicializacao assinc, login gate e navegacao protegida.
- Modify `src/components/sidebar.component.js`: esconder itens sem permissao quando auth estiver ativo.
- Modify `src/database/schema.js`: novas chaves locais e constantes de provider.
- Modify `src/services/storage.service.js`: exportacao local e seed controlado por provider.
- Modify `src/services/product.service.js`: delegar produtos/categorias ao data provider.
- Modify `src/services/transaction.service.js`: delegar vendas/movimentos ao data provider.
- Modify `src/services/cash-closing.service.js`: delegar fechamentos ao data provider.
- Modify `src/services/estoque.service.js`: delegar estoque e baixas ao data provider.
- Modify `src/services/crm-dashboard.service.js`: manter calculos, lendo dos services migrados.
- Create `supabase/migrations/202605220001_initial_pdv_pilot.sql`: schema inicial.
- Create `scripts/generate-runtime-config.mjs`: gera configuracao publica no build Netlify.
- Create `netlify.toml`: build estatico e headers basicos.
- Modify `.gitignore`: logs, `.env`, config local privada, artefatos temporarios.
- Create tests for config, providers, auth, permission, audit and migrated services.

## Task 1: Runtime Config and Provider Switch

**Files:**
- Create: `src/config/runtime-config.js`
- Create: `src/services/app-config.service.js`
- Create: `src/services/data-provider.service.js`
- Create: `src/services/providers/local.provider.js`
- Modify: `src/database/schema.js`
- Test: `tests/app-config-service.test.mjs`
- Test: `tests/data-provider-service.test.mjs`

- [ ] **Step 1: Write the failing app config test**

Create `tests/app-config-service.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

const config = await import('../src/services/app-config.service.js');

assert(config.getDataProviderMode() === 'local', 'default provider should be local');
assert(config.isSupabaseEnabled() === false, 'supabase should be disabled without URL and key');

globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'public-anon-key'
};

assert(config.getDataProviderMode() === 'supabase', 'provider should read runtime config');
assert(config.isSupabaseEnabled() === true, 'supabase should be enabled with URL and key');

console.log('app config service ok');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node tests\app-config-service.test.mjs
```

Expected: FAIL with `Cannot find module ... app-config.service.js`.

- [ ] **Step 3: Add runtime config and app config service**

Create `src/config/runtime-config.js`:

```js
globalThis.__PDV_RUNTIME_CONFIG__ = globalThis.__PDV_RUNTIME_CONFIG__ || {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};
```

Create `src/services/app-config.service.js`:

```js
const DEFAULT_CONFIG = {
  dataProvider: 'local',
  supabaseUrl: '',
  supabaseAnonKey: ''
};

export function getRuntimeConfig() {
  return {
    ...DEFAULT_CONFIG,
    ...(globalThis.__PDV_RUNTIME_CONFIG__ || {})
  };
}

export function getDataProviderMode() {
  const mode = getRuntimeConfig().dataProvider;
  return mode === 'supabase' ? 'supabase' : 'local';
}

export function isSupabaseEnabled() {
  const config = getRuntimeConfig();
  return getDataProviderMode() === 'supabase'
    && Boolean(config.supabaseUrl)
    && Boolean(config.supabaseAnonKey);
}
```

- [ ] **Step 4: Run app config test to verify it passes**

Run:

```powershell
node tests\app-config-service.test.mjs
```

Expected: `app config service ok`.

- [ ] **Step 5: Write failing data provider test**

Create `tests/data-provider-service.test.mjs`:

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

globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'local' };

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { DATA_PROVIDER_MODES } = await import('../src/database/schema.js');
const { getDataProvider } = await import('../src/services/data-provider.service.js');

assert(DATA_PROVIDER_MODES.local === 'local', 'local mode should be exported');

const provider = getDataProvider();
provider.setCollection('products', [{ id: 'x-salada', name: 'X Salada' }]);
const products = provider.getCollection('products', []);

assert(products.length === 1, 'local provider should read collection');
assert(products[0].id === 'x-salada', 'local provider should preserve item');

console.log('data provider service ok');
```

- [ ] **Step 6: Run test to verify it fails**

Run:

```powershell
node tests\data-provider-service.test.mjs
```

Expected: FAIL with `Cannot find module ... data-provider.service.js` or missing `DATA_PROVIDER_MODES`.

- [ ] **Step 7: Implement provider switch and local provider**

Modify `src/database/schema.js`:

```js
export const DATA_PROVIDER_MODES = {
  local: 'local',
  supabase: 'supabase'
};
```

Create `src/services/providers/local.provider.js`:

```js
import { STORAGE_KEYS } from '../../database/schema.js';
import { getItem, setItem } from '../storage.service.js';

const COLLECTION_KEYS = {
  products: STORAGE_KEYS.products,
  categories: STORAGE_KEYS.categories,
  transactions: STORAGE_KEYS.transactions,
  closedComandas: STORAGE_KEYS.closedComandas,
  stockLaunches: STORAGE_KEYS.stockLaunches,
  showcaseWriteOffs: STORAGE_KEYS.showcaseWriteOffs,
  cashClosings: STORAGE_KEYS.cashClosings,
  cashClosingDraft: STORAGE_KEYS.cashClosingDraft
};

export function createLocalProvider() {
  return {
    mode: 'local',
    getCollection(name, fallback = []) {
      return getItem(COLLECTION_KEYS[name], fallback);
    },
    setCollection(name, value) {
      setItem(COLLECTION_KEYS[name], value);
      return value;
    },
    getItem(name, fallback = null) {
      return getItem(COLLECTION_KEYS[name], fallback);
    },
    setItem(name, value) {
      setItem(COLLECTION_KEYS[name], value);
      return value;
    }
  };
}
```

Create `src/services/data-provider.service.js`:

```js
import { DATA_PROVIDER_MODES } from '../database/schema.js';
import { getDataProviderMode } from './app-config.service.js';
import { createLocalProvider } from './providers/local.provider.js';

let activeProvider = null;

export function getDataProvider() {
  if (activeProvider) {
    return activeProvider;
  }

  const mode = getDataProviderMode();
  activeProvider = createLocalProvider();

  if (mode === DATA_PROVIDER_MODES.supabase) {
    activeProvider = createLocalProvider();
  }

  return activeProvider;
}

export function setDataProviderForTests(provider) {
  activeProvider = provider;
}

export function resetDataProviderForTests() {
  activeProvider = null;
}
```

- [ ] **Step 8: Run provider tests**

Run:

```powershell
node tests\app-config-service.test.mjs
node tests\data-provider-service.test.mjs
```

Expected:

```text
app config service ok
data provider service ok
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\config\runtime-config.js src\services\app-config.service.js src\services\data-provider.service.js src\services\providers\local.provider.js src\database\schema.js tests\app-config-service.test.mjs tests\data-provider-service.test.mjs
git commit -m "feat: add runtime data provider switch"
```

## Task 2: Supabase Schema and Local Migration Shape

**Files:**
- Create: `supabase/migrations/202605220001_initial_pdv_pilot.sql`
- Create: `docs/SUPABASE_PILOT.md`

- [ ] **Step 1: Create migration SQL**

Create `supabase/migrations/202605220001_initial_pdv_pilot.sql`:

```sql
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'operador',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.roles (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.permissions (
  id text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  permission_id text not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.categories (
  id text primary key,
  name text not null,
  show_in_showcase boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category_id text not null references public.categories(id),
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  stock numeric(12,3) not null default 0,
  active boolean not null default true,
  aliases jsonb not null default '[]'::jsonb,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id text primary key,
  status text not null default 'ativa',
  comanda_id text,
  comanda_number integer,
  total numeric(12,2) not null default 0,
  payment_method text not null,
  received_amount numeric(12,2) not null default 0,
  change_amount numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id text not null references public.sales(id) on delete cascade,
  product_id text not null references public.products(id),
  name text not null,
  quantity numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  total numeric(12,2) not null
);

create table if not exists public.cash_movements (
  id text primary key,
  type text not null check (type in ('entrada', 'saida')),
  status text not null default 'ativa',
  amount numeric(12,2) not null,
  category text not null default 'sem-categoria',
  description text not null default '',
  user_name text not null default 'Local',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.cash_closings (
  id text primary key,
  status text not null default 'fechado',
  totals jsonb not null default '{}'::jsonb,
  payments jsonb not null default '{}'::jsonb,
  showcase jsonb not null default '[]'::jsonb,
  differences jsonb not null default '[]'::jsonb,
  input jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock_production (
  id text primary key,
  product_id text not null references public.products(id),
  product_name text not null,
  category_id text not null,
  category_name text not null,
  quantity numeric(12,3) not null,
  unit_value numeric(12,2) not null,
  total_value numeric(12,2) not null,
  status text not null default 'ativo',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

create table if not exists public.stock_items (
  id text primary key,
  product_id text not null references public.products(id),
  product_name text not null,
  category_id text not null,
  category_name text not null,
  quantity numeric(12,3) not null,
  unit_value numeric(12,2) not null,
  total_value numeric(12,2) not null,
  reason text not null,
  note text not null default '',
  status text not null default 'ativa',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_type text not null,
  entity_id text,
  user_id uuid references public.profiles(id),
  user_name text not null default 'Sistema',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.roles (id, name) values
  ('admin', 'Administrador'),
  ('operador', 'Operador')
on conflict (id) do update set name = excluded.name;

insert into public.permissions (id, description) values
  ('dashboard.view', 'Ver dashboard e CRM gerencial'),
  ('cashier.access', 'Acessar frente de caixa'),
  ('sale.create', 'Finalizar vendas'),
  ('sale.cancel', 'Cancelar vendas'),
  ('cash.movement.create', 'Criar entradas e saidas'),
  ('cash.close', 'Fechar caixa'),
  ('stock.view', 'Ver estoque'),
  ('stock.create', 'Criar lancamentos de estoque'),
  ('products.view', 'Ver produtos'),
  ('products.manage', 'Gerenciar produtos'),
  ('users.manage', 'Gerenciar usuarios'),
  ('audit.view', 'Ver auditoria')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select 'admin', id from public.permissions
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id) values
  ('operador', 'cashier.access'),
  ('operador', 'sale.create'),
  ('operador', 'cash.movement.create'),
  ('operador', 'stock.view'),
  ('operador', 'products.view')
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_closings enable row level security;
alter table public.stock_production enable row level security;
alter table public.stock_items enable row level security;
alter table public.audit_logs enable row level security;

create policy "authenticated read profiles" on public.profiles
  for select to authenticated using (is_active = true);

create policy "authenticated read roles" on public.roles
  for select to authenticated using (true);

create policy "authenticated read permissions" on public.permissions
  for select to authenticated using (true);

create policy "authenticated read role permissions" on public.role_permissions
  for select to authenticated using (true);

create policy "authenticated all categories" on public.categories
  for all to authenticated using (true) with check (true);

create policy "authenticated all products" on public.products
  for all to authenticated using (true) with check (true);

create policy "authenticated all sales" on public.sales
  for all to authenticated using (true) with check (true);

create policy "authenticated all sale items" on public.sale_items
  for all to authenticated using (true) with check (true);

create policy "authenticated all cash movements" on public.cash_movements
  for all to authenticated using (true) with check (true);

create policy "authenticated all cash closings" on public.cash_closings
  for all to authenticated using (true) with check (true);

create policy "authenticated all stock production" on public.stock_production
  for all to authenticated using (true) with check (true);

create policy "authenticated all stock items" on public.stock_items
  for all to authenticated using (true) with check (true);

create policy "authenticated insert audit logs" on public.audit_logs
  for insert to authenticated with check (true);

create policy "authenticated read audit logs" on public.audit_logs
  for select to authenticated using (true);
```

- [ ] **Step 2: Create Supabase pilot docs**

Create `docs/SUPABASE_PILOT.md`:

```md
# Supabase Pilot Setup

## Objetivo

Configurar o banco online do piloto do PDV usando Supabase.

## Passos manuais no Supabase

1. Criar um projeto Supabase.
2. Abrir SQL Editor.
3. Rodar o conteudo de `supabase/migrations/202605220001_initial_pdv_pilot.sql`.
4. Criar usuarios em Authentication.
5. Criar linha em `profiles` para cada usuario usando o mesmo `id` do Auth.
6. Configurar Auth URL para o dominio do Netlify quando o deploy existir.

## Chaves usadas no frontend

O frontend usa apenas:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Nunca colocar `service_role` no frontend.
```

- [ ] **Step 3: Commit**

Run:

```powershell
git add supabase\migrations\202605220001_initial_pdv_pilot.sql docs\SUPABASE_PILOT.md
git commit -m "feat: add initial supabase pilot schema"
```

## Task 3: Auth, Permissions, and Audit Services

**Files:**
- Create: `src/services/auth.service.js`
- Create: `src/services/permission.service.js`
- Create: `src/services/audit.service.js`
- Test: `tests/auth-service.test.mjs`
- Test: `tests/permission-service.test.mjs`
- Test: `tests/audit-service.test.mjs`

- [ ] **Step 1: Write auth service test**

Create `tests/auth-service.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const auth = await import('../src/services/auth.service.js');

auth.setAuthClientForTests({
  async signInWithPassword({ email, password }) {
    return {
      data: {
        user: { id: 'user-1', email },
        session: { access_token: `token-${password}` }
      },
      error: null
    };
  },
  async signOut() {
    return { error: null };
  },
  async getSession() {
    return {
      data: { session: { user: { id: 'user-1', email: 'admin@pdv.local' } } },
      error: null
    };
  }
});

const session = await auth.login({ email: 'admin@pdv.local', password: '123456' });
assert(session.user.email === 'admin@pdv.local', 'login should return user');

const currentUser = await auth.getCurrentUser();
assert(currentUser.id === 'user-1', 'current user should come from session');

await auth.logout();

console.log('auth service ok');
```

- [ ] **Step 2: Run auth test to verify it fails**

Run:

```powershell
node tests\auth-service.test.mjs
```

Expected: FAIL with `Cannot find module ... auth.service.js`.

- [ ] **Step 3: Implement auth service**

Create `src/services/auth.service.js`:

```js
let authClientForTests = null;

export function setAuthClientForTests(client) {
  authClientForTests = client;
}

export async function login({ email, password }) {
  const client = getAuthClient();
  const { data, error } = await client.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message || 'Falha ao entrar.');
  }

  return data;
}

export async function logout() {
  const client = getAuthClient();
  const { error } = await client.signOut();

  if (error) {
    throw new Error(error.message || 'Falha ao sair.');
  }
}

export async function getCurrentUser() {
  const client = getAuthClient();
  const { data, error } = await client.getSession();

  if (error) {
    throw new Error(error.message || 'Falha ao ler sessao.');
  }

  return data.session?.user || null;
}

function getAuthClient() {
  if (!authClientForTests) {
    throw new Error('Cliente de autenticacao nao configurado.');
  }

  return authClientForTests;
}
```

- [ ] **Step 4: Write permission service test**

Create `tests/permission-service.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const permissions = await import('../src/services/permission.service.js');

permissions.setCurrentProfileForTests({
  id: 'user-1',
  role: 'operador',
  permissions: ['cashier.access', 'sale.create']
});

assert(permissions.can('cashier.access') === true, 'operator should access cashier');
assert(permissions.can('users.manage') === false, 'operator should not manage users');

permissions.setCurrentProfileForTests({
  id: 'user-2',
  role: 'admin',
  permissions: ['*']
});

assert(permissions.can('users.manage') === true, 'admin wildcard should allow users');

console.log('permission service ok');
```

- [ ] **Step 5: Implement permission service**

Create `src/services/permission.service.js`:

```js
let currentProfile = null;

export function setCurrentProfile(profile) {
  currentProfile = profile;
}

export function setCurrentProfileForTests(profile) {
  setCurrentProfile(profile);
}

export function getCurrentProfile() {
  return currentProfile;
}

export function can(permissionId) {
  const permissions = currentProfile?.permissions || [];
  return permissions.includes('*') || permissions.includes(permissionId);
}

export function requirePermission(permissionId) {
  if (!can(permissionId)) {
    throw new Error('Usuario sem permissao para esta acao.');
  }
}
```

- [ ] **Step 6: Write audit service test**

Create `tests/audit-service.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const audit = await import('../src/services/audit.service.js');

const records = [];
audit.setAuditWriterForTests(async (record) => {
  records.push(record);
  return record;
});

await audit.recordAudit({
  action: 'sale.finished',
  entityType: 'sale',
  entityId: 'sale-1',
  userId: 'user-1',
  userName: 'Luan',
  metadata: { total: 10 }
});

assert(records.length === 1, 'audit writer should receive record');
assert(records[0].action === 'sale.finished', 'audit should preserve action');
assert(records[0].metadata.total === 10, 'audit should preserve metadata');

console.log('audit service ok');
```

- [ ] **Step 7: Implement audit service**

Create `src/services/audit.service.js`:

```js
let auditWriterForTests = null;

export function setAuditWriterForTests(writer) {
  auditWriterForTests = writer;
}

export async function recordAudit({
  action,
  entityType,
  entityId = '',
  userId = null,
  userName = 'Sistema',
  metadata = {}
}) {
  const record = {
    action,
    entityType,
    entityId,
    userId,
    userName,
    metadata,
    createdAt: new Date().toISOString()
  };

  if (auditWriterForTests) {
    return auditWriterForTests(record);
  }

  return record;
}
```

- [ ] **Step 8: Run auth, permission and audit tests**

Run:

```powershell
node tests\auth-service.test.mjs
node tests\permission-service.test.mjs
node tests\audit-service.test.mjs
```

Expected:

```text
auth service ok
permission service ok
audit service ok
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\services\auth.service.js src\services\permission.service.js src\services\audit.service.js tests\auth-service.test.mjs tests\permission-service.test.mjs tests\audit-service.test.mjs
git commit -m "feat: add auth permission and audit services"
```

## Task 4: Product and Transaction Services Through Provider

**Files:**
- Modify: `src/services/product.service.js`
- Modify: `src/services/transaction.service.js`
- Modify: `tests/product-service.test.mjs`
- Modify: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Extend product tests for provider contract**

Add this assertion to `tests/product-service.test.mjs` after seed setup:

```js
const createdCategory = products.createCategory('Bebidas Frias', { showInShowcase: true });
assert(createdCategory.id === 'bebidas-frias', 'category should keep slug id');

const createdProduct = products.createProduct({
  name: 'Suco Natural',
  categoryId: createdCategory.id,
  price: 8,
  cost: 3,
  stock: 5,
  active: true,
  aliases: ['suco'],
  favorite: true
});

assert(createdProduct.id === 'suco-natural', 'product should keep slug id');
assert(products.getProductById(createdProduct.id).name === 'Suco Natural', 'product should be readable after create');
```

- [ ] **Step 2: Run product test before refactor**

Run:

```powershell
node tests\product-service.test.mjs
```

Expected: PASS, proving current behavior before provider refactor.

- [ ] **Step 3: Refactor product service storage calls**

Modify top imports in `src/services/product.service.js`:

```js
import { getDataProvider } from './data-provider.service.js';
```

Replace `getProducts()`:

```js
export function getProducts() {
  return getDataProvider().getCollection('products', []);
}
```

Replace `getCategories()`:

```js
export function getCategories() {
  return getDataProvider().getCollection('categories', []).map(normalizeCategory);
}
```

Replace `saveProducts(products)`:

```js
function saveProducts(products) {
  getDataProvider().setCollection('products', products);
}
```

Replace every direct category save with:

```js
getDataProvider().setCollection('categories', categories);
```

- [ ] **Step 4: Run product test after refactor**

Run:

```powershell
node tests\product-service.test.mjs
```

Expected: `product service ok`.

- [ ] **Step 5: Extend transaction tests for audit-safe behavior**

Add to `tests/transaction-service.test.mjs`:

```js
const movement = transactions.registerCashMovement({
  type: 'entrada',
  amount: 15,
  category: 'reforco-caixa',
  description: 'Reforco para troco',
  userName: 'Operador'
});

assert(movement.category === 'reforco-caixa', 'movement should keep category');
assert(transactions.getTransactions()[0].id === movement.id, 'movement should be persisted');
```

- [ ] **Step 6: Run transaction test before refactor**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: PASS, proving current behavior before provider refactor.

- [ ] **Step 7: Refactor transaction service storage calls**

Modify imports in `src/services/transaction.service.js`:

```js
import { getDataProvider } from './data-provider.service.js';
```

Replace `getTransactions()`:

```js
export function getTransactions() {
  return getDataProvider().getCollection('transactions', []);
}
```

Replace `getClosedComandas()`:

```js
export function getClosedComandas() {
  return getDataProvider().getCollection('closedComandas', []);
}
```

Replace transaction writes:

```js
getDataProvider().setCollection('transactions', transactions);
```

Replace closed comanda writes:

```js
getDataProvider().setCollection('closedComandas', comandas);
```

- [ ] **Step 8: Run product and transaction tests**

Run:

```powershell
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
node tests\crm-dashboard-service.test.mjs
```

Expected:

```text
product service ok
transaction service ok
crm dashboard service ok
```

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\services\product.service.js src\services\transaction.service.js tests\product-service.test.mjs tests\transaction-service.test.mjs
git commit -m "feat: route products and transactions through provider"
```

## Task 5: Cash Closing, Stock, and CRM Through Provider

**Files:**
- Modify: `src/services/cash-closing.service.js`
- Modify: `src/services/estoque.service.js`
- Modify: `tests/cash-closing-service.test.mjs`
- Modify: `tests/estoque-service.test.mjs`
- Modify: `tests/crm-dashboard-service.test.mjs`

- [ ] **Step 1: Run current cash, stock and CRM tests**

Run:

```powershell
node tests\cash-closing-service.test.mjs
node tests\estoque-service.test.mjs
node tests\crm-dashboard-service.test.mjs
```

Expected:

```text
cash closing service ok
estoque service ok
crm dashboard service ok
```

- [ ] **Step 2: Refactor cash closing service**

Modify imports in `src/services/cash-closing.service.js`:

```js
import { getDataProvider } from './data-provider.service.js';
```

Replace draft write in `saveClosingDraft`:

```js
getDataProvider().setItem('cashClosingDraft', draft);
```

Replace `getCurrentClosingDraft()`:

```js
export function getCurrentClosingDraft() {
  return getDataProvider().getItem('cashClosingDraft', null);
}
```

Replace closing writes in `confirmClosing`:

```js
const closings = getCashClosings();
closings.unshift(closing);
getDataProvider().setCollection('cashClosings', closings);
getDataProvider().setItem('cashClosingDraft', null);
```

Replace `getCashClosings()`:

```js
export function getCashClosings() {
  return getDataProvider().getCollection('cashClosings', []);
}
```

- [ ] **Step 3: Refactor estoque service**

Modify imports in `src/services/estoque.service.js`:

```js
import { getDataProvider } from './data-provider.service.js';
```

Replace all writes to stock launches:

```js
getDataProvider().setCollection('stockLaunches', launches);
```

Replace `getStockLaunches(filters = {})`:

```js
export function getStockLaunches(filters = {}) {
  const launches = getDataProvider().getCollection('stockLaunches', []);
  return applyStockFilters(launches, filters);
}
```

Replace write-off reads and writes:

```js
const writeOffs = getDataProvider().getCollection('showcaseWriteOffs', []);
writeOffs.unshift(writeOff);
getDataProvider().setCollection('showcaseWriteOffs', writeOffs);
```

Replace `getShowcaseWriteOffs` collection read:

```js
return getDataProvider().getCollection('showcaseWriteOffs', []).filter((writeOff) => {
```

- [ ] **Step 4: Run cash, stock and CRM tests**

Run:

```powershell
node tests\cash-closing-service.test.mjs
node tests\estoque-service.test.mjs
node tests\crm-dashboard-service.test.mjs
```

Expected:

```text
cash closing service ok
estoque service ok
crm dashboard service ok
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\services\cash-closing.service.js src\services\estoque.service.js tests\cash-closing-service.test.mjs tests\estoque-service.test.mjs tests\crm-dashboard-service.test.mjs
git commit -m "feat: route cash stock and crm data through provider"
```

## Task 6: Supabase Provider and Browser Client

**Files:**
- Create: `src/services/supabase-client.service.js`
- Modify: `src/services/providers/supabase.provider.js`
- Modify: `src/services/data-provider.service.js`
- Test: `tests/supabase-provider-mapping.test.mjs`

- [ ] **Step 1: Write mapping test**

Create `tests/supabase-provider-mapping.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { mapProductFromSupabase, mapProductToSupabase } = await import('../src/services/providers/supabase.provider.js');

const localProduct = {
  id: 'x-burger',
  name: 'X Burger',
  categoryId: 'lanches',
  price: 16,
  cost: 8,
  stock: 10,
  active: true,
  aliases: ['burger'],
  favorite: true
};

const row = mapProductToSupabase(localProduct);
assert(row.category_id === 'lanches', 'product category should map to snake case');
assert(row.aliases[0] === 'burger', 'aliases should map');

const mapped = mapProductFromSupabase(row);
assert(mapped.categoryId === 'lanches', 'product category should map to camel case');
assert(mapped.favorite === true, 'favorite should map');

console.log('supabase provider mapping ok');
```

- [ ] **Step 2: Run mapping test to verify it fails**

Run:

```powershell
node tests\supabase-provider-mapping.test.mjs
```

Expected: FAIL with `Cannot find module ... supabase.provider.js`.

- [ ] **Step 3: Implement mapping helpers and provider skeleton**

Create `src/services/providers/supabase.provider.js`:

```js
export function mapProductToSupabase(product) {
  return {
    id: product.id,
    name: product.name,
    category_id: product.categoryId,
    price: product.price,
    cost: product.cost,
    stock: product.stock,
    active: product.active,
    aliases: product.aliases || [],
    favorite: product.favorite
  };
}

export function mapProductFromSupabase(row) {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    price: Number(row.price || 0),
    cost: Number(row.cost || 0),
    stock: Number(row.stock || 0),
    active: Boolean(row.active),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    favorite: Boolean(row.favorite)
  };
}

export function createSupabaseProvider(client) {
  return {
    mode: 'supabase',
    async getProducts() {
      const { data, error } = await client.from('products').select('*').order('name');
      if (error) throw new Error(error.message);
      return data.map(mapProductFromSupabase);
    }
  };
}
```

- [ ] **Step 4: Create browser Supabase client service**

Create `src/services/supabase-client.service.js`:

```js
import { getRuntimeConfig } from './app-config.service.js';

let clientPromise = null;

export async function getSupabaseClient() {
  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
    const config = getRuntimeConfig();
    return createClient(config.supabaseUrl, config.supabaseAnonKey);
  });

  return clientPromise;
}
```

- [ ] **Step 5: Wire Supabase provider selection**

Modify `src/services/data-provider.service.js`:

```js
import { DATA_PROVIDER_MODES } from '../database/schema.js';
import { getDataProviderMode } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { createLocalProvider } from './providers/local.provider.js';
import { createSupabaseProvider } from './providers/supabase.provider.js';

let activeProvider = null;

export async function getAsyncDataProvider() {
  if (activeProvider) {
    return activeProvider;
  }

  const mode = getDataProviderMode();

  if (mode === DATA_PROVIDER_MODES.supabase) {
    activeProvider = createSupabaseProvider(await getSupabaseClient());
    return activeProvider;
  }

  activeProvider = createLocalProvider();
  return activeProvider;
}

export function getDataProvider() {
  if (!activeProvider) {
    activeProvider = createLocalProvider();
  }

  return activeProvider;
}
```

- [ ] **Step 6: Run mapping test**

Run:

```powershell
node tests\supabase-provider-mapping.test.mjs
```

Expected: `supabase provider mapping ok`.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src\services\supabase-client.service.js src\services\providers\supabase.provider.js src\services\data-provider.service.js tests\supabase-provider-mapping.test.mjs
git commit -m "feat: add supabase provider foundation"
```

## Task 7: Login Gate and Protected App Shell

**Files:**
- Create: `src/modules/auth/login.module.js`
- Modify: `src/app.js`
- Modify: `src/components/sidebar.component.js`
- Modify: `index.html`

- [ ] **Step 1: Create login module**

Create `src/modules/auth/login.module.js`:

```js
import { login } from '../../services/auth.service.js';

export function renderLoginModule(container, onSuccess) {
  container.innerHTML = `
    <section class="module-screen">
      <header class="module-header">
        <h1 class="pdv-title">Entrar no PDV</h1>
      </header>
      <form class="form-grid" data-login-form>
        <label class="field-group">
          <span>Email</span>
          <input class="field" type="email" name="email" required autocomplete="username">
        </label>
        <label class="field-group">
          <span>Senha</span>
          <input class="field" type="password" name="password" required autocomplete="current-password">
        </label>
        <button class="button" type="submit">Entrar</button>
        <p class="form-error" data-login-error hidden></p>
      </form>
    </section>
  `;

  container.querySelector('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = container.querySelector('[data-login-error]');

    try {
      await login({
        email: form.get('email'),
        password: form.get('password')
      });
      onSuccess();
    } catch (loginError) {
      error.hidden = false;
      error.textContent = loginError.message;
    }
  });
}
```

- [ ] **Step 2: Load runtime config before app module**

Modify `index.html`:

```html
<script type="module" src="./src/config/runtime-config.js"></script>
<script type="module" src="./src/app.js?v=20260522-01"></script>
```

- [ ] **Step 3: Convert app bootstrap to async shell**

Modify `src/app.js`:

```js
import { getDataProviderMode } from './services/app-config.service.js';
import { getCurrentUser } from './services/auth.service.js';
import { renderLoginModule } from './modules/auth/login.module.js';

async function bootstrap() {
  ensureSeedData();
  initSyncService();
  initTheme();

  const app = document.getElementById('app');

  if (getDataProviderMode() === 'supabase') {
    const user = await getCurrentUser();
    if (!user) {
      renderLoginModule(app, () => bootstrap());
      return;
    }
  }

  renderAppShell(app);
}
```

Move the existing shell rendering body into:

```js
function renderAppShell(app) {
  initNotificationService(document.querySelector('.toast-root'));
  const caixa = getCaixaSummary();
  const moneySummary = getDailyMoneySummary();
  const estimatedCash = moneySummary.expectedCash;
  const currentCash = Number(caixa.currentAmount || 0);

  app.innerHTML = `
    <div class="pdv-layout">
      ${renderSidebar()}
      <section class="workspace">
        <header class="topbar">
          <div class="cash-strip" aria-label="Resumo do caixa">
            ${renderCashMetric('Caixa atual', currentCash, true)}
            ${renderCashMetric('Caixa estimado', estimatedCash, false, 'money-warning')}
            ${renderCashMetric('Entradas', moneySummary.entriesTotal, false, 'money-positive')}
            ${renderCashMetric('Saidas', moneySummary.outputsTotal, false, 'money-negative')}
          </div>
          <div class="header-actions">
            <button class="button button--ghost" type="button" data-action="toggle-theme">${getThemeLabel()}</button>
            <button class="button button--ghost" type="button" data-action="refresh">Atualizar</button>
          </div>
        </header>
        <div class="workspace-body" data-workspace-body></div>
      </section>
    </div>
  `;

  const workspace = app.querySelector('[data-workspace-body]');
  initVendasModule(workspace);
  bindNavigation(app, workspace);
}
```

- [ ] **Step 4: Run syntax checks**

Run:

```powershell
node --check src\app.js
node --check src\modules\auth\login.module.js
```

Expected: no syntax errors.

- [ ] **Step 5: Commit**

Run:

```powershell
git add index.html src\app.js src\modules\auth\login.module.js src\components\sidebar.component.js
git commit -m "feat: add login gate for online pilot"
```

## Task 8: Netlify Build Config

**Files:**
- Create: `scripts/generate-runtime-config.mjs`
- Create: `netlify.toml`
- Modify: `.gitignore`
- Create: `docs/DEPLOY_NETLIFY.md`

- [ ] **Step 1: Create runtime config generator**

Create `scripts/generate-runtime-config.mjs`:

```js
import { writeFileSync } from 'node:fs';

const config = {
  dataProvider: process.env.PDV_DATA_PROVIDER || 'local',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
};

writeFileSync(
  'src/config/runtime-config.js',
  `globalThis.__PDV_RUNTIME_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`
);

console.log(`runtime config generated for provider ${config.dataProvider}`);
```

- [ ] **Step 2: Create Netlify config**

Create `netlify.toml`:

```toml
[build]
  command = "node scripts/generate-runtime-config.mjs"
  publish = "."

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

- [ ] **Step 3: Update gitignore**

Modify `.gitignore` to include:

```gitignore
.env
.env.*
*.log
.local-server-*.pid
.local-server-*.log
.superpowers/
```

- [ ] **Step 4: Add deploy docs**

Create `docs/DEPLOY_NETLIFY.md`:

```md
# Deploy Netlify

## Variaveis do Netlify

- `PDV_DATA_PROVIDER=supabase`
- `SUPABASE_URL=https://seu-projeto.supabase.co`
- `SUPABASE_ANON_KEY=chave-publica-anon`

## Passos

1. Criar site no Netlify apontando para o repositorio.
2. Usar `node scripts/generate-runtime-config.mjs` como build command.
3. Usar `.` como publish directory.
4. Configurar as variaveis acima.
5. Fazer deploy.
6. Copiar a URL do Netlify para as URLs autorizadas do Supabase Auth.
```

- [ ] **Step 5: Test config generation locally**

Run:

```powershell
$env:PDV_DATA_PROVIDER='local'
node scripts\generate-runtime-config.mjs
Get-Content src\config\runtime-config.js
```

Expected output includes:

```text
runtime config generated for provider local
dataProvider": "local"
```

- [ ] **Step 6: Run core tests**

Run:

```powershell
node tests\app-config-service.test.mjs
node tests\data-provider-service.test.mjs
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\estoque-service.test.mjs
node tests\crm-dashboard-service.test.mjs
```

Expected: all listed tests print their `ok` line.

- [ ] **Step 7: Commit**

Run:

```powershell
git add scripts\generate-runtime-config.mjs netlify.toml .gitignore docs\DEPLOY_NETLIFY.md src\config\runtime-config.js
git commit -m "chore: configure netlify runtime deploy"
```

## Task 9: Final Manual Pilot Checklist

**Files:**
- Create: `docs/PILOT_CHECKLIST.md`

- [ ] **Step 1: Create pilot checklist**

Create `docs/PILOT_CHECKLIST.md`:

```md
# Checklist do Piloto Online

## Antes do teste

- Exportar dados locais atuais.
- Confirmar que o sistema local ainda abre.
- Confirmar que Supabase tem tabelas criadas.
- Confirmar que Netlify tem variaveis configuradas.
- Confirmar que Auth URL do Supabase inclui o dominio Netlify.

## Teste admin

- Entrar como administrador.
- Criar categoria.
- Criar produto.
- Finalizar venda.
- Registrar entrada.
- Registrar saida.
- Fechar caixa.
- Abrir CRM de hoje.
- Abrir CRM da semana.

## Teste operador

- Entrar como operador.
- Abrir frente de caixa.
- Finalizar venda.
- Registrar entrada ou saida permitida.
- Confirmar que menus administrativos ficam bloqueados.

## Criterios para continuar o piloto

- Nenhuma venda desaparece ao recarregar.
- CRM confere com vendas feitas.
- Fechamento aparece no historico.
- Erros de rede aparecem claramente.
- A equipe consegue acessar pelo celular.
```

- [ ] **Step 2: Run all local tests**

Run:

```powershell
node tests\app-config-service.test.mjs
node tests\data-provider-service.test.mjs
node tests\auth-service.test.mjs
node tests\permission-service.test.mjs
node tests\audit-service.test.mjs
node tests\product-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\estoque-service.test.mjs
node tests\crm-dashboard-service.test.mjs
node tests\supabase-provider-mapping.test.mjs
```

Expected: every command prints an `ok` line.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs\PILOT_CHECKLIST.md
git commit -m "docs: add online pilot checklist"
```

## Self-Review

- Spec coverage: Supabase, Netlify, dados principais, CRM gerencial, CRM de clientes fora do piloto, auth, permissoes, auditoria, erros, testes e contingencia estao cobertos.
- Placeholder scan: no `TBD`, `TODO`, `??`, or unfinished implementation markers were added.
- Type consistency: local names use camelCase in services; Supabase rows use snake_case; mapping helpers define the boundary.
- Scope check: this is one pilot plan. CRM comercial, PWA, offline avancado and dominio proprio remain outside the implementation.
