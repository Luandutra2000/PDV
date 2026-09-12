import fs from 'node:fs';
import assert from 'node:assert/strict';

const moduleSource = fs.readFileSync(
  new URL('../src/modules/produtos/produtos.module.js?v=20260804-06', import.meta.url),
  'utf8'
);

assert.match(moduleSource, /function renderCatalogFromLocalState\(container\)/, 'products module should expose immediate local rendering');
assert.match(moduleSource, /await saveProductFromForm\(event\.target\);\s*renderCatalogFromLocalState\(container\);/s, 'product save should render the updated local catalog');
assert.match(moduleSource, /await saveCategoryFromForm\(event\.target\);\s*renderCatalogFromLocalState\(container\);/s, 'category save should render the updated local catalog');
assert.match(moduleSource, /openDeleteConfirmation\(container, 'product', actionButton\.dataset\.productId\);\s*return;/s, 'product deletion should open confirmation before changing the catalog');
assert.match(moduleSource, /await removeProduct\(productState\.deletingProductId\);\s*productState\.deletingProductId = null;\s*renderCatalogFromLocalState\(container\);/s, 'confirmed product deletion should render the updated local catalog');
assert.match(moduleSource, /openDeleteConfirmation\(container, 'category', actionButton\.dataset\.categoryId\);\s*return;/s, 'category deletion should open confirmation before changing the catalog');
assert.match(moduleSource, /await removeCategory\(productState\.deletingCategoryId\);\s*productState\.deletingCategoryId = null;\s*renderCatalogFromLocalState\(container\);/s, 'confirmed category deletion should render the updated local catalog');

console.log('produtos immediate render ok');
