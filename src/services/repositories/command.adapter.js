export const commandAdapter = {
  table: 'commands',
  cacheKey: 'pdv.closedComandas',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,number,status,total,payment_method,received_amount,change_amount,created_at,updated_at,closed_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      number: Number(row.number) || 0,
      status: row.status || 'fechada',
      items: [],
      total: Number(row.total) || 0,
      paymentMethod: row.payment_method || '',
      receivedAmount: Number(row.received_amount) || 0,
      change: Number(row.change_amount) || 0,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.closed_at || row.created_at || new Date().toISOString(),
      closedAt: row.closed_at || null,
      canceledAt: row.canceled_at || null
    };
  },
  toRow(command) {
    return {
      id: command.id,
      number: Number(command.number) || 0,
      status: command.status || 'fechada',
      total: Number(command.total) || 0,
      payment_method: command.paymentMethod || null,
      received_amount: Number(command.receivedAmount) || 0,
      change_amount: Number(command.change) || 0,
      created_by: command.createdBy || null,
      created_at: command.createdAt || command.closedAt || new Date().toISOString(),
      updated_at: command.updatedAt || command.closedAt || command.createdAt || new Date().toISOString(),
      closed_at: command.closedAt || null,
      canceled_at: command.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = commandAdapter;
