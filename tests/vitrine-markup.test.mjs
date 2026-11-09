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

globalThis.window = { location: { href: '', pathname: '/' }, confirm: () => false, prompt: () => '' };
globalThis.document = { documentElement: { dataset: {} } };

// O envio do formulario le os campos com FormData; aqui o "formulario" e um objeto com campos.
const NativeFormData = globalThis.FormData;
globalThis.FormData = class FakeFormData extends NativeFormData {
  constructor(form) {
    super();
    Object.entries(form?.fields || {}).forEach(([name, value]) => this.set(name, value));
  }
};

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const products = await import('../src/services/product.service.js?v=20261109-01');
const showcase = await import('../src/services/showcase-stock.service.js?v=20261109-01');
const { mockProducts } = await import('../src/database/mock-data.js?v=20260804-06');
const { getCategoryColorVar } = await import('../src/utils/category-colors.js?v=20260807-21');
const { initEstoqueModule } = await import('../src/modules/estoque/estoque.module.js?v=20261109-01');

// Intl usa espaco nao separavel entre "R$" e o valor.
const plain = (markup) => String(markup).replace(/ /g, ' ');
const textOf = (markup) => plain(markup).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function createFakeContainer() {
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(type, handler) {
      (this.listeners[type] ||= []).push(handler);
    },
    querySelector() {
      return null;
    },
    dispatch(type, event) {
      return Promise.all((this.listeners[type] || []).map((handler) => handler(event)));
    }
  };
}

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();

// Categoria criada pelo usuario (fora das quatro) e um produto "perigoso" para o escape.
storage.setItem(schema.STORAGE_KEYS.categories, [
  ...products.getCategories(),
  { id: 'doces', name: 'Doces', showInShowcase: true }
]);
storage.setItem(schema.STORAGE_KEYS.products, [
  ...mockProducts.map((product) => ({ ...product })),
  { id: 'brigadeiro', name: 'Brigadeiro <b>', categoryId: 'doces', price: 5, cost: 2, stock: 0, active: true }
]);

const set = (productId, quantityAvailable) => showcase.adjustShowcaseStock({
  operationId: `vt-${productId}`,
  productId,
  quantityAvailable,
  userId: 'user-admin'
});
set('x-burger', 12);      // normal
set('x-salada', 2);       // poucas unidades
set('misto-quente', 1);   // uma unidade
set('suco-natural', 0);   // esgotado
set('brigadeiro', 5);     // categoria criada

const screen = createFakeContainer();
initEstoqueModule(screen);
await tick();
const html = plain(screen.innerHTML);
const text = textOf(screen.innerHTML);

// Cabecalho
assert(/<h1[^>]*>Vitrine<\/h1>/.test(html), 'titulo da tela e Vitrine');
assert(!html.includes('Lancar Estoque'), 'titulo antigo saiu');
assert(html.includes('ui-head') && html.includes('ui-screen') && html.includes('data-estoque-screen'), 'cabecalho em ui-head e marca data-estoque-screen mantida');
assert(text.includes('Registre o que foi produzido e enviado para a vitrine. Isso não mexe no caixa.'), 'frase do cabecalho com acentos');
assert(html.includes('ui-seg') && html.includes('aria-label="Período"'), 'periodo em ui-seg');
['today:Hoje', 'yesterday:Ontem', 'month:Este mês', 'year:Este ano', 'all:Todo período', 'custom:Personalizado'].forEach((pair) => {
  const [key, label] = pair.split(':');
  assert(html.includes(`data-stock-period="${key}">${label}<`), `botao de periodo ${label}`);
});
assert(/class="is-on"[^>]*data-stock-period="today"/.test(html) && !html.includes('<select class="ui-input vt-period"'), 'Hoje ativo e sem select de periodo');
assert(html.includes('>Este mês<') && html.includes('>Todo período<'), 'periodos com acentos');

// Primeira linha de numeros e segunda linha com o resto
assert((html.match(/class="ui-stats/g) || []).length === 2, 'duas linhas de ui-stats');
['Estoque atual', 'Vitrine estimada', 'Produzido hoje', 'Vendido hoje', 'Sobra estimada', 'Zerados'].forEach((label) => {
  assert(html.includes(`<small>${label}</small>`), `cartao ${label}`);
});
['Vendido sem estoque', 'Produtos diferentes', 'Vendido em comandas', 'Valor produzido'].forEach((label) => {
  assert(html.includes(`<small>${label}</small>`), `cartao ${label} na segunda linha`);
});
assert(!html.includes('Produtos zerados'), 'cartao Produtos zerados virou Zerados');
assert(/<small>Zerados<\/small>\s*<b[^>]*>\d+ produtos?<\/b>/.test(html), 'Zerados mostra a contagem de produtos');
assert(/<small>Estoque atual<\/small>\s*<b[^>]*>\d+ un\.<\/b>/.test(html), 'Estoque atual mostra unidades');

// Lista de estoque: faixa de cor, nome, categoria e quantidade ou etiqueta
assert(html.includes('Estoque da vitrine'), 'painel Estoque da vitrine');
assert(html.includes('ui-stripe'), 'linhas com ui-stripe');
const rowIn = (markup, name) => markup.split('<article class="vt-row').slice(1).find((row) => row.includes(`<b>${name}</b>`)) || '';
const categories = products.getCategories();
const colorOf = (categoryId) => getCategoryColorVar(categories.find((category) => category.id === categoryId), categories);
assert(rowIn(html, 'Suco Natural').includes('style="--c: var(--cat-bebidas)"'), 'faixa de Bebidas usa a cor da categoria');
assert(rowIn(html, 'X-Salada').includes('style="--c: var(--cat-lanches)"'), 'faixa de Lanches usa a cor da categoria');
assert(rowIn(html, 'Brigadeiro &lt;b&gt;').includes(`style="--c: ${colorOf('doces')}"`) && colorOf('doces').includes('--cat-extra-'), 'categoria criada recebe a cor extra estavel, calculada com a lista completa');
assert(/ui-pill ui-pill--danger[^>]*>Esgotado</.test(rowIn(html, 'Suco Natural')), 'estoque zero mostra a etiqueta Esgotado (danger)');
assert(/ui-pill ui-pill--warn[^>]*>2 restantes</.test(rowIn(html, 'X-Salada')), '2 unidades mostram "2 restantes" (warn)');
assert(/ui-pill ui-pill--warn[^>]*>1 restante</.test(rowIn(html, 'Misto Quente')), '1 unidade mostra "1 restante" no singular');
assert(rowIn(html, 'X-Burger').includes('12 un.') && !rowIn(html, 'X-Burger').includes('ui-pill'), 'estoque normal mostra "N un." sem etiqueta');
assert(rowIn(html, 'X-Burger').includes('Lanches'), 'linha mostra o nome da categoria');
assert(html.includes('Brigadeiro &lt;b&gt;') && !html.includes('Brigadeiro <b>'), 'nome do produto continua escapado');
assert(html.includes('data-clear-filter="category"') && html.includes('data-filter-check'), 'filtro de categoria continua com seus data-*');

assert(html.includes('>Todas as categorias<') && html.includes('>Todos os produtos<'), 'filtros com rotulos em portugues correto');

// Painel Novo lancamento
assert(text.includes('Novo lançamento'), 'painel Novo lançamento');
assert(html.includes('data-stock-form'), 'formulario mantem data-stock-form');
assert(/<select[^>]*class="ui-input[^"]*"[^>]*name="produtoId"|<select[^>]*name="produtoId"[^>]*class="ui-input/.test(html), 'select de produto mantem name=produtoId');
assert(html.includes('name="quantidade"') && html.includes('name="valorUnitario"'), 'campos quantidade e valorUnitario mantidos');
assert(html.includes('data-product-category-name') && text.includes('Categoria automática'), 'categoria automatica mantida');
assert(/ui-btn ui-btn--primary[^>]*type="submit"[^>]*>Lançar na vitrine</.test(html), 'botao principal Lançar na vitrine');
assert(!html.includes('Lancar no estoque'), 'texto antigo do botao saiu');

// Producao e vendas em barras
assert(text.includes('Produção e vendas hoje') && html.includes('ui-bars') && html.includes('ui-bar-row'), 'Produção e vendas hoje em ui-bars');
['Produzido', 'Vendido', 'Sobra'].forEach((label) => assert(html.includes(`<span>${label}</span>`), `barra ${label}`));

// Listas abaixo continuam, em tabela
assert(text.includes('Lançamentos'), 'secao de lançamentos do período');
assert(text.includes('Comparativo produção x vendas'), 'comparativo continua');
assert(html.includes('ui-table'), 'listas em ui-table');

// Estados vazios em frase normal
assert(text.includes('Nenhum lançamento no período.'), 'estado vazio dos lançamentos em frase normal');
assert(!html.includes('NENHUM LANCAMENTO') && !html.includes('SEM DADOS PARA COMPARAR') && !html.includes('SEM MOVIMENTACAO'), 'estados vazios antigos em caixa alta sairam');
assert(!/[A-ZÀ-Ú]{5,}/.test(text.replace(/R\$|PDV|CRM|PIX/g, '')), 'sem rotulos em CAIXA ALTA');

// Lancar na vitrine funciona com os mesmos campos
await screen.dispatch('submit', {
  preventDefault() {},
  target: { matches: (selector) => selector === '[data-stock-form]', fields: { produtoId: 'x-burger', quantidade: '3', valorUnitario: '16.00' } }
});
const afterLaunch = plain(screen.innerHTML);
assert(afterLaunch.includes('data-action="edit-launch"') && afterLaunch.includes('data-action="cancel-launch"'), 'lançamento criado aparece com Editar e Cancelar');
assert(rowIn(afterLaunch, 'X-Burger').includes('15 un.'), 'o saldo da vitrine subiu 3 unidades');

// Clicar em Ontem muda o periodo, marca o botao e mostra os vazios
await screen.dispatch('click', {
  target: {
    closest: (selector) => {
      if (selector === '[data-estoque-screen]') return {};
      if (selector === '[data-stock-period]') return { dataset: { stockPeriod: 'yesterday' } };
      return null;
    }
  }
});
const yesterday = plain(screen.innerHTML);
assert(/class="is-on"[^>]*data-stock-period="yesterday"/.test(yesterday) && !/class="is-on"[^>]*data-stock-period="today"/.test(yesterday), 'botao Ontem fica ativo (is-on) e Hoje deixa de ser');
assert(textOf(yesterday).includes('Nenhum lançamento no período.'), 'sem lançamentos ontem');
assert(textOf(yesterday).includes('Sem movimentação no período.'), 'sem movimentação ontem em frase normal');

// Personalizado mostra a linha de datas
await screen.dispatch('click', {
  target: {
    closest: (selector) => {
      if (selector === '[data-estoque-screen]') return {};
      if (selector === '[data-stock-period]') return { dataset: { stockPeriod: 'custom' } };
      return null;
    }
  }
});
assert(plain(screen.innerHTML).includes('data-custom-start') && /class="is-on"[^>]*data-stock-period="custom"/.test(plain(screen.innerHTML)), 'Personalizado ativo mostra as datas');

console.log('Vitrine markup test passed.');
