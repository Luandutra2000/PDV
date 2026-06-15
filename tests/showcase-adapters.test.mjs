import assert from 'node:assert/strict';

import { STORAGE_KEYS, UI_EVENTS } from '../src/database/schema.js';
import { productStockAdapter } from '../src/services/repositories/product-stock.adapter.js';
import { showcaseMovementAdapter } from '../src/services/repositories/showcase-movement.adapter.js';
import { outOfStockSaleAdapter } from '../src/services/repositories/out-of-stock-sale.adapter.js';

function assertInvalidNumberThrows(fn, fieldName) {
  assert.throws(fn, {
    name: 'Error',
    message: `Invalid required numeric field: ${fieldName}`
  });
}

assert.equal(STORAGE_KEYS.productStock, 'pdv.productStock');
assert.equal(STORAGE_KEYS.showcaseMovements, 'pdv.showcaseMovements');
assert.equal(STORAGE_KEYS.outOfStockSales, 'pdv.outOfStockSales');
assert.equal(STORAGE_KEYS.showcaseSyncQueue, 'pdv.syncQueue.showcase');

assert.equal(UI_EVENTS.showcaseStockChanged, 'SHOWCASE_STOCK_CHANGED');
assert.equal(UI_EVENTS.showcaseDataChanged, 'SHOWCASE_DATA_CHANGED');
assert.equal(UI_EVENTS.showcaseSyncStatusChanged, 'SHOWCASE_SYNC_STATUS_CHANGED');

assert.equal(productStockAdapter.table, 'product_stock');
assert.equal(productStockAdapter.select, 'id,product_id,quantity_available,updated_by,updated_at');

const productStockRow = productStockAdapter.toRow({
  id: 'stock-risole',
  productId: 'risole',
  quantityAvailable: '12.5',
  updatedBy: 'user-1',
  updatedAt: '2026-06-15T10:00:00.000Z'
});

assert.deepEqual(productStockRow, {
  id: 'stock-risole',
  product_id: 'risole',
  quantity_available: 12.5,
  updated_by: 'user-1',
  updated_at: '2026-06-15T10:00:00.000Z'
});

assert.deepEqual(productStockAdapter.fromRow({
  id: 'stock-coxinha',
  product_id: 'coxinha',
  quantity_available: '7.25',
  updated_by: null,
  updated_at: '2026-06-15T11:00:00.000Z'
}), {
  id: 'stock-coxinha',
  productId: 'coxinha',
  quantityAvailable: 7.25,
  updatedBy: '',
  updatedAt: '2026-06-15T11:00:00.000Z'
});

assertInvalidNumberThrows(
  () => productStockAdapter.toRow({ id: 'stock-invalid', productId: 'risole', quantityAvailable: 'not-a-number' }),
  'quantityAvailable'
);

assert.equal(showcaseMovementAdapter.table, 'showcase_movements');
assert.equal(
  showcaseMovementAdapter.select,
  'id,operation_id,product_id,movement_type,quantity,previous_quantity,new_quantity,sale_id,command_id,user_id,notes,reversed_movement_id,status,created_at'
);

const movementRow = showcaseMovementAdapter.toRow({
  id: 'mov-1',
  operationId: 'op-1',
  productId: 'risole',
  movementType: 'saida_venda',
  quantity: '2',
  previousQuantity: '10',
  newQuantity: '8',
  saleId: '',
  commandId: undefined,
  userId: 'user-1',
  notes: '',
  reversedMovementId: null,
  status: 'ativa',
  createdAt: '2026-06-15T12:00:00.000Z'
});

assert.deepEqual(movementRow, {
  id: 'mov-1',
  operation_id: 'op-1',
  product_id: 'risole',
  movement_type: 'saida_venda',
  quantity: 2,
  previous_quantity: 10,
  new_quantity: 8,
  sale_id: null,
  command_id: null,
  user_id: 'user-1',
  notes: '',
  reversed_movement_id: null,
  status: 'ativa',
  created_at: '2026-06-15T12:00:00.000Z'
});

assert.deepEqual(showcaseMovementAdapter.fromRow({
  id: 'mov-2',
  operation_id: 'op-2',
  product_id: 'coxinha',
  movement_type: 'venda_sem_estoque',
  quantity: '3',
  previous_quantity: '0',
  new_quantity: '0',
  sale_id: null,
  command_id: null,
  user_id: null,
  notes: null,
  reversed_movement_id: null,
  status: null,
  created_at: '2026-06-15T12:30:00.000Z'
}), {
  id: 'mov-2',
  operationId: 'op-2',
  productId: 'coxinha',
  movementType: 'venda_sem_estoque',
  quantity: 3,
  previousQuantity: 0,
  newQuantity: 0,
  saleId: null,
  commandId: null,
  userId: '',
  notes: '',
  reversedMovementId: null,
  status: 'ativa',
  createdAt: '2026-06-15T12:30:00.000Z'
});

assertInvalidNumberThrows(
  () => showcaseMovementAdapter.toRow({ id: 'mov-invalid', quantity: 'invalid', previousQuantity: 1, newQuantity: 2 }),
  'quantity'
);

assertInvalidNumberThrows(
  () => showcaseMovementAdapter.toRow({ id: 'mov-invalid', quantity: 1, previousQuantity: undefined, newQuantity: 2 }),
  'previousQuantity'
);

assertInvalidNumberThrows(
  () => showcaseMovementAdapter.toRow({ id: 'mov-invalid', quantity: 1, previousQuantity: 2, newQuantity: Number.POSITIVE_INFINITY }),
  'newQuantity'
);

assert.equal(outOfStockSaleAdapter.table, 'out_of_stock_sales');
assert.equal(
  outOfStockSaleAdapter.select,
  'id,operation_id,product_id,sale_id,command_id,quantity,unit_price,total_price,user_id,status,created_at,canceled_at,canceled_by'
);

const outOfStockRow = outOfStockSaleAdapter.toRow({
  id: 'out-1',
  operationId: 'op-3',
  productId: 'risole',
  saleId: 'sale-1',
  commandId: '',
  quantity: '4',
  unitPrice: '7.5',
  totalPrice: '30',
  userId: 'user-2',
  status: '',
  createdAt: '2026-06-15T13:00:00.000Z',
  canceledAt: undefined,
  canceledBy: ''
});

assert.deepEqual(outOfStockRow, {
  id: 'out-1',
  operation_id: 'op-3',
  product_id: 'risole',
  sale_id: 'sale-1',
  command_id: null,
  quantity: 4,
  unit_price: 7.5,
  total_price: 30,
  user_id: 'user-2',
  status: 'ativa',
  created_at: '2026-06-15T13:00:00.000Z',
  canceled_at: null,
  canceled_by: null
});

assert.deepEqual(outOfStockSaleAdapter.fromRow({
  id: 'out-2',
  operation_id: 'op-4',
  product_id: 'coxinha',
  sale_id: null,
  command_id: null,
  quantity: '5',
  unit_price: '7.5',
  total_price: '37.5',
  user_id: null,
  status: null,
  created_at: '2026-06-15T14:00:00.000Z',
  canceled_at: null,
  canceled_by: null
}), {
  id: 'out-2',
  operationId: 'op-4',
  productId: 'coxinha',
  saleId: null,
  commandId: null,
  quantity: 5,
  unitPrice: 7.5,
  totalPrice: 37.5,
  userId: '',
  status: 'ativa',
  createdAt: '2026-06-15T14:00:00.000Z',
  canceledAt: null,
  canceledBy: null
});

assertInvalidNumberThrows(
  () => outOfStockSaleAdapter.toRow({ id: 'out-invalid', quantity: null, unitPrice: 7.5, totalPrice: 15 }),
  'quantity'
);

assertInvalidNumberThrows(
  () => outOfStockSaleAdapter.toRow({ id: 'out-invalid', quantity: 2, unitPrice: 'bad-price', totalPrice: 15 }),
  'unitPrice'
);

assertInvalidNumberThrows(
  () => outOfStockSaleAdapter.toRow({ id: 'out-invalid', quantity: 2, unitPrice: 7.5, totalPrice: Number.NaN }),
  'totalPrice'
);

console.log('showcase adapters ok');
