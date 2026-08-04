import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-04';

export const productStockAdapter = {
  table: 'product_stock',
  cacheKey: STORAGE_KEYS.productStock,
  queueKey: STORAGE_KEYS.showcaseSyncQueue,
  select: 'id,product_id,quantity_available,updated_by,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      productId: row.product_id || '',
      quantityAvailable: Number(row.quantity_available) || 0,
      updatedBy: row.updated_by || '',
      updatedAt: row.updated_at || new Date().toISOString()
    };
  },
  toRow(stock) {
    return {
      id: stock.id,
      product_id: stock.productId || '',
      quantity_available: requiredNumber(stock.quantityAvailable, 'quantityAvailable'),
      updated_by: stock.updatedBy || null,
      updated_at: stock.updatedAt || new Date().toISOString()
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

export const { fromRow, toRow } = productStockAdapter;
