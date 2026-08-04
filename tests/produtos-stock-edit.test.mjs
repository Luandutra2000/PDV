import fs from 'node:fs';
import assert from 'node:assert/strict';

const moduleSource = fs.readFileSync(
  new URL('../src/modules/produtos/produtos.module.js?v=20260804-03', import.meta.url),
  'utf8'
);

assert.match(moduleSource, /name="stock" type="number" min="0"/, 'product modal should allow editing non-negative stock');
assert.match(moduleSource, /formData\.get\('stock'\)/, 'product form should save the informed stock');
assert.match(moduleSource, /getShowcaseStockByProductId/, 'product form should compare against the live showcase stock');
assert.match(moduleSource, /adjustShowcaseStockOnline/, 'product form should synchronize the informed stock with the showcase');
assert.match(moduleSource, /quantityAvailable: nextStock/, 'product stock adjustment should send the exact informed quantity');
assert.match(moduleSource, /action: 'product\.stock\.adjust'/, 'manual stock changes should create an audit entry');
assert.match(moduleSource, /previousStock:/, 'stock audit should preserve the previous quantity');
assert.match(moduleSource, /newStock:/, 'stock audit should preserve the new quantity');

console.log('produtos stock edit ok');
