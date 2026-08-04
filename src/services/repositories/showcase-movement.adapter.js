import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-06';

export const showcaseMovementAdapter = {
  table: 'showcase_movements',
  cacheKey: STORAGE_KEYS.showcaseMovements,
  queueKey: STORAGE_KEYS.showcaseSyncQueue,
  select: 'id,operation_id,product_id,movement_type,quantity,previous_quantity,new_quantity,sale_id,command_id,user_id,notes,reversed_movement_id,status,created_at',
  fromRow(row) {
    return {
      id: row.id,
      operationId: row.operation_id || '',
      productId: row.product_id || '',
      movementType: row.movement_type || '',
      quantity: Number(row.quantity) || 0,
      previousQuantity: Number(row.previous_quantity) || 0,
      newQuantity: Number(row.new_quantity) || 0,
      saleId: row.sale_id || null,
      commandId: row.command_id || null,
      userId: row.user_id || '',
      notes: row.notes || '',
      reversedMovementId: row.reversed_movement_id || null,
      status: row.status || 'ativa',
      createdAt: row.created_at || new Date().toISOString()
    };
  },
  toRow(movement) {
    return {
      id: movement.id,
      operation_id: movement.operationId || '',
      product_id: movement.productId || '',
      movement_type: movement.movementType || '',
      quantity: requiredNumber(movement.quantity, 'quantity'),
      previous_quantity: requiredNumber(movement.previousQuantity, 'previousQuantity'),
      new_quantity: requiredNumber(movement.newQuantity, 'newQuantity'),
      sale_id: movement.saleId || null,
      command_id: movement.commandId || null,
      user_id: movement.userId || null,
      notes: movement.notes || '',
      reversed_movement_id: movement.reversedMovementId || null,
      status: movement.status || 'ativa',
      created_at: movement.createdAt || new Date().toISOString()
    };
  }
};

function requiredNumber(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Invalid required numeric field: ${fieldName}`);
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`Invalid required numeric field: ${fieldName}`);
  }

  return numericValue;
}

export const { fromRow, toRow } = showcaseMovementAdapter;
