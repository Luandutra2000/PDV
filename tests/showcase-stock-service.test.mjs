import assert from 'node:assert/strict';

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

const showcase = await import('../src/services/showcase-stock.service.js');

function reset() {
  localStorage.clear();
  showcase.resetShowcaseStockForTests();
}

reset();

let result = showcase.applyProductionToShowcase({
  operationId: 'prod-1',
  productId: 'coxinha',
  quantity: 10,
  userId: 'user-1',
  createdAt: '2026-06-15T10:00:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('coxinha').quantityAvailable, 10, 'production should increase stock to 10');
assert.equal(result.stock.quantityAvailable, 10, 'production result should include changed stock');
assert.equal(result.movements[0].movementType, 'entrada_producao', 'production should write entrada_producao movement');

assert.throws(
  () => showcase.applyProductionToShowcase({
    operationId: 'prod-zero',
    productId: 'coxinha',
    quantity: 0,
    userId: 'user-1',
    createdAt: '2026-06-15T10:05:00.000Z'
  }),
  /quantity must be greater than 0/,
  'zero production quantity should throw clear error'
);
assert.equal(
  showcase.getShowcaseMovements().filter((item) => item.operationId === 'prod-zero').length,
  0,
  'zero production quantity should not create movement'
);

result = showcase.applySaleToShowcase({
  operationId: 'sale-op-1',
  saleId: 'sale-1',
  commandId: 'cmd-1',
  userId: 'user-1',
  createdAt: '2026-06-15T10:10:00.000Z',
  items: [{ productId: 'coxinha', quantity: 2, unitPrice: 7 }]
});

assert.equal(showcase.getShowcaseStockByProductId('coxinha').quantityAvailable, 8, 'selling 2 from 10 should leave 8');
assert.equal(result.movements[0].movementType, 'saida_venda', 'stocked sale should write saida_venda movement');
assert.equal(showcase.getOutOfStockSales().length, 0, 'stocked sale should not create out-of-stock row');

result = showcase.applySaleToShowcase({
  operationId: 'sale-op-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  createdAt: '2026-06-15T10:20:00.000Z',
  items: [{ productId: 'coxinha', quantity: 11, unitPrice: 7 }]
});

assert.equal(showcase.getShowcaseStockByProductId('coxinha').quantityAvailable, 0, 'selling 11 from 8 should leave visual stock at 0');
assert.equal(result.outOfStockSales[0].quantity, 3, 'short sale should record missing quantity 3');
assert.equal(result.movements.find((item) => item.movementType === 'venda_sem_estoque').quantity, 3, 'short sale should write venda_sem_estoque movement');

result = showcase.applySaleToShowcase({
  operationId: 'sale-op-2',
  saleId: 'sale-2',
  commandId: 'cmd-2',
  userId: 'user-1',
  createdAt: '2026-06-15T10:20:00.000Z',
  items: [{ productId: 'coxinha', quantity: 11, unitPrice: 7 }]
});

assert.equal(showcase.getShowcaseStockByProductId('coxinha').quantityAvailable, 0, 'repeating sale should not decrement again');
assert.equal(showcase.getOutOfStockSales().filter((item) => item.saleId === 'sale-2').length, 1, 'repeating sale should not duplicate out-of-stock row');
assert.equal(result.changed, false, 'repeating sale should report no change');

reset();
showcase.applyProductionToShowcase({
  operationId: 'prod-dup',
  productId: 'risole',
  quantity: 5,
  userId: 'user-1',
  createdAt: '2026-06-15T11:00:00.000Z'
});

result = showcase.applySaleToShowcase({
  operationId: 'sale-op-dup',
  saleId: 'sale-dup',
  commandId: 'cmd-dup',
  userId: 'user-1',
  createdAt: '2026-06-15T11:10:00.000Z',
  items: [
    { productId: 'risole', quantity: 3, unitPrice: 8 },
    { productId: 'risole', quantity: 4, unitPrice: 8 }
  ]
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 0, 'duplicate product lines should be counted together');
assert.equal(result.outOfStockSales[0].quantity, 2, 'duplicate product lines should record the total shortage');
assert.equal(showcase.getShowcaseMovements().filter((item) => item.saleId === 'sale-dup' && item.productId === 'risole' && item.movementType === 'saida_venda').length, 1, 'duplicate product lines should produce one stocked movement per sale product');

result = showcase.reverseSaleInShowcase({
  operationId: 'reverse-sale-dup',
  saleId: 'sale-dup',
  commandId: 'cmd-dup',
  userId: 'user-1',
  createdAt: '2026-06-15T11:20:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 5, 'reverse should restore only stocked quantity');
assert.equal(showcase.getActiveOutOfStockSales().length, 0, 'reverse should cancel out-of-stock rows');
assert.equal(showcase.getShowcaseMovements().find((item) => item.id === 'mov-sale-op-dup-risole-saida_venda').status, 'estornada', 'reverse should mark original sale movement as estornada');
assert.equal(result.movements[0].movementType, 'estorno_venda', 'reverse should write estorno_venda movement');
assert.equal(result.movements.some((item) => item.movementType === 'estorno_sem_estoque'), true, 'reverse should write estorno_sem_estoque movement');

result = showcase.reverseSaleInShowcase({
  operationId: 'reverse-sale-dup',
  saleId: 'sale-dup',
  commandId: 'cmd-dup',
  userId: 'user-1',
  createdAt: '2026-06-15T11:20:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 5, 'repeating reverse should not double-credit stock');
assert.equal(showcase.getShowcaseMovements().filter((item) => item.movementType === 'estorno_venda').length, 1, 'repeating reverse should not duplicate reverse movement');
assert.equal(showcase.getShowcaseMovements().filter((item) => item.movementType === 'estorno_sem_estoque').length, 1, 'repeating reverse should not duplicate out-of-stock reverse movement');
assert.equal(result.changed, false, 'repeating reverse should report no change');

result = showcase.reverseSaleInShowcase({
  operationId: 'reverse-sale-dup-second',
  saleId: 'sale-dup',
  commandId: 'cmd-dup',
  userId: 'user-1',
  createdAt: '2026-06-15T11:25:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 5, 'reversing again with different operation should not double-credit stock');
assert.equal(showcase.getShowcaseMovements().filter((item) => item.movementType === 'estorno_sem_estoque').length, 1, 'reversing again with different operation should not duplicate out-of-stock reverse movement');
assert.equal(result.changed, false, 'reversing again with different operation should report no change');

result = showcase.adjustShowcaseStock({
  operationId: 'adjust-1',
  productId: 'risole',
  quantityAvailable: 12,
  reason: 'conferencia',
  note: 'balcao contado',
  userId: 'user-1',
  createdAt: '2026-06-15T11:30:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 12, 'manual adjustment should set stock');
assert.equal(result.movements[0].movementType, 'ajuste_manual', 'manual adjustment should write ajuste_manual movement');
assert.match(result.movements[0].notes, /conferencia/, 'manual adjustment movement should include reason in notes');
assert.match(result.movements[0].notes, /balcao contado/, 'manual adjustment movement should include note in notes');

showcase.adjustShowcaseStock({
  operationId: 'adjust-setup-8',
  productId: 'risole',
  quantityAvailable: 8,
  reason: 'preparo do teste',
  note: 'estoque base',
  userId: 'user-1',
  createdAt: '2026-06-15T11:35:00.000Z'
});

result = showcase.adjustShowcaseStock({
  operationId: 'adjust-8-to-5',
  productId: 'risole',
  quantityAvailable: 5,
  reason: 'conferencia',
  note: 'ajuste para baixo',
  userId: 'user-1',
  createdAt: '2026-06-15T11:40:00.000Z'
});

assert.equal(showcase.getShowcaseStockByProductId('risole').quantityAvailable, 5, 'manual adjustment should support reducing stock');
assert.equal(result.movements[0].quantity, 3, 'manual adjustment from 8 to 5 should record absolute stock delta');

assert.throws(
  () => showcase.applyProductionToShowcase({ operationId: 'bad-prod', productId: 'risole', quantity: 'abc' }),
  /quantity must be a valid number/,
  'invalid production quantity should throw clear error'
);

assert.throws(
  () => showcase.applySaleToShowcase({
    operationId: 'bad-sale',
    saleId: 'bad-sale',
    items: [{ productId: 'risole', quantity: -1 }]
  }),
  /quantity must be greater than or equal to 0/,
  'negative sale quantity should throw clear error'
);

console.log('showcase stock service ok');
