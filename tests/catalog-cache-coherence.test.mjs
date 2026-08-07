import fs from 'node:fs';
import assert from 'node:assert/strict';

const repositorySource = fs.readFileSync(
  new URL('../src/services/repositories/entity-sync.repository.js?v=20260804-06', import.meta.url),
  'utf8'
);
const syncSource = fs.readFileSync(
  new URL('../src/services/product-sync.service.js?v=20260804-06', import.meta.url),
  'utf8'
);

assert.match(repositorySource, /readCacheOverride = null/, 'entity repository should accept a provider cache reader');
assert.match(repositorySource, /writeCacheOverride = null/, 'entity repository should accept a provider cache writer');
assert.match(syncSource, /writeCacheOverride: \(items\) => setLocalCache\(productAdapter\.cacheKey, items\)/, 'products should update the local provider cache without scheduling remote sync');

console.log('catalog cache coherence ok');
