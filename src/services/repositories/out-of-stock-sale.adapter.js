import { STORAGE_KEYS } from '../../database/schema.js';

export const outOfStockSaleAdapter = {
  table: 'out_of_stock_sales',
  cacheKey: STORAGE_KEYS.outOfStockSales,
  queueKey: STORAGE_KEYS.showcaseSyncQueue,
  select: 'id,operation_id,product_id,sale_id,command_id,quantity,unit_price,total_price,user_id,status,created_at,canceled_at,canceled_by',
  fromRow(row) {
    return {
      id: row.id,
      operationId: row.operation_id || '',
      productId: row.product_id || '',
      saleId: row.sale_id || null,
      commandId: row.command_id || null,
      quantity: Number(row.quantity) || 0,
      unitPrice: Number(row.unit_price) || 0,
      totalPrice: Number(row.total_price) || 0,
      userId: row.user_id || '',
      status: row.status || 'ativa',
      createdAt: row.created_at || new Date().toISOString(),
      canceledAt: row.canceled_at || null,
      canceledBy: row.canceled_by || null
    };
  },
  toRow(sale) {
    return {
      id: sale.id,
      operation_id: sale.operationId || '',
      product_id: sale.productId || '',
      sale_id: sale.saleId || null,
      command_id: sale.commandId || null,
      quantity: requiredNumber(sale.quantity, 'quantity'),
      unit_price: requiredNumber(sale.unitPrice, 'unitPrice'),
      total_price: requiredNumber(sale.totalPrice, 'totalPrice'),
      user_id: sale.userId || null,
      status: sale.status || 'ativa',
      created_at: sale.createdAt || new Date().toISOString(),
      canceled_at: sale.canceledAt || null,
      canceled_by: sale.canceledBy || null
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

export const { fromRow, toRow } = outOfStockSaleAdapter;
