import assert from 'node:assert/strict';
import test from 'node:test';

test('storage service sanitizes values before persisting them', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    }
  };

  const storage = await import('../src/services/storage.service.js');

  const savedValue = storage.setItem('pdv.test', {
    name: '<script>alert(1)</script>Produto',
    link: 'javascript:alert(1)',
    nested: ['<b>seguro</b>']
  });

  assert.equal(savedValue.name, 'scriptalert(1)/scriptProduto');
  assert.equal(savedValue.link, 'alert(1)');
  assert.equal(savedValue.nested[0], 'bseguro/b');
  assert.equal(store.get('pdv.test').includes('<'), false);
});
