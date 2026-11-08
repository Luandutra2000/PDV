import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs');
const { initDespesasModule, renderFinanceiroMarkup } = await import('../src/modules/despesas/despesas.module.js?v=20260807-17');
const { getLocalDateKey } = await import('../src/services/financial.service.js?v=20260804-06');

seedTestAdmin(storage, STORAGE_KEYS);

const categories = [
  { id: 'vendas', name: 'Vendas', type: 'income' },
  { id: 'energia', name: 'Energia', type: 'expense' },
  { id: 'aluguel', name: 'Aluguel', type: 'expense' },
  { id: 'agua', name: 'Água', type: 'expense' }
];
const overdueBill = { id: 'fin-energia', type: 'expense', description: 'Energia elétrica', amount: 312.4, categoryId: 'energia', status: 'overdue', paymentMethod: 'boleto', transactionDate: '2026-11-01', dueDate: '2026-11-05', notes: 'Conta de novembro' };
const pendingBill = { id: 'fin-aluguel', type: 'expense', description: 'Aluguel do ponto', amount: 1800, categoryId: 'aluguel', status: 'pending', paymentMethod: 'boleto', transactionDate: '2026-11-01', dueDate: '2026-11-10' };
const income = { id: 'fin-venda', type: 'income', description: 'Venda do dia', amount: 212, categoryId: 'vendas', status: 'paid', paymentMethod: 'dinheiro', transactionDate: '2026-11-07' };
const expense = { id: 'fin-gelo', type: 'expense', description: 'Compra de gelo', amount: 30, categoryId: 'agua', status: 'paid', paymentMethod: 'dinheiro', transactionDate: '2026-11-07' };

const baseState = {
  summary: { entriesTotal: 212, outputsTotal: 30, balance: 182, payablesCount: 2, paidBillsCount: 0, overdueCount: 1 },
  categories,
  transactions: [income, expense, overdueBill, pendingBill],
  // O servico devolve as pendentes antes das vencidas; a tela precisa inverter.
  payables: { pending: [pendingBill], overdue: [overdueBill], upcoming: [pendingBill] },
  crm: {
    outputsByCategory: { energia: 312.4, aluguel: 1800 },
    entriesByCategory: { vendas: 212 },
    spendingByPaymentMethod: { boleto: 2112.4, dinheiro: 30 },
    pendingByCategory: { aluguel: 1800, energia: 312.4 }
  }
};

const html = renderFinanceiroMarkup(baseState);
const tags = (source, pattern) => [...source.matchAll(/<[a-z0-9]+\s[^>]*>/gi)].map((m) => m[0]).filter((tag) => pattern.test(tag));
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert(start > -1, `marcador ausente: ${from}`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end > -1 ? end : undefined);
};

// Cabecalho e estrutura
assert(/<h1[^>]*>Financeiro<\/h1>/.test(html), 'titulo Financeiro');
assert(html.includes('ui-screen'), 'tela usa ui-screen');
assert(html.includes('ui-head'), 'cabecalho usa ui-head');
assert(html.includes('Entradas, saídas, boletos e contas a pagar.'), 'frase do cabecalho');
assert(html.includes('ui-stats') && html.includes('ui-stat'), 'numeros em ui-stats');
assert(html.includes('ui-table'), 'tabela usa ui-table');
assert(html.includes('ui-panel'), 'paineis usam ui-panel');
assert(html.includes('ui-bars') && html.includes('ui-bar-row'), 'mini CRM em ui-bars');
assert(!html.includes('module-screen') && !html.includes('manager-section') && !html.includes('summary-card'), 'sem marcacao antiga');

// Sem caixa alta: nada de SUPABASE nem de cabecalhos de tabela em maiusculas
assert(!/SUPABASE/.test(html), 'sem etiqueta SUPABASE');
assert(!/>\s*(DATA|DESCRI[CÇ][AÃ]O|TIPO|CATEGORIA|VALOR|STATUS)\s*</.test(html), 'sem cabecalhos em caixa alta');
assert(!/text-transform:\s*uppercase/.test(html), 'sem uppercase inline');

// Textos visiveis com acento
['Saídas', 'Movimentações', 'Descrição', 'Contas a pagar', 'Saídas por categoria', 'Entradas por categoria'].forEach((text) => {
  assert(html.includes(text), `texto ${text}`);
});
assert(!/Saidas|Movimentacoes|Descricao|Observacao/.test(html), 'sem textos sem acento');

// Acoes do cabecalho
assert(/<button class="ui-btn" type="button" data-finance-action="open-income">\+ Entrada<\/button>/.test(html), '+ Entrada ui-btn');
assert(/<button class="ui-btn ui-btn--loss" type="button" data-finance-action="open-expense">− Saída<\/button>/.test(html), '− Saída ui-btn--loss');
assert(/<button class="ui-btn ui-btn--primary" type="button" data-finance-action="open-bill">\+ Boleto<\/button>/.test(html), '+ Boleto ui-btn--primary');

// Filtro segmentado Todos / Entradas / Saidas / Boletos, mapeado em type + historyKind
const seg = between(html, 'data-finance-kinds', '</div>');
['Todos', 'Entradas', 'Saídas', 'Boletos'].forEach((label) => assert(seg.includes(`>${label}</button>`), `seg ${label}`));
['all', 'income', 'expense', 'bill'].forEach((kind) => assert(seg.includes(`data-finance-kind="${kind}"`), `seg hook ${kind}`));
assert(tags(seg, /data-finance-kind="all"/)[0].includes('is-on'), 'Todos ativo por padrao');
assert(html.includes('data-finance-period="today"') && html.includes('data-finance-period="custom"'), 'periodos continuam');
assert(html.includes('data-finance-filter="categoryId"') && html.includes('data-finance-filter="status"'), 'categoria e status continuam');

// Tabela: colunas
const thead = between(html, '<thead>', '</thead>');
['Data', 'Descrição', 'Tipo', 'Categoria', 'Valor', 'Status'].forEach((label) => assert(thead.includes(`>${label}<`), `coluna ${label}`));

// Valor com sinal e cor
const incomeRow = between(html, 'data-finance-row="fin-venda"', '</tr>');
assert(/<b class="fn-amount is-plus">\+ R\$/.test(incomeRow), 'entrada com + e classe verde');
assert(incomeRow.includes('ui-pill--ok') && incomeRow.includes('>Pago<'), 'entrada paga em ui-pill--ok');
const expenseRow = between(html, 'data-finance-row="fin-gelo"', '</tr>');
assert(/<b class="fn-amount is-minus">− R\$/.test(expenseRow), 'saida com sinal de menos');
assert(!expenseRow.includes('is-plus'), 'saida nao e verde');

// Status em etiqueta
const overdueRow = between(html, 'data-finance-row="fin-energia"', '</tr>');
assert(/<span class="ui-pill ui-pill--danger">Vencida<\/span>/.test(overdueRow), 'vencida em ui-pill--danger');
const pendingRow = between(html, 'data-finance-row="fin-aluguel"', '</tr>');
assert(/<span class="ui-pill ui-pill--warn">Pendente<\/span>/.test(pendingRow), 'pendente em ui-pill--warn');
assert(overdueRow.includes('>Boleto<'), 'tipo Boleto');
assert(incomeRow.includes('>Entrada<') && expenseRow.includes('>Saída<'), 'tipos Entrada e Saída');

// Acoes da linha continuam
assert(overdueRow.includes('data-finance-action="toggle-info"') && overdueRow.includes('data-payable-id="fin-energia"'), 'Mais info e Pagar');
assert(incomeRow.includes('data-finance-action="edit"') && incomeRow.includes('data-transaction-id="fin-venda"'), 'Editar');

// Contas a pagar: vencidas primeiro, ponto vermelho; depois pendentes, ponto ambar
const payablesPanel = between(html, 'data-finance-payables', 'data-finance-outputs');
const overdueAt = payablesPanel.indexOf('Energia elétrica');
const pendingAt = payablesPanel.indexOf('Aluguel do ponto');
assert(overdueAt > -1 && pendingAt > -1 && overdueAt < pendingAt, 'vencida aparece antes da pendente');
assert(payablesPanel.match(/Aluguel do ponto<\/b>/g).length === 1, 'sem duplicar a conta');
assert(payablesPanel.includes('fn-dot is-overdue') && payablesPanel.includes('fn-dot is-pending'), 'pontos vermelho e ambar');
assert(payablesPanel.includes('Venceu em 05/11/2026') && payablesPanel.includes('Vence em 10/11/2026'), 'texto de vencimento');
assert(payablesPanel.includes('data-payable-id="fin-energia"') && payablesPanel.includes('Marcar pago'), 'Marcar pago continua');

// Saidas por categoria em barras vermelhas
const outputs = between(html, 'data-finance-outputs', 'data-finance-crm');
assert(outputs.includes('ui-bars') && outputs.includes('--c:var(--red)'), 'saidas por categoria em barras vermelhas');
assert(outputs.includes('Aluguel') && outputs.includes('Energia') && outputs.indexOf('Aluguel') < outputs.indexOf('Energia'), 'maior primeiro');

// Resto do mini CRM
const crm = html.slice(html.indexOf('data-finance-crm'));
['Mini CRM financeiro', 'Entradas por categoria', 'Total pendente por categoria', 'Gastos por forma de pagamento'].forEach((label) => assert(crm.includes(label), label));
assert(crm.includes('ui-bars') && crm.includes('--c:var(--green)'), 'entradas em verde');
assert(crm.includes('>Boleto<') && crm.includes('>Dinheiro<'), 'formas de pagamento legiveis');

// Numeros de hoje
['Entradas', 'Saídas', 'Saldo', 'Contas a pagar', 'Contas pagas', 'Vencidas'].forEach((label) => assert(html.includes(`<small>${label}</small>`), `numero ${label}`));
assert(tags(html, /class="ui-stat is-minus"/).length >= 2, 'saidas e vencidas em vermelho');

// Filtro por tipo: Boletos mostra so boletos; Entradas so entradas
const billsOnly = renderFinanceiroMarkup({ ...baseState, filters: { type: 'all', historyKind: 'bill' } });
assert(billsOnly.includes('data-finance-row="fin-energia"') && !billsOnly.includes('data-finance-row="fin-venda"'), 'Boletos filtra');
assert(tags(billsOnly, /data-finance-kind="bill"/)[0].includes('is-on'), 'Boletos ativo');
const incomeOnly = renderFinanceiroMarkup({ ...baseState, filters: { type: 'income', historyKind: 'all' } });
assert(incomeOnly.includes('data-finance-row="fin-venda"') && !incomeOnly.includes('data-finance-row="fin-gelo"'), 'Entradas filtra');
assert(tags(incomeOnly, /data-finance-kind="income"/)[0].includes('is-on'), 'Entradas ativo');

// Estado vazio
const emptyHtml = renderFinanceiroMarkup({
  ...baseState,
  transactions: [],
  payables: { pending: [], overdue: [], upcoming: [] },
  crm: { outputsByCategory: {}, entriesByCategory: {}, spendingByPaymentMethod: {}, pendingByCategory: {} }
});
assert(emptyHtml.includes('Nenhuma movimentação financeira encontrada.'));
assert(emptyHtml.includes('Nenhuma conta a pagar.'));

// Janelas de lancamento: moldura .modal-backdrop, campos e acoes com acento
const modalHtml = renderFinanceiroMarkup({ ...baseState, modal: { type: 'income' } });
assert(modalHtml.includes('modal-backdrop is-open') && modalHtml.includes('data-finance-form'));
assert(modalHtml.includes('Registrar entrada') && modalHtml.includes('Descrição obrigatória') && modalHtml.includes('Salvar entrada no caixa'));
const billModal = renderFinanceiroMarkup({ ...baseState, modal: { type: 'bill' } });
assert(billModal.includes('Observação') && billModal.includes('Salvar conta a pagar'));

// Permissoes: quem nao tem permissao financeira nao ve lancamento nem Pagar
setTestUserSession(storage, STORAGE_KEYS, { id: 'u-op', name: 'Marina', username: 'marina', role: 'operador', active: true });
const operatorHtml = renderFinanceiroMarkup(baseState);
assert(!operatorHtml.includes('data-finance-action="open-income"') && !operatorHtml.includes('data-finance-action="open-bill"'), 'operador sem + Entrada e + Boleto');
assert(!operatorHtml.includes('data-payable-id'), 'operador sem Pagar');

// Criar uma entrada pela janela existente continua funcionando
store.clear();
seedTestAdmin(storage, STORAGE_KEYS);
const today = getLocalDateKey();
storage.setItem('pdv.financialTransactions', [
  { id: 'fin-antiga', type: 'expense', description: 'Compra de gelo', amount: 30, categoryId: 'compra-materiais', status: 'paid', paymentMethod: 'dinheiro', transactionDate: today }
]);

const listeners = {};
const container = {
  innerHTML: '',
  addEventListener(type, handler) {
    listeners[type] = listeners[type] || [];
    listeners[type].push(handler);
  }
};
initDespesasModule(container);
assert(container.innerHTML.includes('Compra de gelo'));
assert(!container.innerHTML.includes('data-finance-form'));

const clickOn = (selector, dataset) => listeners.click[0]({
  target: { closest: (query) => (query === selector ? { dataset } : null) }
});

clickOn('[data-finance-action]', { financeAction: 'open-income' });
assert(container.innerHTML.includes('data-finance-form'), 'janela de entrada abre');
assert(container.innerHTML.includes('name="formType" value="income"'));

const originalFormData = globalThis.FormData;
globalThis.FormData = class TestFormData {
  get(name) {
    return { formType: 'income', description: 'Reforço de troco', amount: '80', categoryId: 'reforco-caixa', transactionDate: today, dueDate: '', notes: '', movesCashSession: '' }[name];
  }
};
listeners.submit[0]({ preventDefault() {}, target: { matches: (selector) => selector === '[data-finance-form]' } });
globalThis.FormData = originalFormData;

const saved = JSON.parse(localStorage.getItem('pdv.financialTransactions'));
const created = saved.find((item) => item.description === 'Reforço de troco');
assert(created && created.type === 'income' && created.amount === 80 && created.status === 'paid', 'entrada salva');
assert(!container.innerHTML.includes('data-finance-form'), 'janela fecha depois de salvar');
assert(container.innerHTML.includes('Reforço de troco'), 'entrada aparece na tabela');
assert(/<b class="fn-amount is-plus">\+ R\$/.test(container.innerHTML), 'entrada aparece com + verde');

// O filtro segmentado muda o estado: Saidas esconde a entrada
clickOn('[data-finance-kind]', { financeKind: 'expense' });
assert(container.innerHTML.includes('Compra de gelo') && !container.innerHTML.includes('Reforço de troco'), 'Saídas esconde entradas');
clickOn('[data-finance-kind]', { financeKind: 'all' });
assert(container.innerHTML.includes('Reforço de troco'), 'Todos mostra tudo');

console.log('financeiro markup ok');
