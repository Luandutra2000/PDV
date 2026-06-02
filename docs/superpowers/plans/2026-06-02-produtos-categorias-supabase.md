# Produtos e Categorias no Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make products and categories use Supabase as the primary source, with temporary cache, offline queue, sync status, and realtime updates.

**Architecture:** Add a generic Supabase entity repository with adapters for products and categories. `product.service.js` becomes the public facade used by existing modules, while the repository handles Supabase reads/writes, cache, queue, and realtime.

**Tech Stack:** JavaScript ES Modules, Supabase REST/client APIs, localStorage cache/queue, existing event bus, Node `.mjs` tests.

---

## File Structure

- Create: `src/services/repositories/entity-sync.repository.js`
  - Generic repository factory for one table/entity.
  - Handles `list`, `create`, `update`, `remove`, `flushQueue`, `subscribe`, `getSyncStatus`.
- Create: `src/services/repositories/product.adapter.js`
  - Maps app product objects to Supabase rows and rows back to app objects.
- Create: `src/services/repositories/category.adapter.js`
  - Maps app category objects to Supabase rows and rows back to app objects.
- Create: `src/services/product-sync.service.js`
  - Owns configured repositories for `products` and `categories`.
  - Exposes async APIs for product/category operations.
  - Exposes sync status and realtime start/stop helpers.
- Modify: `src/services/product.service.js`
  - Keep current sync APIs for legacy modules.
  - Add async APIs used by Products module.
  - Stop mock/localStorage from being primary when Supabase is active.
- Modify: `src/modules/produtos/produtos.module.js`
  - Render loading, empty, error, and sync status.
  - Await create/edit/delete operations.
  - Re-render when product/category realtime events arrive.
- Modify: `src/app.js`
  - Hydrate products/categories through the new service after login.
  - Start realtime subscriptions once the shell is loaded.
- Modify: `src/database/schema.js`
  - Add UI event names for product/category sync updates.
- Create: `tests/product-adapters.test.mjs`
  - Test product/category adapter mappings.
- Create: `tests/entity-sync-repository.test.mjs`
  - Test repository list/cache/queue/status behavior.
- Modify: `tests/product-service.test.mjs`
  - Test async Supabase path for product/category CRUD.
- Modify: `tests/vercel-cache-config.test.mjs`
  - Bump cache version if `app.js` imports change.
- Create: `docs/superpowers/checklists/2026-06-02-produtos-categorias-supabase.md`
  - Manual test checklist from the spec.

---

### Task 1: Product And Category Adapters

**Files:**
- Create: `src/services/repositories/product.adapter.js`
- Create: `src/services/repositories/category.adapter.js`
- Test: `tests/product-adapters.test.mjs`

- [ ] **Step 1: Write the failing adapter tests**

Create `tests/product-adapters.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const productAdapter = await import('../src/services/repositories/product.adapter.js');
const categoryAdapter = await import('../src/services/repositories/category.adapter.js');

const productRow = productAdapter.toRow({
  id: 'x-burger',
  name: 'X-Burger',
  categoryId: 'lanches',
  price: '16.50',
  cost: '7.25',
  stock: '12',
  active: true,
  aliases: ['burger', 'x'],
  favorite: true
});

assert(productRow.category_id === 'lanches', 'product categoryId should map to category_id');
assert(productRow.price === 16.5, 'product price should be numeric');
assert(productRow.cost === 7.25, 'product cost should be numeric');
assert(productRow.stock === 12, 'product stock should be numeric');
assert(productRow.active === true, 'product active should be boolean');
assert(Array.isArray(productRow.aliases), 'product aliases should stay array');
assert(productRow.favorite === true, 'product favorite should be boolean');

const product = productAdapter.fromRow({
  id: 'batata-frita',
  name: 'Batata Frita',
  category_id: 'porcoes',
  price: 14,
  cost: 6,
  stock: 18,
  active: true,
  aliases: ['batata'],
  favorite: false
});

assert(product.categoryId === 'porcoes', 'product category_id should map to categoryId');
assert(product.price === 14, 'product row price should map to app product');
assert(product.active === true, 'product row active should map to app product');

const categoryRow = categoryAdapter.toRow({
  id: 'lanches',
  name: 'Lanches',
  showInShowcase: false
});

assert(categoryRow.show_in_showcase === false, 'category showInShowcase should map to show_in_showcase');

const category = categoryAdapter.fromRow({
  id: 'bebidas',
  name: 'Bebidas',
  show_in_showcase: true
});

assert(category.showInShowcase === true, 'category show_in_showcase should map to showInShowcase');

console.log('product adapters ok');
```

- [ ] **Step 2: Run adapter test to verify it fails**

Run:

```powershell
node tests\product-adapters.test.mjs
```

Expected: FAIL with module not found for `product.adapter.js`.

- [ ] **Step 3: Create product adapter**

Create `src/services/repositories/product.adapter.js`:

```js
export const productAdapter = {
  table: 'products',
  cacheKey: 'pdv.products',
  queueKey: 'pdv.syncQueue.products',
  select: 'id,name,category_id,price,cost,stock,active,aliases,favorite',
  fromRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      categoryId: row.category_id || 'sem-categoria',
      price: Number(row.price) || 0,
      cost: Number(row.cost) || 0,
      stock: Number(row.stock) || 0,
      active: row.active !== false,
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
      favorite: Boolean(row.favorite)
    };
  },
  toRow(product) {
    return {
      id: product.id,
      name: String(product.name || '').trim(),
      category_id: product.categoryId || 'sem-categoria',
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      stock: Number(product.stock) || 0,
      active: product.active !== false,
      aliases: Array.isArray(product.aliases)
        ? product.aliases.map((alias) => String(alias).trim()).filter(Boolean)
        : [],
      favorite: Boolean(product.favorite)
    };
  }
};

export const { fromRow, toRow } = productAdapter;
```

- [ ] **Step 4: Create category adapter**

Create `src/services/repositories/category.adapter.js`:

```js
export const categoryAdapter = {
  table: 'categories',
  cacheKey: 'pdv.categories',
  queueKey: 'pdv.syncQueue.categories',
  select: 'id,name,show_in_showcase',
  fromRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      showInShowcase: row.show_in_showcase !== false
    };
  },
  toRow(category) {
    return {
      id: category.id,
      name: String(category.name || '').trim(),
      show_in_showcase: category.showInShowcase !== false
    };
  }
};

export const { fromRow, toRow } = categoryAdapter;
```

- [ ] **Step 5: Run adapter test to verify it passes**

Run:

```powershell
node tests\product-adapters.test.mjs
```

Expected: PASS with `product adapters ok`.

- [ ] **Step 6: Commit**

```powershell
git add src\services\repositories\product.adapter.js src\services\repositories\category.adapter.js tests\product-adapters.test.mjs
git commit -m "feat: add product category adapters"
```

---

### Task 2: Generic Entity Sync Repository

**Files:**
- Create: `src/services/repositories/entity-sync.repository.js`
- Test: `tests/entity-sync-repository.test.mjs`

- [ ] **Step 1: Write the failing repository tests**

Create `tests/entity-sync-repository.test.mjs`:

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

const { createEntitySyncRepository } = await import('../src/services/repositories/entity-sync.repository.js');

let rows = [{ id: 'item-1', name: 'Item 1' }];
let shouldFailSelect = false;
let shouldFailUpsert = false;
let upsertedRows = [];

const fakeClient = {
  from(tableName) {
    assert(tableName === 'items', 'repository should use adapter table');
    return {
      select() {
        return Promise.resolve(shouldFailSelect
          ? { data: null, error: new Error('offline') }
          : { data: rows, error: null });
      },
      upsert(nextRows) {
        upsertedRows = nextRows;
        if (shouldFailUpsert) {
          return Promise.resolve({ error: new Error('write offline') });
        }
        rows = nextRows;
        return Promise.resolve({ error: null });
      },
      delete() {
        return {
          eq(column, value) {
            rows = rows.filter((row) => row[column] !== value);
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  },
  channel() {
    return {
      on() {
        return this;
      },
      subscribe() {
        return this;
      }
    };
  },
  removeChannel() {}
};

const adapter = {
  table: 'items',
  cacheKey: 'test.items',
  queueKey: 'test.items.queue',
  select: 'id,name',
  fromRow(row) {
    return { id: row.id, name: row.name };
  },
  toRow(item) {
    return { id: item.id, name: item.name };
  }
};

const repository = createEntitySyncRepository({
  adapter,
  getClient: async () => fakeClient,
  emitChange: () => {}
});

const listed = await repository.list();
assert(listed.length === 1, 'list should return Supabase rows');
assert(JSON.parse(localStorage.getItem('test.items')).length === 1, 'list should update cache');
assert(repository.getSyncStatus().state === 'synced', 'successful list should mark synced');

shouldFailSelect = true;
const cached = await repository.list();
assert(cached.length === 1, 'failed list should return cache');
assert(repository.getSyncStatus().state === 'cache', 'failed list should mark cache state');

shouldFailUpsert = true;
const queuedItem = await repository.save({ id: 'item-2', name: 'Item 2' });
assert(queuedItem.id === 'item-2', 'failed save should return item');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 1, 'failed save should queue operation');
assert(repository.getSyncStatus().pending === 1, 'failed save should update pending count');

shouldFailSelect = false;
shouldFailUpsert = false;
await repository.flushQueue();
assert(upsertedRows[0].id === 'item-2', 'flush should upsert queued row');
assert(JSON.parse(localStorage.getItem('test.items.queue')).length === 0, 'flush should clear queue');
assert(repository.getSyncStatus().state === 'synced', 'flush success should mark synced');

console.log('entity sync repository ok');
```

- [ ] **Step 2: Run repository test to verify it fails**

Run:

```powershell
node tests\entity-sync-repository.test.mjs
```

Expected: FAIL with module not found for `entity-sync.repository.js`.

- [ ] **Step 3: Implement repository**

Create `src/services/repositories/entity-sync.repository.js`:

```js
function readJson(key, fallback) {
  const rawValue = localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    console.warn(`Valor local invalido para ${key}.`, error);
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function createStatus(state = 'idle', pending = 0, error = '') {
  return { state, pending, error };
}

export function createEntitySyncRepository({ adapter, getClient, emitChange = () => {} }) {
  let status = createStatus('idle', readQueue().length);
  let channel = null;

  function readCache() {
    return readJson(adapter.cacheKey, []);
  }

  function writeCache(items) {
    return writeJson(adapter.cacheKey, items);
  }

  function readQueue() {
    return readJson(adapter.queueKey, []);
  }

  function writeQueue(queue) {
    status = createStatus(queue.length ? 'pending' : status.state, queue.length, status.error);
    return writeJson(adapter.queueKey, queue);
  }

  function setStatus(nextStatus) {
    status = { ...status, ...nextStatus };
    emitChange({ type: 'status', status });
  }

  async function list() {
    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { data, error } = await client.from(adapter.table).select(adapter.select || '*');

      if (error) {
        throw error;
      }

      const items = Array.isArray(data) ? data.map(adapter.fromRow) : [];
      writeCache(items);
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
      return items;
    } catch (error) {
      const cached = readCache();
      setStatus({ state: cached.length ? 'cache' : 'error', pending: readQueue().length, error: error.message || 'Erro ao carregar dados.' });
      return cached;
    }
  }

  async function save(item) {
    const nextItem = { ...item };

    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { error } = await client.from(adapter.table).upsert([adapter.toRow(nextItem)]);

      if (error) {
        throw error;
      }

      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      writeCache(exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate))
        : [...cached, nextItem]);
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
      emitChange({ type: 'saved', item: nextItem });
      return nextItem;
    } catch (error) {
      const queue = [...readQueue(), { action: 'upsert', item: nextItem, createdAt: new Date().toISOString() }];
      writeQueue(queue);
      const cached = readCache();
      const exists = cached.some((candidate) => candidate.id === nextItem.id);
      writeCache(exists
        ? cached.map((candidate) => (candidate.id === nextItem.id ? { ...nextItem, syncPending: true } : candidate))
        : [...cached, { ...nextItem, syncPending: true }]);
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Alteracao pendente.' });
      emitChange({ type: 'queued', item: nextItem });
      return nextItem;
    }
  }

  async function remove(id) {
    try {
      setStatus({ state: 'syncing', error: '' });
      const client = await getClient();
      const { error } = await client.from(adapter.table).delete().eq('id', id);

      if (error) {
        throw error;
      }

      writeCache(readCache().filter((item) => item.id !== id));
      setStatus({ state: 'synced', pending: readQueue().length, error: '' });
      emitChange({ type: 'removed', id });
    } catch (error) {
      const queue = [...readQueue(), { action: 'delete', id, createdAt: new Date().toISOString() }];
      writeQueue(queue);
      writeCache(readCache().filter((item) => item.id !== id));
      setStatus({ state: 'pending', pending: queue.length, error: error.message || 'Exclusao pendente.' });
      emitChange({ type: 'queued-delete', id });
    }
  }

  async function flushQueue() {
    const queue = readQueue();

    if (!queue.length) {
      setStatus({ state: 'synced', pending: 0, error: '' });
      return;
    }

    const remaining = [];
    const client = await getClient();

    for (const operation of queue) {
      if (operation.action === 'delete') {
        const { error } = await client.from(adapter.table).delete().eq('id', operation.id);

        if (error) {
          remaining.push(operation);
        }
      }

      if (operation.action === 'upsert') {
        const { error } = await client.from(adapter.table).upsert([adapter.toRow(operation.item)]);

        if (error) {
          remaining.push(operation);
        }
      }
    }

    writeQueue(remaining);
    setStatus({
      state: remaining.length ? 'pending' : 'synced',
      pending: remaining.length,
      error: remaining.length ? 'Algumas alteracoes continuam pendentes.' : ''
    });

    await list();
  }

  function subscribe() {
    if (channel) {
      return channel;
    }

    getClient().then((client) => {
      channel = client
        .channel(`${adapter.table}-changes`)
        .on('postgres_changes', { event: '*', schema: 'public', table: adapter.table }, async () => {
          await list();
          emitChange({ type: 'realtime' });
        })
        .subscribe();
    });

    return channel;
  }

  async function unsubscribe() {
    if (!channel) {
      return;
    }

    const client = await getClient();
    client.removeChannel(channel);
    channel = null;
  }

  return {
    list,
    save,
    remove,
    flushQueue,
    subscribe,
    unsubscribe,
    getSyncStatus() {
      return status;
    }
  };
}
```

- [ ] **Step 4: Run repository test to verify it passes**

Run:

```powershell
node tests\entity-sync-repository.test.mjs
```

Expected: PASS with `entity sync repository ok`.

- [ ] **Step 5: Commit**

```powershell
git add src\services\repositories\entity-sync.repository.js tests\entity-sync-repository.test.mjs
git commit -m "feat: add entity sync repository"
```

---

### Task 3: Product Sync Service

**Files:**
- Create: `src/services/product-sync.service.js`
- Modify: `src/database/schema.js`
- Test: `tests/product-service.test.mjs`

- [ ] **Step 1: Extend schema events**

Modify `src/database/schema.js` and add events:

```js
export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED',
  mobileFeedChanged: 'MOBILE_FEED_CHANGED',
  productCatalogChanged: 'PRODUCT_CATALOG_CHANGED',
  productSyncStatusChanged: 'PRODUCT_SYNC_STATUS_CHANGED'
};
```

- [ ] **Step 2: Create product sync service**

Create `src/services/product-sync.service.js`:

```js
import { UI_EVENTS } from '../database/schema.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { emit } from './event-bus.service.js';
import { createEntitySyncRepository } from './repositories/entity-sync.repository.js';
import { categoryAdapter } from './repositories/category.adapter.js';
import { productAdapter } from './repositories/product.adapter.js';

let productRepository;
let categoryRepository;

function emitProductChange(payload) {
  emit(UI_EVENTS.productCatalogChanged, payload);
}

function emitStatusChange(payload) {
  emit(UI_EVENTS.productSyncStatusChanged, payload);
}

function getProductRepository() {
  if (!productRepository) {
    productRepository = createEntitySyncRepository({
      adapter: productAdapter,
      getClient: getSupabaseClient,
      emitChange(payload) {
        emitProductChange({ entity: 'products', ...payload });
        emitStatusChange(getProductSyncStatus());
      }
    });
  }

  return productRepository;
}

function getCategoryRepository() {
  if (!categoryRepository) {
    categoryRepository = createEntitySyncRepository({
      adapter: categoryAdapter,
      getClient: getSupabaseClient,
      emitChange(payload) {
        emitProductChange({ entity: 'categories', ...payload });
        emitStatusChange(getProductSyncStatus());
      }
    });
  }

  return categoryRepository;
}

export async function loadProductsFromSupabase() {
  return getProductRepository().list();
}

export async function loadCategoriesFromSupabase() {
  return getCategoryRepository().list();
}

export async function saveProductToSupabase(product) {
  return getProductRepository().save(product);
}

export async function saveCategoryToSupabase(category) {
  return getCategoryRepository().save(category);
}

export async function deleteProductFromSupabase(productId) {
  await getProductRepository().remove(productId);
}

export async function deleteCategoryFromSupabase(categoryId) {
  await getCategoryRepository().remove(categoryId);
}

export async function flushProductCatalogQueue() {
  await getCategoryRepository().flushQueue();
  await getProductRepository().flushQueue();
  emitStatusChange(getProductSyncStatus());
}

export function startProductCatalogRealtime() {
  getCategoryRepository().subscribe();
  getProductRepository().subscribe();
}

export async function stopProductCatalogRealtime() {
  await getCategoryRepository().unsubscribe();
  await getProductRepository().unsubscribe();
}

export function getProductSyncStatus() {
  const categories = getCategoryRepository().getSyncStatus();
  const products = getProductRepository().getSyncStatus();
  const pending = categories.pending + products.pending;
  const hasError = categories.state === 'error' || products.state === 'error';
  const usingCache = categories.state === 'cache' || products.state === 'cache';
  const syncing = categories.state === 'syncing' || products.state === 'syncing';

  return {
    state: pending ? 'pending' : hasError ? 'error' : usingCache ? 'cache' : syncing ? 'syncing' : 'synced',
    pending,
    categories,
    products
  };
}
```

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node tests\product-adapters.test.mjs
node tests\entity-sync-repository.test.mjs
```

Expected: both pass.

- [ ] **Step 4: Commit**

```powershell
git add src\database\schema.js src\services\product-sync.service.js
git commit -m "feat: add product catalog sync service"
```

---

### Task 4: Product Service Supabase Facade

**Files:**
- Modify: `src/services/product.service.js`
- Test: `tests/product-service.test.mjs`

- [ ] **Step 1: Add async Supabase tests to product-service test**

Append to `tests/product-service.test.mjs`:

```js
globalThis.__PDV_RUNTIME_CONFIG__ = {
  dataProvider: 'supabase',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key'
};

const originalFetch = globalThis.fetch;

let rowsByTable = {
  categories: [{ id: 'lanches', name: 'Lanches', show_in_showcase: true }],
  products: [{ id: 'x-burger', name: 'X-Burger', category_id: 'lanches', price: 16, cost: 7, stock: 10, active: true, aliases: [], favorite: false }]
};

globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return {};
  }
});

const supabaseProductService = await import(`../src/services/product.service.js?supabase=${Date.now()}`);

const loadedCategories = await supabaseProductService.loadCategories();
const loadedProducts = await supabaseProductService.loadProducts();

assert(Array.isArray(loadedCategories), 'loadCategories should return an array');
assert(Array.isArray(loadedProducts), 'loadProducts should return an array');

globalThis.fetch = originalFetch;
globalThis.__PDV_RUNTIME_CONFIG__ = null;
```

This test is intentionally minimal because repository behavior is covered in `entity-sync-repository.test.mjs`.

- [ ] **Step 2: Modify product service imports**

At the top of `src/services/product.service.js`, add:

```js
import { isSupabaseEnabled } from './app-config.service.js';
import {
  deleteCategoryFromSupabase,
  deleteProductFromSupabase,
  flushProductCatalogQueue,
  getProductSyncStatus,
  loadCategoriesFromSupabase,
  loadProductsFromSupabase,
  saveCategoryToSupabase,
  saveProductToSupabase,
  startProductCatalogRealtime
} from './product-sync.service.js';
```

- [ ] **Step 3: Add async facade functions**

Add these exports in `src/services/product.service.js`:

```js
export async function loadCategories() {
  if (!isSupabaseEnabled()) {
    return getCategories();
  }

  return loadCategoriesFromSupabase();
}

export async function loadProducts() {
  if (!isSupabaseEnabled()) {
    return getProducts();
  }

  return loadProductsFromSupabase();
}

export async function saveCategory(categoryData) {
  if (!isSupabaseEnabled()) {
    return categoryData.id
      ? updateCategory(categoryData.id, categoryData)
      : createCategory(categoryData.name, categoryData);
  }

  return saveCategoryToSupabase(normalizeCategory({
    id: categoryData.id || createSlugId(categoryData.name, getCategories().map((item) => item.id)),
    name: categoryData.name,
    showInShowcase: categoryData.showInShowcase
  }));
}

export async function saveProduct(productData) {
  if (!isSupabaseEnabled()) {
    return productData.id
      ? updateProduct(productData.id, productData)
      : createProduct(productData);
  }

  return saveProductToSupabase(normalizeProduct({
    id: productData.id || createProductId(productData.name),
    ...productData,
    active: productData.active !== false
  }));
}

export async function removeCategory(categoryId) {
  if (!isSupabaseEnabled()) {
    deleteCategory(categoryId);
    return;
  }

  await deleteCategoryFromSupabase(categoryId);
}

export async function removeProduct(productId) {
  if (!isSupabaseEnabled()) {
    deleteProduct(productId);
    return;
  }

  await deleteProductFromSupabase(productId);
}

export function getCatalogSyncStatus() {
  return isSupabaseEnabled()
    ? getProductSyncStatus()
    : { state: 'local', pending: 0 };
}

export function startCatalogRealtime() {
  if (isSupabaseEnabled()) {
    startProductCatalogRealtime();
  }
}

export async function syncCatalogNow() {
  if (isSupabaseEnabled()) {
    await flushProductCatalogQueue();
  }
}
```

- [ ] **Step 4: Run product-related tests**

Run:

```powershell
node tests\product-adapters.test.mjs
node tests\entity-sync-repository.test.mjs
node tests\product-service.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src\services\product.service.js tests\product-service.test.mjs
git commit -m "feat: add async product catalog facade"
```

---

### Task 5: Products Module Loading, Empty States, And Sync Status

**Files:**
- Modify: `src/modules/produtos/produtos.module.js`
- Modify: `src/styles/pdv.css`
- Test: `tests/vercel-cache-config.test.mjs` if cache version changes

- [ ] **Step 1: Update imports**

Modify imports in `src/modules/produtos/produtos.module.js`:

```js
import {
  getCatalogSyncStatus,
  getCategories,
  getProducts,
  loadCategories,
  loadProducts,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
  syncCatalogNow
} from '../../services/product.service.js';
import { on } from '../../services/event-bus.service.js';
import { UI_EVENTS } from '../../database/schema.js';
```

- [ ] **Step 2: Extend module state**

Add fields to `productState`:

```js
loading: false,
error: '',
syncStatus: { state: 'idle', pending: 0 }
```

- [ ] **Step 3: Make init async-aware**

Replace `initProdutosModule` with:

```js
export function initProdutosModule(container) {
  productState.modal = null;
  productState.editingProductId = null;
  productState.editingCategoryId = null;
  productState.loading = true;
  productState.error = '';
  renderProdutosScreen(container);

  loadProductCatalog(container);

  if (!boundContainers.has(container)) {
    bindProdutosEvents(container);
    on(UI_EVENTS.productCatalogChanged, () => renderProdutosScreen(container));
    on(UI_EVENTS.productSyncStatusChanged, (status) => {
      productState.syncStatus = status;
      renderProdutosScreen(container);
    });
    boundContainers.add(container);
  }
}
```

- [ ] **Step 4: Add catalog loader**

Add function:

```js
async function loadProductCatalog(container) {
  try {
    productState.loading = true;
    productState.error = '';
    renderProdutosScreen(container);
    await Promise.all([loadCategories(), loadProducts()]);
    productState.syncStatus = getCatalogSyncStatus();
  } catch (error) {
    productState.error = error.message || 'Nao foi possivel carregar produtos e categorias.';
  } finally {
    productState.loading = false;
    renderProdutosScreen(container);
  }
}
```

- [ ] **Step 5: Render sync status and loading/error**

Inside `renderProdutosScreen`, below the module header, add:

```html
${renderSyncStatus()}
${productState.loading ? '<div class="empty-products">Carregando produtos e categorias...</div>' : ''}
${productState.error ? `<div class="form-error">${productState.error}</div>` : ''}
```

Add helper:

```js
function renderSyncStatus() {
  const status = productState.syncStatus || getCatalogSyncStatus();
  const labels = {
    idle: 'Preparando sincronizacao',
    local: 'Modo local',
    synced: 'Sincronizado',
    syncing: 'Sincronizando...',
    cache: 'Usando cache',
    pending: `${status.pending || 0} alteracao(oes) pendente(s)`,
    error: 'Erro ao sincronizar'
  };

  return `
    <div class="sync-status" data-sync-state="${status.state}">
      <span>${labels[status.state] || 'Sincronizacao'}</span>
      ${status.pending ? '<button class="button button--ghost" type="button" data-action="sync-catalog">Sincronizar</button>' : ''}
    </div>
  `;
}
```

- [ ] **Step 6: Make submit/click handlers await async facade**

Change submit listener to `async` and use:

```js
await saveProductFromForm(event.target);
await loadProductCatalog(container);
```

and:

```js
await saveCategoryFromForm(event.target);
await loadProductCatalog(container);
```

Change delete actions to:

```js
if (action === 'delete-product') {
  await removeProduct(actionButton.dataset.productId);
  await loadProductCatalog(container);
}

if (action === 'delete-category') {
  await removeCategory(actionButton.dataset.categoryId);
  await loadProductCatalog(container);
}

if (action === 'sync-catalog') {
  await syncCatalogNow();
  await loadProductCatalog(container);
}
```

- [ ] **Step 7: Make save helpers async**

Update `saveProductFromForm` to use `await saveCategory` and `await saveProduct`:

```js
async function saveProductFromForm(form) {
  const formData = new FormData(form);
  const selectedCategory = formData.get('categoryId');
  const newCategoryName = String(formData.get('newCategoryName') || '').trim();

  if (selectedCategory === '__new__' && !newCategoryName) {
    showNotification({ title: 'Categoria obrigatoria', message: 'Informe o nome da nova aba.', type: 'danger' });
    return;
  }

  const categoryId = selectedCategory === '__new__'
    ? (await saveCategory({ name: newCategoryName, showInShowcase: true })).id
    : selectedCategory;

  const productData = {
    id: productState.editingProductId,
    name: formData.get('name'),
    categoryId,
    price: formData.get('price'),
    cost: 0,
    stock: 0,
    active: true
  };

  await saveProduct(productData);
  closeModal();
  showNotification({ title: 'Produto salvo', message: 'Produto registrado com sucesso.', type: 'success' });
}
```

Update `saveCategoryFromForm`:

```js
async function saveCategoryFromForm(form) {
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const showInShowcase = formData.get('showInShowcase') === 'on';

  if (!name) {
    showNotification({ title: 'Categoria obrigatoria', message: 'Informe o nome da categoria.', type: 'danger' });
    return;
  }

  await saveCategory({
    id: productState.editingCategoryId,
    name,
    showInShowcase
  });

  closeModal();
  showNotification({ title: 'Categoria salva', message: 'Categoria registrada com sucesso.', type: 'success' });
}
```

- [ ] **Step 8: Update empty state copy**

Change empty strings:

```js
return '<div class="empty-products">Nenhuma categoria cadastrada no banco.</div>';
```

and:

```js
return '<div class="empty-products">Nenhum produto cadastrado no banco.</div>';
```

- [ ] **Step 9: Add sync status CSS**

Append to `src/styles/pdv.css`:

```css
.sync-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 0 14px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 800;
}

.sync-status[data-sync-state="synced"] {
  color: var(--color-success);
}

.sync-status[data-sync-state="pending"],
.sync-status[data-sync-state="cache"] {
  color: var(--color-primary);
}

.sync-status[data-sync-state="error"] {
  color: var(--color-danger);
}
```

- [ ] **Step 10: Run syntax and focused tests**

Run:

```powershell
node --check src\modules\produtos\produtos.module.js
node tests\product-adapters.test.mjs
node tests\entity-sync-repository.test.mjs
node tests\product-service.test.mjs
```

Expected: all pass.

- [ ] **Step 11: Commit**

```powershell
git add src\modules\produtos\produtos.module.js src\styles\pdv.css
git commit -m "feat: show product catalog sync status"
```

---

### Task 6: App Boot And Realtime Startup

**Files:**
- Modify: `src/app.js`
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `tests/vercel-cache-config.test.mjs`

- [ ] **Step 1: Update imports**

Add to `src/app.js`:

```js
import { loadCategories, loadProducts, startCatalogRealtime } from './services/product.service.js';
```

- [ ] **Step 2: Hydrate catalog after login**

Inside `bootstrap`, after current user exists and before `hydrateDataProvider`, add:

```js
await Promise.all([loadCategories(), loadProducts()]);
startCatalogRealtime();
```

Keep existing `hydrateDataProvider()` for other storage-backed services until later phases.

- [ ] **Step 3: Bump cache versions**

Update `index.html`:

```js
const LOCAL_CACHE_VERSION = '20260602-02-products-supabase';
await import('./src/app.js?v=20260602-02');
```

Update `service-worker.js`:

```js
const CACHE_NAME = 'pdv-v21';
```

and:

```js
'./src/app.js?v=20260602-02'
```

Update `tests/vercel-cache-config.test.mjs`:

```js
assert(indexHtml.includes('./src/app.js?v=20260602-02'), 'app entrypoint should use the latest cache-busting version');
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node tests\vercel-cache-config.test.mjs
node tests\product-adapters.test.mjs
node tests\entity-sync-repository.test.mjs
node tests\product-service.test.mjs
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add src\app.js index.html service-worker.js tests\vercel-cache-config.test.mjs
git commit -m "feat: load product catalog at app boot"
```

---

### Task 7: Manual Checklist Document

**Files:**
- Create: `docs/superpowers/checklists/2026-06-02-produtos-categorias-supabase.md`

- [ ] **Step 1: Create checklist file**

Create `docs/superpowers/checklists/2026-06-02-produtos-categorias-supabase.md`:

```md
# Produtos e Categorias Supabase - Checklist Manual

## Ambiente

- URL testada:
- Data/hora:
- Usuario:
- Navegador A:
- Navegador B:

## Persistencia apos logout

- [ ] Fazer login.
- [ ] Criar categoria pelo sistema.
- [ ] Criar produto pelo sistema.
- [ ] Fazer logout.
- [ ] Fazer login novamente.
- [ ] Confirmar que categoria continua aparecendo.
- [ ] Confirmar que produto continua aparecendo.
- [ ] Conferir registro em `categories`.
- [ ] Conferir registro em `products`.

## Sincronizacao entre navegadores

- [ ] Abrir sistema no navegador A.
- [ ] Abrir sistema no navegador B.
- [ ] Criar produto no navegador A.
- [ ] Confirmar produto no navegador B sem refresh manual.
- [ ] Editar categoria no navegador B.
- [ ] Confirmar categoria no navegador A sem refresh manual.

## Falha de conexao

- [ ] Simular falha de escrita no Supabase.
- [ ] Criar ou editar produto.
- [ ] Confirmar status de alteracao pendente.
- [ ] Restaurar conexao.
- [ ] Clicar em Sincronizar.
- [ ] Confirmar que pendencia sumiu.
- [ ] Confirmar registro no Supabase.

## Estado vazio

- [ ] Testar com banco sem produtos.
- [ ] Confirmar mensagem `Nenhum produto cadastrado no banco.`
- [ ] Testar com banco sem categorias.
- [ ] Confirmar mensagem `Nenhuma categoria cadastrada no banco.`

## Observacoes

Registre aqui falhas, prints e ajustes necessarios.
```

- [ ] **Step 2: Commit checklist**

```powershell
git add docs\superpowers\checklists\2026-06-02-produtos-categorias-supabase.md
git commit -m "docs: add product catalog sync checklist"
```

---

### Task 8: Verification And Deploy

**Files:**
- No source files unless verification finds a bug.

- [ ] **Step 1: Run focused automated tests**

Run:

```powershell
node tests\product-adapters.test.mjs
node tests\entity-sync-repository.test.mjs
node tests\product-service.test.mjs
node tests\vercel-cache-config.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Run syntax checks**

Run:

```powershell
node --check src\services\repositories\entity-sync.repository.js
node --check src\services\product-sync.service.js
node --check src\services\product.service.js
node --check src\modules\produtos\produtos.module.js
node --check src\app.js
```

Expected: no output and exit code `0`.

- [ ] **Step 3: Deploy to Vercel**

Run:

```powershell
npx.cmd vercel deploy --prod --yes
```

Expected: deployment is `READY` and aliased to `https://pdv-blue.vercel.app`.

- [ ] **Step 4: Verify production version**

Run:

```powershell
$pageResponse = Invoke-WebRequest -UseBasicParsing -Uri 'https://pdv-blue.vercel.app/' -TimeoutSec 20
$pageResponse.StatusCode
$pageResponse.Content.Contains('20260602-02')
```

Expected:

```text
200
True
```

- [ ] **Step 5: Run manual checklist**

Open:

```text
docs/superpowers/checklists/2026-06-02-produtos-categorias-supabase.md
```

Fill the checklist with test results and commit it:

```powershell
git add docs\superpowers\checklists\2026-06-02-produtos-categorias-supabase.md
git commit -m "docs: record product catalog sync test results"
```

---

## Self-Review

Spec coverage:

- Supabase as primary source: Tasks 2, 3, 4, 5, 6.
- Cache local temporario: Task 2.
- Offline queue: Task 2.
- General sync status: Tasks 2, 3, 5.
- Realtime: Tasks 2, 3, 6.
- No automatic migration: no task migrates local records to Supabase.
- Empty state from real DB: Task 5.
- Tests and checklist: Tasks 1, 2, 4, 7, 8.

No placeholders are intentionally left in this plan. Function names are consistent across tasks: `createEntitySyncRepository`, `loadProducts`, `loadCategories`, `saveProduct`, `saveCategory`, `removeProduct`, `removeCategory`, `getCatalogSyncStatus`, `startCatalogRealtime`, and `syncCatalogNow`.
