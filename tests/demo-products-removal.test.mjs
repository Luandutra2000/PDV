import { readFile } from 'node:fs/promises';

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

const originalNodeEnv = process.env.NODE_ENV;
process.env.NODE_ENV = 'production';

try {
  const storage = await import('../src/services/storage.service.js?demo-products-removal');
  const { STORAGE_KEYS } = await import('../src/database/schema.js?demo-products-removal');

  storage.ensureSeedData();

  const products = storage.getItem(STORAGE_KEYS.products);
  const categories = storage.getItem(STORAGE_KEYS.categories);

  assert(Array.isArray(products) && products.length === 0, 'production startup should create an empty product catalog');
  assert(categories.some((category) => category.id === 'lanches'), 'Lanches category should remain');
  assert(categories.some((category) => category.id === 'bebidas'), 'Bebidas category should remain');
  assert(categories.some((category) => category.id === 'porcoes'), 'Porcoes category should remain');
  assert(categories.some((category) => category.id === 'combos'), 'Combos category should remain');

  storage.ensureSeedData();
  assert(storage.getItem(STORAGE_KEYS.products).length === 0, 'repeated startup should not recreate demo products');

  storage.resetAppData();
  assert(storage.getItem(STORAGE_KEYS.products).length === 0, 'production reset should keep the product catalog empty');

  const migration = await readFile(
    new URL('../supabase/migrations/20260808120000_remove_demo_products.sql', import.meta.url),
    'utf8'
  );
  const expectedIds = [
    'x-burger',
    'x-salada',
    'x-bacon',
    'misto-quente',
    'batata-frita',
    'frango-passarinho',
    'refrigerante-lata',
    'suco-natural',
    'agua',
    'combo-casal',
    'combo-familia'
  ];

  assert(/^\s*--[\s\S]*?delete from public\.products\s+where id in \s*\(/i.test(migration), 'migration should delete only from products by id list');
  assert(!/delete from public\.categories/i.test(migration), 'migration should not delete categories');
  assert(expectedIds.every((id) => migration.includes(`'${id}'`)), 'migration should include every approved demo product id');
} finally {
  process.env.NODE_ENV = originalNodeEnv;
}

console.log('demo product removal ok');
