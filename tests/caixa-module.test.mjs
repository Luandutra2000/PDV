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
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20261109-01');
const eventBus = await import('../src/services/event-bus.service.js?v=20260804-06');
const { UI_EVENTS } = schema;
const { buildCrmClosingInput, buildDifferences, initCaixaModule } = await import('../src/modules/caixa/caixa.module.js?v=20261109-01');

const differences = buildDifferences({
  payments: {
    cashDifference: 0,
    pixDifference: -2,
    debitDifference: 3,
    creditDifference: 4
  },
  showcase: []
});

assert(differences.some((difference) => difference.key === 'payment:pix' && difference.amount === -2), 'pix difference should require a reason when checked and non-zero');
assert(differences.some((difference) => difference.key === 'payment:debito' && difference.amount === 3), 'debit difference should require a reason when checked and non-zero');
assert(differences.some((difference) => difference.key === 'payment:credito' && difference.amount === 4), 'credit difference should require a reason when checked and non-zero');

const uncheckedDifferences = buildDifferences({
  payments: {
    cashDifference: 0,
    pixDifference: null,
    debitDifference: 0,
    creditDifference: null
  },
  showcase: []
});

assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'pix'), 'unchecked pix should not require a reason');
assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'debito'), 'zero debit difference should not require a reason');
assert(!uncheckedDifferences.some((difference) => difference.referenceId === 'credito'), 'unchecked credit should not require a reason');

const closingInput = buildCrmClosingInput({
  entriesTotal: 10.01,
  outputsTotal: 469.21,
  paymentTotals: {
    dinheiro: 7.35,
    pix: 42.35,
    debito: 130.35,
    credito: 65.35
  }
}, { countedCash: '-451.85' });

assert(closingInput.expectedCash === -451.85, 'CRM closing should use the same cash total displayed by the report');
assert(closingInput.expectedPix === 42.35, 'CRM closing should use the displayed Pix total');

// ---------- Tela inteira (visual B claro) ----------
// Intl usa espaco nao separavel entre "R$" e o valor.
const plain = (markup) => String(markup).replace(/ /g, ' ');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();

function createFakeContainer() {
  const parts = new Map();
  return {
    innerHTML: '',
    listeners: {},
    addEventListener(type, handler) {
      (this.listeners[type] ||= []).push(handler);
    },
    querySelector(selector) {
      if (!parts.has(selector)) {
        parts.set(selector, { textContent: '', className: '' });
      }
      return parts.get(selector);
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((handler) => handler(event));
    }
  };
}

function clickOn(container, matches) {
  container.dispatch('click', {
    target: {
      closest(selector) {
        if (selector === '[data-caixa-screen]') return {};
        return matches[selector] || null;
      }
    }
  });
}

const admin = { id: 'user-admin', name: 'Administrador', username: 'admin', role: 'admin', active: true };
const operador = { id: 'user-operador', name: 'Operador', username: 'operador', role: 'operador', active: true };

function renderAs(user) {
  setTestUserSession(storage, schema.STORAGE_KEYS, user);
  const container = createFakeContainer();
  initCaixaModule(container);
  return container;
}

// Caixa fechado (nenhuma sessao hoje)
assert(!cashSession.isCashSessionOpen(), 'pre-condicao: caixa fechado');
const closedScreen = renderAs(admin);
assert(/<h1[^>]*>Caixa<\/h1>/.test(closedScreen.innerHTML), 'titulo da tela e Caixa');
assert(!closedScreen.innerHTML.includes('Fechar Caixa / CRM'), 'titulo antigo saiu');
assert(closedScreen.innerHTML.includes('ui-head'), 'cabecalho usa ui-head');
assert(closedScreen.innerHTML.includes('Caixa fechado'), 'sem sessao aberta mostra Caixa fechado');
assert(!closedScreen.innerHTML.includes('Aberto às'), 'caixa fechado nao mostra a linha de abertura');
assert(closedScreen.innerHTML.includes('data-caixa-screen'), 'marca data-caixa-screen continua');

// Caixa aberto: linha de abertura com hora, nome e troco inicial
cashSession.openCashSession({ openingAmount: 100 });
const openScreen = renderAs(admin);
const openText = plain(openScreen.innerHTML);
assert(/Aberto às \d{2}:\d{2} por Administrador, com R\$ 100,00 de troco inicial\./.test(openText), 'linha de abertura com hora, nome e troco');
assert(!openText.includes('Caixa fechado'), 'caixa aberto nao diz Caixa fechado');

// Sem o nome do usuario na sessao, a linha omite "por Nome"
const storedSession = storage.getItem(schema.STORAGE_KEYS.cashSession, null);
storage.setItem(schema.STORAGE_KEYS.cashSession, { ...storedSession, openedByName: '', openedBy: '' });
const anonymousText = plain(renderAs(admin).innerHTML);
assert(/Aberto às \d{2}:\d{2}, com R\$ 100,00 de troco inicial\./.test(anonymousText), 'sem nome, a linha omite "por"');
storage.setItem(schema.STORAGE_KEYS.cashSession, storedSession);

// Botoes de caixa no cabecalho (admin)
const headerOf = (container) => container.innerHTML.match(/<header class="ui-head[\s\S]*?<\/header>/)?.[0] || '';
const adminHeader = headerOf(openScreen);
['open-entry', 'open-output', 'open-write-off'].forEach((action) => {
  assert(adminHeader.includes(`data-action="${action}"`), `admin ve ${action} no cabecalho`);
});
assert(!openScreen.innerHTML.includes('open-quick-closing'), 'sem Fechamento rapido nesta tela');
['Hoje', 'Ontem', 'Semana', 'Mês', 'Personalizado'].forEach((label) => {
  assert(adminHeader.includes(`>${label}<`), `periodo ${label} no cabecalho`);
});
assert(/class="is-on"[^>]*data-crm-period="today"|data-crm-period="today"[^>]*class="is-on"/.test(adminHeader), 'periodo ativo usa is-on');
assert(adminHeader.includes('ui-seg'), 'periodos em ui-seg');

// Cartoes, conferencia em ui-table e fechar caixa so com Hoje
assert(openScreen.innerHTML.includes('ui-stats'), 'cartoes usam ui-stats');
['Total vendido', 'Ticket médio', 'Comandas fechadas', 'Entradas', 'Saídas'].forEach((label) => {
  assert(openScreen.innerHTML.includes(label), `cartao ${label}`);
});
assert(openScreen.innerHTML.includes('ui-table'), 'conferencia usa ui-table');
['Forma', 'Esperado', 'Contado', 'Diferença'].forEach((label) => {
  assert(openScreen.innerHTML.includes(`>${label}<`), `coluna ${label}`);
});
['countedCash', 'checkedPix', 'checkedDebit', 'checkedCredit', 'note'].forEach((name) => {
  assert(openScreen.innerHTML.includes(`data-crm-closing-input="${name}"`), `campo ${name} mantido`);
});
assert(openScreen.innerHTML.includes('data-crm-closing-difference'), 'diferenca geral mantida');
assert(/<button class="ui-btn ui-btn--primary[^"]*"[^>]*data-action="confirm-crm-closing"/.test(openScreen.innerHTML), 'Fechar caixa e ui-btn--primary com confirm-crm-closing');
assert(openScreen.innerHTML.includes('>Fechar caixa<'), 'botao Fechar caixa com o periodo Hoje');
assert(!/data-action="confirm-crm-closing"[^>]*disabled/.test(openScreen.innerHTML), 'Fechar caixa ativo em Hoje');
assert(!openScreen.innerHTML.includes('Selecione Hoje'), 'Hoje nao pede para selecionar Hoje');
assert(!/[A-ZÀ-Ú]{5,}/.test(openScreen.innerHTML.replace(/<[^>]*>/g, ' ').replace(/R\$|PDV|CRM|PIX/g, '')), 'sem rotulos em CAIXA ALTA');

// Outro periodo: conferencia continua, mas o fechamento fica desativado
clickOn(openScreen, { '[data-crm-period]': { dataset: { crmPeriod: 'yesterday' } } });
assert(/data-action="confirm-crm-closing"[^>]*disabled/.test(openScreen.innerHTML), 'fechar fica desativado fora de Hoje');
assert(openScreen.innerHTML.includes('Selecione Hoje para fechar'), 'texto Selecione Hoje para fechar');
clickOn(openScreen, { '[data-crm-period]': { dataset: { crmPeriod: 'today' } } });
assert(openScreen.innerHTML.includes('>Fechar caixa<'), 'voltando para Hoje o botao volta');

// Diferenca: negativa em vermelho, zero ou positiva em verde
function typeCounted(container, value) {
  container.dispatch('input', {
    target: {
      dataset: { crmClosingInput: 'countedCash' },
      closest: () => true,
      matches: (selector) => selector === '[data-crm-closing-input]',
      value
    }
  });
}
// A sessao abriu com R$ 100,00 de troco inicial: esperado em dinheiro = 100.
typeCounted(openScreen, '95');
const generalDifference = openScreen.querySelector('[data-crm-closing-difference]');
assert(/is-neg/.test(generalDifference.className), 'diferenca negativa usa is-neg');
typeCounted(openScreen, '100');
assert(/is-pos/.test(generalDifference.className) && !/is-neg/.test(generalDifference.className), 'diferenca zero usa is-pos');
assert(generalDifference.textContent.includes('0,00'), 'contar exatamente o troco inicial nao gera diferenca');
typeCounted(openScreen, '105');
assert(/is-pos/.test(generalDifference.className), 'diferenca positiva usa is-pos');
assert(/is-neg/.test(openScreen.querySelector('[data-crm-row-difference="cash"]').className) === false, 'linha do dinheiro acompanha a diferenca');
typeCounted(openScreen, '');

// Mesma regra no desenho completo da tela: -5 vermelho, 0 e +5 verde (contagem = troco inicial 100 + diferenca).
for (const [counted, tone] of [['95', 'is-neg'], ['100', 'is-pos'], ['105', 'is-pos']]) {
  typeCounted(openScreen, counted);
  clickOn(openScreen, { '[data-crm-period]': { dataset: { crmPeriod: 'today' } } });
  const renderedTone = openScreen.innerHTML.match(/class="cx-diff (is-neg|is-pos) cx-diff--big" data-crm-closing-difference/)?.[1];
  assert(renderedTone === tone, `diferenca ${counted} desenhada com ${tone} (veio ${renderedTone})`);
}
typeCounted(openScreen, '');
clickOn(openScreen, { '[data-crm-period]': { dataset: { crmPeriod: 'today' } } });

// Modais de entrada, saida e perda/consumo na propria tela
clickOn(openScreen, { '[data-action]': { dataset: { action: 'open-entry' } } });
assert(openScreen.innerHTML.includes('data-cash-form') && openScreen.innerHTML.includes('Registrar entrada'), '+ Entrada abre o modal de entrada');
clickOn(openScreen, { '[data-action]': { dataset: { action: 'close-modal' } } });
assert(!openScreen.innerHTML.includes('data-cash-form'), 'close-modal fecha o modal');
clickOn(openScreen, { '[data-action]': { dataset: { action: 'open-output' } } });
assert(openScreen.innerHTML.includes('data-cash-form') && openScreen.innerHTML.includes('Registrar saída'), '- Saida abre o modal de saida');
clickOn(openScreen, { '[data-action]': { dataset: { action: 'close-modal' } } });
clickOn(openScreen, { '[data-action]': { dataset: { action: 'open-write-off' } } });
assert(openScreen.innerHTML.includes('Perda / Consumo') && openScreen.innerHTML.includes('modal-backdrop'), 'Perda / Consumo abre o modal');
clickOn(openScreen, { '[data-action]': { dataset: { action: 'close-modal' } } });

// Atualizacao em segundo plano nao apaga um modal meio preenchido:
// so a etiqueta de sincronizacao muda; a tela inteira redesenha quando o modal fecha.
for (const action of ['open-entry', 'open-output', 'open-write-off']) {
  clickOn(openScreen, { '[data-action]': { dataset: { action } } });
  // Marca no DOM o que o usuario ja digitou: um redesenho completo apagaria.
  const withModal = `${openScreen.innerHTML}<!-- valor digitado -->`;
  openScreen.innerHTML = withModal;
  const syncPill = openScreen.querySelector('[data-caixa-sync]');
  syncPill.outerHTML = '';
  eventBus.emit(UI_EVENTS.financialSyncStatusChanged);
  eventBus.emit(UI_EVENTS.cashSessionChanged);
  assert(openScreen.innerHTML === withModal, `${action}: atualizacao em segundo plano nao redesenha a tela com o modal aberto`);
  assert(syncPill.outerHTML.includes('data-sync-state'), `${action}: etiqueta de sincronizacao e atualizada mesmo com o modal aberto`);
  clickOn(openScreen, { '[data-action]': { dataset: { action: 'close-modal' } } });
}
openScreen.innerHTML = 'tela antiga';
eventBus.emit(UI_EVENTS.financialSyncStatusChanged);
assert(openScreen.innerHTML.includes('data-caixa-screen'), 'sem modal, a atualizacao em segundo plano redesenha a tela');

// Operador: so Entrada e Saida, sem Perda/Consumo
const operadorScreen = renderAs(operador);
assert(operadorScreen.innerHTML.includes('data-action="open-entry"') && operadorScreen.innerHTML.includes('data-action="open-output"'), 'operador ve Entrada e Saida');
assert(!operadorScreen.innerHTML.includes('open-write-off'), 'operador nao ve Perda / Consumo');

console.log('caixa module ok');
