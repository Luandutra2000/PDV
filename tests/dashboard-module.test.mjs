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

let confirmAnswer = false;
const confirmMessages = [];
globalThis.window = {
  location: {
    href: '',
    pathname: '/'
  },
  confirm(message) {
    confirmMessages.push(message);
    return confirmAnswer;
  },
  prompt() {
    return '';
  }
};

globalThis.document = {
  documentElement: {
    dataset: {}
  }
};

// O envio do modal le o formulario com FormData; aqui o "formulario" e um objeto com campos.
const NativeFormData = globalThis.FormData;
globalThis.FormData = class FakeFormData extends NativeFormData {
  constructor(form) {
    super();
    Object.entries(form?.fields || {}).forEach(([name, value]) => this.set(name, value));
  }
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20260804-06');
const transactions = await import('../src/services/transaction.service.js?v=20260804-06');
const { formatHistoryItemQuantity, initDashboardModule } = await import('../src/modules/dashboard/dashboard.module.js?v=20260804-06');

assert(formatHistoryItemQuantity({ quantity: 2 }) === '2x', 'history should show the purchased quantity when item quantity is greater than one');
assert(formatHistoryItemQuantity({ quantity: 1 }) === '1x', 'history should show one unit for single items');
assert(formatHistoryItemQuantity({}) === '1x', 'history should fall back to one unit when quantity is missing');

// ---------- Tela inteira (visual B claro) ----------
const plain = (markup) => String(markup).replace(/ /g, ' ');

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

function clickOn(container, matches) {
  return container.dispatch('click', {
    target: {
      closest(selector) {
        if (selector === '[data-dashboard-screen]') return {};
        return matches[selector] || null;
      }
    }
  });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();
cashSession.openCashSession({ openingAmount: 100 });

const today = new Date();
const at = (hours, minutes) => new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes).toISOString();
storage.setItem(schema.STORAGE_KEYS.transactions, [
  { id: 'sale-1', type: 'venda', status: 'ativa', paymentMethod: 'dinheiro', total: 40, items: [], comandaNumber: 7, createdAt: at(10, 5) },
  { id: 'sale-2', type: 'venda', status: 'ativa', paymentMethod: 'pix', total: 30, items: [], comandaNumber: 8, createdAt: at(11, 20) },
  { id: 'sale-3', type: 'venda', status: 'ativa', paymentMethod: 'debito', total: 14, items: [], comandaNumber: 9, createdAt: at(12, 0) },
  { id: 'sale-4', type: 'venda', status: 'ativa', paymentMethod: 'credito', total: 72, items: [], comandaNumber: 10, createdAt: at(12, 30) },
  { id: 'in-1', type: 'entrada', status: 'ativa', amount: 50, description: 'Reforco de caixa', createdAt: at(12, 10) },
  { id: 'out-1', type: 'saida', status: 'ativa', amount: 30, description: 'Compra de gelo', createdAt: at(16, 25) },
  { id: 'loss-1', type: 'perda', status: 'ativa', amount: 0, description: 'Perda: 2 X-Salada', createdAt: at(17, 5) }
]);
storage.setItem(schema.STORAGE_KEYS.closedComandas, [
  { id: 'c-7', number: 7, status: 'finalizada', closedAt: at(10, 5), paymentMethod: 'dinheiro', total: 40, change: 10, items: [{ name: 'X-Salada <b>', quantity: 2, total: 40 }] },
  { id: 'c-8', number: 8, status: 'finalizada', closedAt: at(11, 20), paymentMethod: 'pix', total: 30, change: 0, items: [{ name: 'Suco', quantity: 1, total: 30 }] },
  { id: 'c-14', number: 14, status: 'cancelada', closedAt: at(13, 0), paymentMethod: 'credito', total: 18, change: 0, items: [{ name: 'Pastel', quantity: 1, total: 18 }] }
]);

const screen = createFakeContainer();
initDashboardModule(screen);
const html = plain(screen.innerHTML);
const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// Cabecalho, periodo e estrutura
assert(/<h1[^>]*>Histórico de transações<\/h1>/.test(html), 'titulo da tela e Histórico de transações');
assert(!/Historico de Transacoes/i.test(html.replace(/Histórico de transações/g, '')), 'titulo antigo saiu');
assert(html.includes('ui-head') && html.includes('ui-screen') && html.includes('data-dashboard-screen'), 'cabecalho em ui-head e marca data-dashboard-screen mantida');
assert(html.includes('ui-seg'), 'periodos em ui-seg');
['Hoje', 'Ontem', 'Este mês', 'Este ano', 'Todo período'].forEach((label) => {
  assert(html.includes(`>${label}<`), `periodo ${label}`);
});
assert(/class="is-on"[^>]*data-dashboard-period="today"|data-dashboard-period="today"[^>]*class="is-on"/.test(html), 'periodo Hoje ativo');

// Cartoes: so Dinheiro, Pix, Debito, Credito e Comandas canceladas
assert(html.includes('ui-stats'), 'cartoes usam ui-stats');
['Dinheiro', 'Pix', 'Débito', 'Crédito', 'Comandas canceladas'].forEach((label) => {
  assert(html.includes(`<small>${label}</small>`), `cartao ${label}`);
});
['Caixa atual', 'Vitrine estimada', 'Total vendido'].forEach((label) => {
  assert(!html.includes(label), `cartao ${label} ja esta na barra do topo`);
});
assert(/<small>Comandas canceladas<\/small>\s*<b[^>]*>1<\/b>/.test(html), 'Comandas canceladas mostra a contagem');
assert(text.includes('Comanda 0014, R$ 18,00'), 'detalhe do cancelamento mostra a comanda e o valor');
assert(/<small>Crédito<\/small>\s*<b[^>]*>R\$ 72,00<\/b>/.test(html), 'valores dos cartoes vem do resumo');

// Tabela de comandas
assert(html.includes('ui-table'), 'comandas em ui-table');
['Hora', 'Comanda', 'Itens', 'Pagamento', 'Valor', 'Status'].forEach((label) => {
  assert(html.includes(`>${label}<`), `coluna ${label}`);
});
assert(/ui-pill ui-pill--ok[^>]*>Finalizada</.test(html), 'comanda finalizada com etiqueta ui-pill--ok');
assert(/ui-pill ui-pill--danger[^>]*>Cancelada</.test(html), 'comanda cancelada com etiqueta ui-pill--danger');
assert(html.includes('X-Salada &lt;b&gt;') && !html.includes('X-Salada <b>'), 'nome do item continua escapado');
assert(html.includes('2x'), 'itens mostram a quantidade');
assert(html.includes('data-action="cancel-comanda"') && html.includes('data-comanda-id="c-7"'), 'cancelar comanda continua');
assert(/data-comanda-id="c-14"[^>]*disabled/.test(html), 'comanda ja cancelada nao cancela de novo');

// Movimento do dinheiro: ponto colorido por tipo
assert(text.includes('Movimento do dinheiro'), 'painel Movimento do dinheiro');
assert(/hs-dot hs-dot--in/.test(html), 'entrada com ponto verde');
assert(/hs-dot hs-dot--out/.test(html), 'saida com ponto vermelho');
assert(/hs-dot hs-dot--loss/.test(html), 'perda com ponto ambar');
assert(html.includes('data-action="cancel-transaction"') && html.includes('data-transaction-id="in-1"'), 'cancelar movimento continua');

// Limpar historico: botao fantasma
assert(/ui-btn ui-btn--ghost[^>]*data-action="clear-history"[^>]*>Limpar histórico</.test(html), 'Limpar histórico e ui-btn--ghost');

// Botoes de caixa via componente compartilhado: Entrada e Saida, sem Perda / Consumo
assert(html.includes('data-action="open-entry"') && html.includes('data-action="open-output"'), 'botoes + Entrada e − Saída');
assert(!html.includes('open-write-off') && !html.includes('Perda / Consumo'), 'sem Perda / Consumo nesta tela');

// Sem rotulos em CAIXA ALTA
assert(!html.includes('NENHUMA COMANDA FINALIZADA') && !html.includes('NENHUM MOVIMENTO REGISTRADO'), 'estados vazios antigos em caixa alta saíram');
assert(!/[A-ZÀ-Ú]{5,}/.test(text.replace(/R\$|PDV|CRM|PIX/g, '')), 'sem rotulos em CAIXA ALTA');

// Periodo: trocar para Ontem mostra os estados vazios em frase normal
await clickOn(screen, { '[data-dashboard-period]': { dataset: { dashboardPeriod: 'yesterday' } } });
const yesterdayHtml = plain(screen.innerHTML);
assert(/data-dashboard-period="yesterday"/.test(yesterdayHtml) && /class="is-on"[^>]*data-dashboard-period="yesterday"|data-dashboard-period="yesterday"[^>]*class="is-on"/.test(yesterdayHtml), 'periodo Ontem fica ativo');
assert(yesterdayHtml.includes('Nenhuma comanda finalizada'), 'estado vazio das comandas em frase normal');
assert(yesterdayHtml.includes('Nenhum movimento registrado'), 'estado vazio do movimento em frase normal');
await clickOn(screen, { '[data-dashboard-period]': { dataset: { dashboardPeriod: 'today' } } });

// Limpar historico pede confirmacao e nao apaga se recusar
confirmAnswer = false;
await clickOn(screen, { '[data-action]': { dataset: { action: 'clear-history' } } });
assert(confirmMessages.length === 1 && confirmMessages[0].includes('hoje'), 'Limpar histórico pergunta antes, citando o periodo');
assert(transactions.getTransactions().length === 7, 'recusar a confirmacao nao apaga nada');

// + Entrada abre o modal compartilhado, e salvar registra e fecha
await clickOn(screen, { '[data-action]': { dataset: { action: 'open-entry' } } });
assert(screen.innerHTML.includes('Registrar entrada') && screen.innerHTML.includes('data-cash-form'), '+ Entrada abre o modal compartilhado (Registrar entrada)');
assert(screen.innerHTML.includes('name="category"') && screen.innerHTML.includes('Descrição obrigatória'), 'modal compartilhado tem categoria e descricao obrigatoria');
await clickOn(screen, { '[data-action]': { dataset: { action: 'close-modal' } } });
assert(!screen.innerHTML.includes('data-cash-form'), 'close-modal fecha o modal');
await clickOn(screen, { '[data-action]': { dataset: { action: 'open-output' } } });
assert(screen.innerHTML.includes('Registrar saída'), '− Saída abre o modal compartilhado (Registrar saída)');
await clickOn(screen, { '[data-action]': { dataset: { action: 'close-modal' } } });

await clickOn(screen, { '[data-action]': { dataset: { action: 'open-entry' } } });
const submitEvent = (fields) => ({
  preventDefault() {},
  target: {
    fields,
    closest: () => ({}),
    matches: (selector) => selector === '[data-cash-form]'
  }
});
await screen.dispatch('submit', submitEvent({ type: 'entrada', amount: '25', category: 'Outros', description: '' }));
await tick();
assert(screen.innerHTML.includes('data-cash-form'), 'descricao vazia mantem o modal aberto');
await screen.dispatch('submit', submitEvent({ type: 'entrada', amount: '25', category: 'Outros', description: 'Troco extra' }));
await tick();
assert(!screen.innerHTML.includes('data-cash-form'), 'entrada salva fecha o modal');
assert(transactions.getTransactions().some((item) => item.type === 'entrada' && item.description === 'Troco extra' && item.amount === 25), 'entrada foi registrada');
assert(plain(screen.innerHTML).includes('Troco extra'), 'movimento novo aparece na lista');

console.log('dashboard module ok');
