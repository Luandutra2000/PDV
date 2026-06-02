export const cashMovementAdapter = {
  table: 'cash_movements',
  cacheKey: 'pdv.transactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,type,status,amount,category,description,user_name,created_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      type: row.type,
      status: row.status || 'ativa',
      amount: Number(row.amount) || 0,
      category: row.category || 'sem-categoria',
      description: row.description || '',
      userName: row.user_name || 'Local',
      createdAt: row.created_at || new Date().toISOString(),
      canceledAt: row.canceled_at || null
    };
  },
  toRow(movement) {
    return {
      id: movement.id,
      type: movement.type,
      status: movement.status || 'ativa',
      amount: Number(movement.amount) || 0,
      category: movement.category || 'sem-categoria',
      description: movement.description || '',
      user_name: movement.userName || 'Local',
      created_at: movement.createdAt || new Date().toISOString(),
      canceled_at: movement.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = cashMovementAdapter;
