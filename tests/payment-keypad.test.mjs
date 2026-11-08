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

const same = (actual, expected, message) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
};

// ---------- Regras do teclado e das cedulas ----------
const { getQuickCashOptions, applyKeypadKey, parseReceivedAmount } = await import('../src/utils/payment-keypad.js?v=20260807-10');

same(getQuickCashOptions(74), [80, 100, 200], 'cedulas para 74');
same(getQuickCashOptions(100), [110, 150, 200], 'cedulas para 100');
same(getQuickCashOptions(45), [50, 100, 200], 'cedulas para 45 (10 e 50 coincidem)');
same(getQuickCashOptions(5), [10, 50, 100], 'cedulas para 5');
same(getQuickCashOptions(74.5), [80, 100, 200], 'cedulas para total com centavos');
same(getQuickCashOptions(0), [10, 50, 100], 'cedulas para total zero');
getQuickCashOptions(95).forEach((value, index, list) => {
  assert(value > 95, 'cedula maior que o total');
  assert(index === 0 || value > list[index - 1], 'cedulas em ordem crescente e sem repeticao');
});

assert(applyKeypadKey('10', '0') === '100', '10 + 0 = 100');
assert(applyKeypadKey('100', 'back') === '10', '100 + apagar = 10');
assert(applyKeypadKey('', '00') === '', 'vazio + 00 continua vazio');
assert(applyKeypadKey('', '0') === '', 'vazio + 0 continua vazio');
assert(applyKeypadKey('', '7') === '7', 'vazio + 7 = 7');
assert(applyKeypadKey('7', '00') === '700', '7 + 00 = 700');
assert(applyKeypadKey('', 'back') === '', 'apagar no vazio continua vazio');
assert(applyKeypadKey('5', 'back') === '', 'apagar o ultimo digito esvazia');
assert(applyKeypadKey('100,5', '0') === '100,50', 'digitos seguem apos a virgula');
assert(applyKeypadKey('100,50', '3') === '100,50', 'nao aceita mais de duas casas decimais');

assert(parseReceivedAmount('100') === 100, 'inteiro');
assert(parseReceivedAmount('100,50') === 100.5, 'virgula');
assert(parseReceivedAmount('100.50') === 100.5, 'ponto');
assert(parseReceivedAmount('') === 0, 'vazio vira zero');
assert(parseReceivedAmount('  ') === 0, 'so espacos vira zero');
assert(parseReceivedAmount('abc') === 0, 'texto invalido vira zero');
assert(parseReceivedAmount(undefined) === 0, 'undefined vira zero');
assert(parseReceivedAmount('R$ 1,50') === 1.5, 'ignora o simbolo de moeda');

// ---------- Modal de recebimento (R$ 74) ----------
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comandas = await import('../src/services/comanda.service.js?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20260804-06');
const { initVendasModule } = await import('../src/modules/vendas/vendas.module.js?v=20260807-20');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();
cashSession.openCashSession({ openingAmount: 0 });
comandas.clearComanda();
comandas.addItem({ id: 'combo-casal', name: 'Combo Casal', price: 74 });

// Intl usa espaco nao separavel entre "R$" e o valor.
const plain = (markup) => String(markup).replace(/ /g, ' ');
const textOf = (markup) => plain(markup).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

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
        parts.set(selector, { innerHTML: '', value: '', textContent: '', disabled: false, hidden: false });
      }
      return parts.get(selector);
    },
    part(selector) {
      return parts.get(selector)?.innerHTML || '';
    },
    stub(selector) {
      return parts.get(selector);
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((handler) => handler(event));
    }
  };
}

function target(selectors, extra = {}) {
  const element = {
    matches: (selector) => selectors.includes(selector),
    closest: (selector) => {
      if (selector === '.pdv-screen') return {};
      return selectors.includes(selector) ? element : null;
    },
    ...extra
  };
  return element;
}

const event = (element, extra = {}) => ({ target: element, button: 0, preventDefault() {}, stopPropagation() {}, ...extra });
const modalOf = (screen) => screen.part('[data-vendas-modal]');

const screen = createFakeContainer();
initVendasModule(screen);

function click(selectors, dataset) {
  screen.dispatch('click', event(target(selectors, { dataset })));
}

function reRenderModal() {
  // Trocar a forma de pagamento redesenha o modal a partir do estado.
  const method = target(['[name="paymentMethod"]'], { value: 'dinheiro' });
  screen.dispatch('change', event(method));
}

click(['[data-action]'], { action: 'open-payment' });
let markup = modalOf(screen);
let text = textOf(markup);

assert(markup.includes('data-payment-form'), 'abre o formulario de recebimento');
assert(text.includes('Receber comanda'), 'titulo Receber comanda');
assert(text.includes('Total a receber') && text.includes('R$ 74,00'), 'total a receber em destaque');
['dinheiro', 'debito', 'credito', 'pix'].forEach((method) => {
  assert(new RegExp(`<input[^>]*type="radio"[^>]*name="paymentMethod"[^>]*value="${method}"`).test(markup), `botao da forma ${method} mantem name e value`);
});
assert((markup.match(/name="paymentMethod"/g) || []).length === 4, 'quatro formas de pagamento');
assert(/name="paymentMethod" value="dinheiro" checked/.test(markup), 'dinheiro comeca marcado');
['Dinheiro', 'Pix', 'Débito', 'Crédito'].forEach((label) => assert(text.includes(label), `rotulo ${label}`));
assert((markup.match(/<svg/g) || []).length >= 4, 'cada forma de pagamento tem icone');
assert(/name="receivedAmount"[^>]*value="74"/.test(markup), 'valor recebido comeca com o total');
assert(/inputmode="decimal"/.test(markup), 'campo aceita virgula (texto decimal)');
assert(markup.includes('data-quick-cash="74"') && text.includes('Exato'), 'botao Exato com o total');
[80, 100, 200].forEach((value) => assert(markup.includes(`data-quick-cash="${value}"`), `botao rapido de ${value}`));
['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '00', 'back'].forEach((key) => {
  assert(markup.includes(`data-keypad-key="${key}"`), `tecla ${key}`);
});
assert(text.includes('Troco') && text.includes('R$ 0,00'), 'troco R$ 0,00 quando recebe o valor exato');
assert(!text.includes('Faltam'), 'sem Faltam quando o valor cobre o total');
assert(!/data-pay-submit[^>]*disabled/.test(markup), 'Finalizar habilitado com o valor exato');
assert(text.includes('Finalizar venda') && text.includes('Cancelar'), 'acoes Cancelar e Finalizar venda');
assert(!markup.includes('Registro manual de recebimento'), 'paragrafo longo saiu');

// Digitar 50: faltam R$ 24,00 e Finalizar desativado
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '50', id: 'receivedAmount' })));
reRenderModal();
markup = modalOf(screen);
text = textOf(markup);
assert(/name="receivedAmount"[^>]*value="50"/.test(markup), 'o texto digitado e mantido ao redesenhar');
assert(text.includes('Faltam R$ 24,00'), 'com R$ 50 mostra Faltam R$ 24,00');
assert(/<button[^>]*type="submit"[^>]*data-pay-submit[^>]*disabled|<button[^>]*data-pay-submit[^>]*type="submit"[^>]*disabled/.test(markup), 'Finalizar desativado com R$ 50');
assert(!text.includes('Troco R$'), 'sem troco quando falta valor');

// Digitar 100: troco R$ 26,00
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '100' })));
reRenderModal();
markup = modalOf(screen);
text = textOf(markup);
assert(text.includes('Troco R$ 26,00'), 'com R$ 100 mostra Troco R$ 26,00');
assert(!text.includes('Faltam'), 'sem Faltam com R$ 100');
assert(!/data-pay-submit[^>]*disabled/.test(markup), 'Finalizar habilitado com R$ 100');
assert(/data-quick-cash="100"[^>]*aria-pressed="true"|class="[^"]*is-on[^"]*"[^>]*data-quick-cash="100"/.test(markup), 'botao R$ 100 fica marcado');

// Virgula: 100,50 vira troco de R$ 26,50
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '100,50' })));
reRenderModal();
assert(textOf(modalOf(screen)).includes('Troco R$ 26,50'), 'virgula e lida: 100,50 da troco de R$ 26,50');

// Campo vazio: faltam R$ 74,00
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '' })));
reRenderModal();
markup = modalOf(screen);
assert(textOf(markup).includes('Faltam R$ 74,00') && /data-pay-submit[^>]*disabled/.test(markup), 'campo vazio: Faltam R$ 74,00 e Finalizar desativado');

// Atualizacao ao vivo (sem redesenhar o modal): teclado e cedulas
const keypad = (key) => click(['[data-keypad-key]'], { keypadKey: key });
const quick = (value) => click(['[data-quick-cash]'], { quickCash: String(value) });

click(['[data-quick-cash]'], { quickCash: '74' });
assert(screen.stub('[name="receivedAmount"]').value === '74', 'Exato poe o total no campo');
keypad('1'); keypad('0'); keypad('0');
assert(screen.stub('[name="receivedAmount"]').value === '100', 'teclado substitui o valor sugerido: 1, 0, 0 = 100');
assert(textOf(screen.part('[data-pay-live]')).includes('Troco R$ 26,00'), 'teclado atualiza o troco ao vivo');
assert(screen.stub('[data-pay-submit]').disabled === false, 'Finalizar habilitado ao vivo');
keypad('back'); keypad('back'); keypad('00');
assert(screen.stub('[name="receivedAmount"]').value === '100', 'apagar apagar 00 = 100');
keypad('back'); keypad('back'); keypad('back');
assert(screen.stub('[name="receivedAmount"]').value === '', 'apagar tudo deixa vazio');
assert(textOf(screen.part('[data-pay-live]')).includes('Faltam R$ 74,00'), 'vazio mostra Faltam R$ 74,00 ao vivo');
assert(screen.stub('[data-pay-submit]').disabled === true, 'Finalizar desativado ao vivo');
quick(200);
assert(screen.stub('[name="receivedAmount"]').value === '200', 'cedula de 200 poe 200 no campo');
assert(textOf(screen.part('[data-pay-live]')).includes('Troco R$ 126,00'), 'troco de 200 para 74');
assert(screen.stub('[data-pay-submit]').disabled === false, 'Finalizar habilitado com 200');

// Pix: sem teclado, sem cedulas, com aviso curto, Finalizar habilitado
screen.dispatch('change', event(target(['[name="paymentMethod"]'], { value: 'pix' })));
markup = modalOf(screen);
text = textOf(markup);
assert(/name="paymentMethod" value="pix" checked/.test(markup), 'pix fica marcado');
assert(text.includes('Confirme o pagamento na maquininha ou no app do banco antes de finalizar.'), 'aviso para Pix e cartao');
assert(!markup.includes('data-keypad-key') && !markup.includes('data-quick-cash'), 'Pix nao mostra teclado nem cedulas');
assert(!markup.includes('name="receivedAmount"'), 'Pix nao mostra valor recebido');
assert(!text.includes('Troco') && !text.includes('Faltam'), 'Pix nao mostra troco nem Faltam');
assert(!/data-pay-submit[^>]*disabled/.test(markup), 'Finalizar habilitado em Pix');

screen.dispatch('change', event(target(['[name="paymentMethod"]'], { value: 'credito' })));
assert(modalOf(screen).includes('Confirme o pagamento na maquininha'), 'aviso tambem no credito');

// Voltar para dinheiro mantem o valor digitado
screen.dispatch('change', event(target(['[name="paymentMethod"]'], { value: 'dinheiro' })));
assert(/name="receivedAmount"[^>]*value="200"/.test(modalOf(screen)), 'voltar para dinheiro mantem o valor');

// Reabrir o modal volta ao valor exato
click(['[data-action]'], { action: 'close-modal' });
click(['[data-action]'], { action: 'open-payment' });
assert(/name="receivedAmount"[^>]*value="74"/.test(modalOf(screen)), 'reabrir recomeca com o total');

// Envio: o FormData le o valor que esta de fato no campo (o DOM real guarda o texto digitado, com virgula)
const originalFormData = globalThis.FormData;
function submitPayment(method) {
  globalThis.FormData = class {
    get(name) {
      if (name === 'paymentMethod') return method;
      if (name === 'receivedAmount') return screen.stub('[name="receivedAmount"]')?.value;
      return null;
    }
  };
  try {
    screen.dispatch('submit', event(target(['[data-payment-form]'], {})));
  } finally {
    globalThis.FormData = originalFormData;
  }
}

screen.querySelector('[name="receivedAmount"]').value = '100,00';
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '100,00' })));
submitPayment('dinheiro');
assert(modalOf(screen).includes('sale-success'), 'finaliza e mostra o sucesso da venda');
assert(textOf(modalOf(screen)).includes('R$ 26,00'), 'o valor "100,00" (com virgula) chega ao envio: troco de R$ 26,00');

// ---------- Total com centavos: Exato preenche o campo ----------
globalThis.document = { querySelectorAll: () => [] };
click(['[data-action]'], { action: 'close-sale-success' });
comandas.clearComanda();
comandas.addItem({ id: 'combo-centavos', name: 'Combo', price: 74.5 });
click(['[data-action]'], { action: 'open-payment' });
assert(/name="receivedAmount"[^>]*value="74,50"/.test(modalOf(screen)), 'campo comeca com 74,50');
assert(modalOf(screen).includes('data-quick-cash="74.5"'), 'Exato guarda o numero cru no atributo');
screen.dispatch('input', event(target(['[name="receivedAmount"]'], { value: '10' })));
click(['[data-quick-cash]'], { quickCash: '74.5' });
assert(screen.stub('[name="receivedAmount"]').value === '74,50', 'Exato com centavos preenche 74,50 (nao esvazia o campo)');
assert(textOf(screen.part('[data-pay-live]')).includes('Troco R$ 0,00'), 'Exato com centavos: Troco R$ 0,00');
assert(!textOf(screen.part('[data-pay-live]')).includes('Faltam'), 'Exato com centavos: sem Faltam');
assert(screen.stub('[data-pay-submit]').disabled === false, 'Exato com centavos: Finalizar habilitado');
submitPayment('dinheiro');
assert(modalOf(screen).includes('sale-success'), 'finaliza R$ 74,50 com o valor exato');

// ---------- Estilos: moldura clara dos modais ----------
const { readFile } = await import('node:fs/promises');
const modalB = await readFile(new URL('../src/styles/modal-b.css', import.meta.url), 'utf8');
['.modal-backdrop', '.modal__header', '.form-actions', '.stacked-label', 'rgba(28, 35, 49, .42)', 'var(--card)', 'var(--line)', 'var(--ink)', 'border-radius: 18px'].forEach((piece) => {
  assert(modalB.includes(piece), `modal-b.css tem ${piece}`);
});
assert(!/#111|#000\b|#ffffff|linear-gradient/i.test(modalB), 'modal-b.css usa tokens, sem preto fixo nem degrade');

console.log('payment keypad ok');
