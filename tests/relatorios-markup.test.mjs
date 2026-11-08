import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const plain = (markup) => String(markup).replace(/\u00a0/g, ' ');
const { renderReportsMarkup, buildHourlySales, initRelatoriosModule } = await import('../src/modules/relatorios/relatorios.module.js?v=20260807-18');

const at = (hour, minute = 0) => new Date(2026, 10, 7, hour, minute).toISOString();
const base = {
  period: 'today',
  customStart: '',
  customEnd: '',
  summary: {
    salesTotal: 212, entriesTotal: 50, outputsTotal: 30, estimatedProfit: 232, ticketAverage: 35.33, closedComandas: 6,
    paymentTotals: { dinheiro: 96, pix: 30, debito: 14, credito: 72, outros: 0 }
  },
  products: {
    byQuantity: [
      { name: 'X-Burger', categoryId: 'lanches', quantity: 5, revenue: 80 },
      { name: '<img src=x onerror=alert(1)>', categoryId: 'combos', quantity: 2, revenue: 40 }
    ]
  },
  categories: [
    { categoryId: 'combos', name: 'Combos', quantity: 4, revenue: 120 },
    { categoryId: 'lanches', name: 'Lanches', quantity: 5, revenue: 54 },
    { categoryId: 'sushi', name: 'Sushi', quantity: 1, revenue: 24 }
  ],
  allCategories: [
    { id: 'lanches', name: 'Lanches' }, { id: 'combos', name: 'Combos' }, { id: 'sushi', name: 'Sushi' }
  ],
  movements: [
    { id: 'm1', type: 'venda', category: 'dinheiro', description: 'Comanda 1', amount: 58, createdAt: at(12, 10) },
    { id: 'm2', type: 'venda', category: 'pix', description: 'Comanda 2', amount: 26, createdAt: at(10, 5) },
    { id: 'm3', type: 'venda', category: 'pix', description: 'Comanda 3', amount: 18, createdAt: at(12, 50) },
    { id: 'm4', type: 'venda', category: 'credito', description: 'Comanda 4', amount: 44, createdAt: at(14, 0) },
    { id: 'm5', type: 'entrada', category: 'troco', description: 'Reforco', amount: 50, createdAt: at(9, 0) },
    { id: 'm6', type: 'saida', category: 'gelo', description: 'Gelo', amount: 30, createdAt: at(15, 0) }
  ]
};
const html = plain(renderReportsMarkup(base));

// Cabecalho e estrutura
assert.match(html, /<h1[^>]*>Relatórios<\/h1>/, 'titulo Relatórios');
assert.match(html, /class="[^"]*\bui-screen\b/, 'tela usa ui-screen');
assert.match(html, /class="[^"]*\bui-head\b/, 'cabecalho usa ui-head');
assert(html.includes('data-reports-screen'), 'gancho da tela');
assert(!/module-screen|summary-card|crm-panel|comparison-table|crm-grid|pdv-title/.test(html), 'sem marcacao antiga');
assert(!/Relatorios|Movimentacoes|Saidas|liquido|Ticket medio|Periodo\b|Debito|Credito/.test(html), 'textos acentuados');
assert(!/text-transform:\s*uppercase/.test(html), 'sem uppercase inline');
assert(!/Exportar/.test(html), 'sem Exportar: o modulo nao tem exportacao hoje');

// Periodo em seletor segmentado, mapeado nos periodos do modulo
const seg = html.match(/<div class="ui-seg"[^>]*>([\s\S]*?)<\/div>/);
assert(seg, 'periodo em ui-seg');
const segButtons = [...seg[1].matchAll(/<button[^>]*data-report-period="([a-z]+)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
assert.deepEqual(segButtons, [['today', 'Hoje'], ['yesterday', 'Ontem'], ['week', '7 dias'], ['month', 'Mês'], ['custom', 'Período']], 'periodos');
const onButtons = [...seg[1].matchAll(/<button[^>]*>/g)].map((m) => m[0]).filter((tag) => /\bis-on\b/.test(tag));
assert.equal(onButtons.length, 1, 'um periodo ativo');
assert(onButtons[0].includes('data-report-period="today"'), 'Hoje ativo');
assert(!html.includes('data-report-start'), 'datas so no periodo personalizado');
const custom = plain(renderReportsMarkup({ ...base, period: 'custom', customStart: '2026-11-01', customEnd: '2026-11-07' }));
assert(/data-report-start[^>]*value="2026-11-01"|value="2026-11-01"[^>]*data-report-start/.test(custom), 'data inicial');
assert(/data-report-end[^>]*value="2026-11-07"|value="2026-11-07"[^>]*data-report-end/.test(custom), 'data final');

// Cartoes
assert(html.includes('ui-stats') && html.includes('ui-stat'), 'numeros em ui-stats');
['Total vendido', 'Entradas', 'Saídas', 'Caixa líquido', 'Ticket médio', 'Comandas fechadas'].forEach((label) => assert(html.includes(`>${label}<`), `cartao ${label}`));
assert(html.includes('R$ 212,00') && html.includes('R$ 232,00') && html.includes('R$ 35,33'), 'valores dos cartoes');

// Vendas por hora: barras CSS com o maior valor em --accent
assert(html.includes('Vendas por hora'), 'grafico por hora');
const peaks = html.match(/class="[^"]*\brp-bar\b[^"]*\bis-peak\b[^"]*"/g) || [];
assert.equal(peaks.length, 1, 'uma unica barra de pico');
const hourly = buildHourlySales(base.movements);
assert.deepEqual(hourly.map((h) => h.hour), [10, 11, 12, 13, 14], 'faixa de horas das vendas, sem entradas e saidas');
assert.deepEqual(hourly.map((h) => h.total), [26, 0, 76, 0, 44], 'soma das vendas por hora');
assert(html.includes('>12h<') && html.includes('>10h<'), 'rotulos de hora');
assert(/class="rp-bar is-peak"[^>]*style="[^"]*height:\s*100%/.test(html), 'pico com altura maxima');
assert.deepEqual(buildHourlySales([{ type: 'entrada', amount: 5, createdAt: at(9) }]), [], 'sem vendas, sem barras');
const noSales = plain(renderReportsMarkup({ ...base, movements: [] }));
assert(noSales.includes('Nenhuma venda no período.'), 'estado vazio do grafico');

// Formas de pagamento e categorias em barras
assert(html.includes('ui-bars') && html.includes('ui-bar-row'), 'barras');
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert(start > -1, `marcador ausente: ${from}`);
  const end = source.indexOf(to, start + from.length);
  return source.slice(start, end > -1 ? end : undefined);
};
const payments = between(html, 'Formas de pagamento', 'Por categoria');
['Dinheiro', 'Crédito', 'Pix', 'Débito'].forEach((label) => assert(payments.includes(`>${label}<`), `pagamento ${label}`));
assert(!payments.includes('>Outros<'), 'forma sem valor nao vira barra');
assert(payments.includes('R$ 96,00'), 'valor de dinheiro');
assert(payments.indexOf('Dinheiro') < payments.indexOf('Crédito') && payments.indexOf('Crédito') < payments.indexOf('Pix'), 'maior primeiro');
assert(/--c:\s*var\(--ink\)/.test(payments), 'pagamento em --ink');
const catSection = between(html, 'Por categoria', 'Produtos mais vendidos');
assert(/--c:\s*var\(--cat-combos\)/.test(catSection), 'Combos na cor da categoria');
assert(/--c:\s*var\(--cat-lanches\)/.test(catSection), 'Lanches na cor da categoria');
assert(/--c:\s*var\(--cat-extra-\d\)/.test(catSection), 'categoria criada pelo usuario recebe cor extra');
assert(/width:\s*100%/.test(catSection), 'maior categoria com barra cheia');

// Tabelas
assert(html.includes('ui-table'), 'tabelas em ui-table');
const products = between(html, 'Produtos mais vendidos', 'Movimentações recentes');
['Produto', 'Qtd', 'Faturamento', 'X-Burger'].forEach((text) => assert(products.includes(text), `produtos ${text}`));
assert(/--c:\s*var\(--cat-lanches\)/.test(products), 'faixa da categoria no produto');
assert(!html.includes('<img src=x'), 'nomes escapados');
assert(html.includes('&lt;img src=x'), 'nome escapado visivel');
const moves = html.slice(html.indexOf('Movimentações recentes'));
['Movimento', 'Categoria', 'Valor', 'Comanda 1', 'Gelo'].forEach((text) => assert(moves.includes(text), `movimentos ${text}`));
const twenty = Array.from({ length: 30 }, (_, i) => ({ id: `x${i}`, type: 'venda', category: 'pix', description: `Venda ${i}`, amount: 1, createdAt: at(10) }));
const limited = plain(renderReportsMarkup({ ...base, movements: twenty }));
assert(limited.includes('Venda 19<') && !limited.includes('Venda 20<'), 'movimentacoes limitadas a 20');

// Sem dados
const empty = plain(renderReportsMarkup({
  ...base,
  summary: { ...base.summary, salesTotal: 0, paymentTotals: {} },
  products: { byQuantity: [] }, categories: [], movements: []
}));
assert(empty.includes('Nenhum dado no período selecionado.'), 'estado vazio');

// Interacao: o periodo troca por clique no seletor segmentado
const handlers = {};
const container = {
  innerHTML: '',
  addEventListener: (event, handler) => { handlers[event] = handler; },
  querySelector: () => null
};
initRelatoriosModule(container);
assert(container.innerHTML.includes('data-reports-screen'), 'modulo renderiza');
const screen = {};
const clickPeriod = (value) => handlers.click({
  target: { closest: (selector) => (selector === '[data-report-period]' ? { dataset: { reportPeriod: value } } : selector === '[data-reports-screen]' ? screen : null) }
});
clickPeriod('week');
const weekTag = [...container.innerHTML.matchAll(/<button[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes('data-report-period="week"'));
assert(/\bis-on\b/.test(weekTag), '7 dias ativo apos clique');
clickPeriod('custom');
assert(container.innerHTML.includes('data-report-start'), 'Período mostra as datas');
handlers.change({ target: { closest: (selector) => (selector === '[data-reports-screen]' ? screen : null), matches: (selector) => selector === '[data-report-start]', value: '2026-11-02' } });
assert(container.innerHTML.includes('value="2026-11-02"'), 'data inicial aplicada');

console.log('relatorios markup ok');
