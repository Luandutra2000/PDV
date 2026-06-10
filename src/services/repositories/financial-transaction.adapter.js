export const financialTransactionAdapter = {
  table: 'financial_transactions',
  cacheKey: 'pdv.financialTransactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,type,description,amount,category_id,payment_method,status,transaction_date,due_date,paid_at,notes,origin,cash_movement_id,moves_cash_session,created_by,canceled_at,cancel_reason,created_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      type: row.type || 'expense',
      description: row.description || '',
      amount: Number(row.amount) || 0,
      categoryId: row.category_id || '',
      paymentMethod: row.payment_method || 'dinheiro',
      status: row.status || 'paid',
      transactionDate: row.transaction_date || toDateOnly(row.created_at),
      dueDate: row.due_date || '',
      paidAt: row.paid_at || null,
      notes: row.notes || '',
      origin: row.origin || 'finance',
      cashMovementId: row.cash_movement_id || null,
      movesCashSession: row.moves_cash_session === true,
      createdBy: row.created_by || '',
      canceledAt: row.canceled_at || null,
      cancelReason: row.cancel_reason || '',
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(transaction) {
    return {
      id: transaction.id,
      type: transaction.type,
      description: transaction.description || '',
      amount: Number(transaction.amount) || 0,
      category_id: transaction.categoryId || null,
      payment_method: transaction.paymentMethod || 'dinheiro',
      status: transaction.status || 'paid',
      transaction_date: transaction.transactionDate || toDateOnly(transaction.createdAt),
      due_date: transaction.dueDate || null,
      paid_at: transaction.paidAt || null,
      notes: transaction.notes || '',
      origin: transaction.origin || 'finance',
      cash_movement_id: transaction.cashMovementId || null,
      moves_cash_session: transaction.movesCashSession === true,
      created_by: transaction.createdBy || null,
      canceled_at: transaction.canceledAt || null,
      cancel_reason: transaction.cancelReason || null,
      created_at: transaction.createdAt || new Date().toISOString(),
      updated_at: transaction.updatedAt || new Date().toISOString()
    };
  }
};

function toDateOnly(value) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

export const { fromRow, toRow } = financialTransactionAdapter;
