const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const auth = await import('../src/services/auth.service.js?v=20261109-01');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { getDashboardResumo } = await import('../src/services/dashboard-resumo.service.js?v=20261109-01');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');

storage.resetAppData();
seedTestAdmin(storage, STORAGE_KEYS);

const now = new Date().toISOString();

storage.setItem(STORAGE_KEYS.transactions, [
  {
    id: 'sale-145',
    type: 'venda',
    status: 'ativa',
    items: [{ productId: 'produto-venda-avulsa', name: 'Venda teste', quantity: 1, total: 145 }],
    total: 145,
    paymentMethod: 'pix',
    createdAt: now
  },
  {
    id: 'entry-50',
    type: 'entrada',
    status: 'ativa',
    amount: 50,
    createdAt: now
  },
  {
    id: 'output-10',
    type: 'saida',
    status: 'ativa',
    amount: 10,
    createdAt: now
  }
]);

storage.setItem(STORAGE_KEYS.stockLaunches, [
  {
    id: 'stock-1',
    produtoId: 'x-burger',
    produtoNome: 'Teste',
    categoriaId: 'salgados',
    categoriaNome: 'Salgados',
    quantidade: 4,
    valorUnitario: 20,
    valorTotal: 80,
    dataHora: now,
    status: 'ativo'
  }
]);

// Vitrine estimada = saldo atual da vitrine x preco (5 X-Burger a R$ 16), inclusive o herdado.
storage.setItem(STORAGE_KEYS.productStock, [{ id: 'stock-x-burger', productId: 'x-burger', quantityAvailable: 5 }]);

const resumo = getDashboardResumo({ period: 'today' });

assert(resumo.totalVendido === 145, 'Total vendido should include only finished sales');
assert(resumo.entradas === 50, 'Entradas should include only manual cash entries');
assert(resumo.saidas === 10, 'Saídas should include manual cash outputs');
// Caixa atual = dinheiro da gaveta: a venda de R$ 145 foi em Pix e nao entra (0 + 50 - 10).
assert(resumo.caixaAtual === 40, 'Caixa atual should be cash in drawer (dinheiro + entradas - saidas)');
assert(resumo.vitrineEstimada === 80, 'Vitrine estimada should be current showcase value');

console.log('dashboard resumo service ok');
