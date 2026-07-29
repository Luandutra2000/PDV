export const cashClosingAdapter = {
  table: 'cash_closings',
  cacheKey: 'pdv.cashClosings',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,status,totals,payments,showcase,differences,input,created_at,closed_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      status: row.status || 'fechado',
      totals: row.totals || {},
      payments: row.payments || {},
      showcase: Array.isArray(row.showcase) ? row.showcase : [],
      outOfStockSales: Array.isArray(row.input?.outOfStockSales) ? row.input.outOfStockSales : [],
      differences: Array.isArray(row.differences) ? row.differences : [],
      input: row.input || {},
      createdAt: row.created_at || row.closed_at || new Date().toISOString(),
      closedAt: row.closed_at || row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.closed_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(closing) {
    return {
      id: closing.id,
      status: closing.status || 'fechado',
      totals: closing.totals || {},
      payments: closing.payments || {},
      showcase: closing.showcase || [],
      differences: closing.differences || [],
      input: {
        ...(closing.input || {}),
        outOfStockSales: closing.outOfStockSales || closing.input?.outOfStockSales || []
      },
      created_at: closing.createdAt || closing.closedAt || new Date().toISOString(),
      closed_at: closing.closedAt || closing.createdAt || new Date().toISOString(),
      updated_at: closing.updatedAt || closing.closedAt || closing.createdAt || new Date().toISOString()
    };
  }
};

export const { fromRow, toRow } = cashClosingAdapter;
