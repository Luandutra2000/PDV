// O banco de producao so aceita type 'entrada' ou 'saida' (cash_movements_type_check,
// diferente da migracao do repositorio). A sangria vai como 'saida' com a categoria
// reservada 'sangria' e volta a ser sangria na leitura.
const SANGRIA_CATEGORY = 'sangria';

export const cashMovementAdapter = {
  table: 'cash_movements',
  cacheKey: 'pdv.transactions',
  queueKey: 'pdv.syncQueue.financial',
  select: 'id,type,status,amount,category,description,user_name,created_at,canceled_at',
  fromRow(row) {
    return {
      id: row.id,
      type: row.type === 'saida' && row.category === SANGRIA_CATEGORY ? 'sangria' : row.type,
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
      type: movement.type === 'sangria' ? 'saida' : movement.type,
      status: movement.status || 'ativa',
      amount: Number(movement.amount) || 0,
      category: movement.type === 'sangria' ? SANGRIA_CATEGORY : (movement.category || 'sem-categoria'),
      description: movement.description || '',
      user_name: movement.userName || 'Local',
      created_at: movement.createdAt || new Date().toISOString(),
      canceled_at: movement.canceledAt || null
    };
  }
};

export const { fromRow, toRow } = cashMovementAdapter;
