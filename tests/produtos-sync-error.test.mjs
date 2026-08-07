import fs from 'node:fs';
import assert from 'node:assert/strict';

const moduleSource = fs.readFileSync(
  new URL('../src/modules/produtos/produtos.module.js?v=20260804-06', import.meta.url),
  'utf8'
);

assert.match(moduleSource, /function getCatalogSyncError\(status/, 'products module should resolve the catalog sync error');
assert.match(moduleSource, /status\?\.products\?\.error/, 'product errors should have priority in catalog diagnostics');
assert.match(moduleSource, /escapeHtml\(syncError\)/, 'remote sync errors should be escaped before rendering');
assert.match(moduleSource, /sync-status__error/, 'sync errors should remain visible in the status banner');
assert.match(moduleSource, /title: 'Sincronizacao pendente'/, 'manual sync should notify when operations remain pending');
assert.match(moduleSource, /title: 'Catalogo sincronizado'/, 'manual sync should confirm when the queue is completed');

console.log('produtos sync error diagnostics ok');
