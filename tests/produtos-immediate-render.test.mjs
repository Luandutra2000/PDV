import fs from 'node:fs';
import assert from 'node:assert/strict';

const moduleSource = fs.readFileSync(
  new URL('../src/modules/produtos/produtos.module.js?v=20260804-06', import.meta.url),
  'utf8'
);

assert.match(moduleSource, /function renderCatalogFromLocalState\(container\)/, 'products module should expose immediate local rendering');
assert.match(moduleSource, /await saveProductFromForm\(event\.target\);\s*renderCatalogFromLocalState\(container\);/s, 'product save should render the updated local catalog');
assert.match(moduleSource, /await saveCategoryFromForm\(event\.target\);\s*renderCatalogFromLocalState\(container\);/s, 'category save should render the updated local catalog');
assert.match(moduleSource, /await removeProduct\(actionButton\.dataset\.productId\);\s*renderCatalogFromLocalState\(container\);/s, 'product deletion should render the updated local catalog');
assert.match(moduleSource, /await removeCategory\(actionButton\.dataset\.categoryId\);\s*renderCatalogFromLocalState\(container\);/s, 'category deletion should render the updated local catalog');

console.log('produtos immediate render ok');
