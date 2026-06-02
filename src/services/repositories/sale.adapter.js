export const saleAdapter = {
  table: 'sales',
  cacheKey: 'pdv.transactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,status,command_id,command_number,total,payment_method,received_amount,change_amount,created_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      type: 'venda',
      status: row.status || 'ativa',
      comandaId: row.command_id || '',
      comandaNumber: Number(row.command_number) || 0,
      items: [],
      total: Number(row.total) || 0,
      paymentMethod: row.payment_method || '',
      receivedAmount: Number(row.received_amount) || 0,
      change: Number(row.change_amount) || 0,
      createdAt: row.created_at || new Date().toISOString(),
      canceledAt: row.canceled_at || null
    };
  },
  toRow(sale) {
    return {
      id: sale.id,
      status: sale.status || 'ativa',
      command_id: sale.comandaId || null,
      command_number: Number(sale.comandaNumber) || null,
      total: Number(sale.total) || 0,
      payment_method: sale.paymentMethod,
      received_amount: Number(sale.receivedAmount) || 0,
      change_amount: Number(sale.change) || 0,
      created_at: sale.createdAt || new Date().toISOString(),
      canceled_at: sale.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = saleAdapter;
