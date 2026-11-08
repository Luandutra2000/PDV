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

// Intl usa espaco nao separavel entre "R$" e o valor.
const plain = (markup) => String(markup).replace(/ /g, ' ');

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin, setTestUserSession } = await import('./test-auth-fixture.mjs?v=20260804-06');
const comandas = await import('../src/services/comanda.service.js?v=20260804-06');
const cashSession = await import('../src/services/cash-session.service.js?v=20260804-06');
const { renderProductCard } = await import('../src/components/product-card.component.js?v=20260807-09');
const { renderOrderPanel } = await import('../src/components/order-panel.component.js?v=20260807-09');
const { initVendasModule } = await import('../src/modules/vendas/vendas.module.js?v=20260807-21');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.ensureSeedData();

// ---------- Cartao de produto ----------
const lowCard = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 3 }, 'Bebidas', { colorVar: 'var(--cat-bebidas)' });
assert(lowCard.includes('3 restantes'), 'estoque de 1 a 3 mostra "N restantes"');
assert(lowCard.includes('is-low'), 'estoque baixo usa a classe is-low');
assert(lowCard.includes('--cat-bebidas'), 'cartao recebe a cor da categoria em --c');
assert(lowCard.includes('style="--c: var(--cat-bebidas)"'), 'cor vai no atributo style como --c');
assert(!lowCard.includes('quick-add'), 'cartao nao tem mais os botoes quick-add');
assert(!lowCard.includes('open-quantity'), 'cartao nao tem mais o botao Qtd');
assert((lowCard.match(/<button/g) || []).length === 1, 'cartao e um unico botao');
assert(lowCard.includes('data-action="add-product"') && lowCard.includes('data-product-id="p1"'), 'cartao mantem add-product e data-product-id');
assert(plain(lowCard).includes('R$ 8,00'), 'cartao mostra o preco');
assert(lowCard.includes('Suco'), 'cartao mostra o nome');
assert(!lowCard.includes('is-in'), 'sem quantidade na comanda nao ha is-in');

const outCard = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 0 }, 'Bebidas', { colorVar: 'var(--cat-bebidas)' });
assert(outCard.includes('is-out'), 'estoque zero usa is-out');
assert(outCard.includes('Esgotado'), 'estoque zero mostra Esgotado');
assert(!outCard.includes('Sem estoque'), 'selo Sem estoque saiu');
assert(!outCard.includes('stock-badge'), 'selo vermelho saiu');
assert(!outCard.includes('disabled'), 'esgotado continua vendavel como hoje (so muda a aparencia)');

const negativeCard = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: -2 }, 'Bebidas');
assert(negativeCard.includes('is-out') && negativeCard.includes('Esgotado'), 'estoque negativo conta como esgotado');
assert(negativeCard.includes('--c: var(--muted)'), 'cor padrao e var(--muted)');

const okCard = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 12 }, 'Bebidas');
assert(okCard.includes('12 em estoque') && !okCard.includes('is-low') && !okCard.includes('is-out'), 'estoque normal mostra "N em estoque"');

const inCard = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 3 }, 'Bebidas', { colorVar: 'var(--cat-bebidas)', quantityInOrder: 2 });
assert(inCard.includes('is-in'), 'item na comanda usa is-in');
assert(/class="fc-card__qty"[^>]*>2</.test(inCard), 'item na comanda mostra o circulo com a quantidade');

const hostileColor = renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 3 }, '', { colorVar: '"><img src=x>' });
assert(!hostileColor.includes('<img'), 'colorVar e escapado');

// ---------- Comanda ----------
const order = plain(renderOrderPanel({ items: [{ productId: 'p1', name: 'Suco', unitPrice: 8, quantity: 2, total: 16 }] }));
assert(order.includes('Receber R$ 16,00'), 'botao principal Receber com o total');
assert(/<button class="ui-btn ui-btn--primary[^"]*"[^>]*data-action="open-payment"/.test(order), 'Receber e .ui-btn--primary com open-payment');
assert((order.match(/data-action="open-payment"/g) || []).length === 1, 'um unico botao Receber');
assert(order.includes('data-action="clear-order"') && order.includes('Limpar'), 'Limpar no titulo da comanda');
assert(!order.includes('open-entry'), 'comanda sem + Entrada');
assert(!order.includes('open-output'), 'comanda sem - Saida');
assert(order.includes('data-action="decrease" data-product-id="p1"'), 'item com -');
assert(order.includes('data-action="increase" data-product-id="p1"'), 'item com +');
assert(order.includes('data-action="remove" data-product-id="p1"'), 'item com remover');
assert(/>Total</.test(order), 'linha Total');
assert(order.includes('R$ 8,00 cada'), 'preco por unidade');
assert(/class="fc-order__title">Comanda</.test(order), 'sem numero, o titulo e so Comanda');

const numbered = renderOrderPanel({ number: 18, items: [] });
assert(numbered.includes('Comanda 18'), 'titulo usa o numero da comanda quando existe');
assert(/data-action="open-payment"[^>]*disabled/.test(numbered), 'Receber desativado com a comanda vazia');

// ---------- Tela inteira (cabecalho, permissoes, caixa fechado, toque longo) ----------
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
        parts.set(selector, { innerHTML: '' });
      }
      return parts.get(selector);
    },
    part(selector) {
      return parts.get(selector)?.innerHTML || '';
    },
    dispatch(type, event) {
      (this.listeners[type] || []).forEach((handler) => handler(event));
    }
  };
}

function renderAs(user) {
  setTestUserSession(storage, schema.STORAGE_KEYS, user);
  const container = createFakeContainer();
  initVendasModule(container);
  return container;
}

function headerOf(container) {
  const match = container.innerHTML.match(/<header class="fc-bar"[\s\S]*?<\/header>/);
  return match ? match[0] : '';
}

const operador = { id: 'user-operador', name: 'Operador', username: 'operador', role: 'operador', active: true };
const admin = { id: 'user-admin', name: 'Administrador', username: 'admin', role: 'admin', active: true };
const dono = { id: 'user-dono', name: 'Dono', username: 'dono', role: 'dono', active: true };

// Caixa fechado (nenhuma sessao aberta hoje)
assert(!cashSession.isCashSessionOpen(), 'pre-condicao: caixa fechado');
const closedScreen = renderAs(admin);
assert(/<section class="pdv-screen fc is-cash-closed"/.test(closedScreen.innerHTML), 'caixa fechado poe is-cash-closed na secao');
assert(closedScreen.innerHTML.includes('Caixa fechado. Abra o caixa antes de registrar uma venda.'), 'aviso de caixa fechado continua');

cashSession.openCashSession({ openingAmount: 0 });
const openScreen = renderAs(admin);
assert(!openScreen.innerHTML.includes('is-cash-closed'), 'caixa aberto nao tem is-cash-closed');
assert(!openScreen.innerHTML.includes('Caixa fechado. Abra o caixa'), 'caixa aberto nao mostra o aviso');

// Cabecalho: titulo, busca, botoes de caixa
const adminHeader = headerOf(openScreen);
assert(adminHeader.includes('Frente de caixa'), 'titulo Frente de caixa');
assert(adminHeader.includes('id="product-search"'), 'busca no cabecalho');
['open-entry', 'open-output', 'open-quick-closing', 'open-write-off'].forEach((action) => {
  assert(adminHeader.includes(`data-action="${action}"`), `admin ve ${action} no cabecalho`);
});
assert(!openScreen.innerHTML.includes('quick-access'), 'faixa Acesso rapido saiu');

const operadorScreen = renderAs(operador);
const operadorHeader = headerOf(operadorScreen);
assert(operadorHeader.includes('data-action="open-entry"'), 'operador ve + Entrada no cabecalho');
assert(operadorHeader.includes('data-action="open-output"'), 'operador ve - Saida no cabecalho');
assert(!operadorScreen.innerHTML.includes('open-write-off'), 'operador nao tem stock.writeoff: sem Perda / Consumo');
assert(!operadorScreen.innerHTML.includes('open-quick-closing'), 'operador nao tem cash.close: sem Fechamento rapido');
const operadorOrder = operadorScreen.part('[data-order-panel]');
assert(operadorOrder.includes('data-action="open-payment"'), 'operador tem sales.create: ve Receber');
assert(!operadorOrder.includes('open-entry') && !operadorOrder.includes('open-output'), 'Entrada e Saida sairam da comanda');

// Gate de sales.create na comanda
const donoScreen = renderAs(dono);
assert(!donoScreen.part('[data-order-panel]').includes('open-payment'), 'sem sales.create nao ha open-payment');
assert(donoScreen.part('[data-order-panel]').includes('fc-order'), 'a comanda continua aparecendo sem sales.create');

// Abas de categoria como chips, com Favoritos e Mais vendidos
const tabs = openScreen.part('[data-category-tabs]');
['Todos', 'Mais vendidos', 'Favoritos', 'Lanches', 'Bebidas'].forEach((label) => {
  assert(tabs.includes(label), `aba ${label}`);
});
assert(tabs.includes('fc-chip is-on'), 'aba ativa usa fc-chip is-on');

// Grade usa a cor da categoria (lista completa) e marca o que esta na comanda
comandas.clearComanda();
comandas.addItem({ id: 'x-burger', name: 'X-Burger', price: 16 });
const adminAgain = renderAs(admin);
const grid = adminAgain.part('[data-product-grid]');
const burgerCard = grid.match(/<button[^>]*data-product-id="x-burger"[\s\S]*?<\/button>/)?.[0] || '';
assert(burgerCard.includes('--c: var(--cat-lanches)'), 'cartao do X-Burger usa var(--cat-lanches)');
assert(burgerCard.includes('is-in'), 'cartao do item na comanda tem is-in');
const juiceCard = grid.match(/<button[^>]*data-product-id="suco-natural"[\s\S]*?<\/button>/)?.[0] || '';
assert(juiceCard.includes('--c: var(--cat-bebidas)') && !juiceCard.includes('is-in'), 'cartao fora da comanda nao tem is-in');

// ---------- Toque longo ----------
function fakeCard(productId) {
  const card = {
    dataset: { action: 'add-product', productId },
    closest(selector) {
      if (selector === '.pdv-screen') return {};
      if (selector === '[data-action="add-product"]' || selector === '[data-action]') return card;
      return null;
    }
  };
  return card;
}

function pointerEvent(target, extra = {}) {
  let prevented = false;
  return {
    target,
    button: 0,
    pointerType: 'touch',
    clientX: 10,
    clientY: 10,
    preventDefault() { prevented = true; },
    stopPropagation() {},
    get defaultPrevented() { return prevented; },
    ...extra
  };
}

function closeModal(screen) {
  const target = { dataset: { action: 'close-modal' }, closest(selector) { if (selector === '.pdv-screen') return {}; return selector === '[data-action]' ? target : null; } };
  screen.dispatch('click', pointerEvent(target));
}

const quantityOf = (productId) => comandas.getActiveComanda().items.find((item) => item.productId === productId)?.quantity || 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

comandas.clearComanda();
const pressScreen = renderAs(admin);
const card = fakeCard('x-burger');

// Toque simples adiciona 1
pressScreen.dispatch('pointerdown', pointerEvent(card));
pressScreen.dispatch('pointerup', pointerEvent(card));
pressScreen.dispatch('click', pointerEvent(card));
assert(quantityOf('x-burger') === 1, 'toque simples adiciona 1');
await wait(600);
assert(!pressScreen.part('[data-vendas-modal]').includes('data-quantity-form'), 'toque simples nao abre a quantidade depois');

// Toque longo abre a quantidade e nao adiciona
pressScreen.dispatch('pointerdown', pointerEvent(card));
await wait(600);
assert(pressScreen.part('[data-vendas-modal]').includes('data-quantity-form'), 'toque longo abre o modal de quantidade');
pressScreen.dispatch('pointerup', pointerEvent(card));
pressScreen.dispatch('click', pointerEvent(card));
assert(quantityOf('x-burger') === 1, 'toque longo nao adiciona pelo clique que vem depois');

// Depois do toque longo, o proximo toque simples volta a adicionar
pressScreen.dispatch('pointerdown', pointerEvent(card));
pressScreen.dispatch('pointerup', pointerEvent(card));
pressScreen.dispatch('click', pointerEvent(card));
assert(quantityOf('x-burger') === 2, 'toque simples depois do longo adiciona 1');
closeModal(pressScreen);
assert(!pressScreen.part('[data-vendas-modal]').includes('data-quantity-form'), 'fechar o modal limpa a quantidade');

// Movimento (rolagem) cancela o toque longo
comandas.clearComanda();
const moveScreen = renderAs(admin);
moveScreen.dispatch('pointerdown', pointerEvent(card));
moveScreen.dispatch('pointermove', pointerEvent(card, { clientX: 10, clientY: 60 }));
await wait(600);
assert(!moveScreen.part('[data-vendas-modal]').includes('data-quantity-form'), 'arrastar cancela o toque longo');

// Botao direito (contextmenu) abre a quantidade e bloqueia o menu do navegador
const menuScreen = renderAs(admin);
const menuEvent = pointerEvent(card, { pointerType: 'mouse' });
menuScreen.dispatch('contextmenu', menuEvent);
assert(menuEvent.defaultPrevented, 'contextmenu no cartao bloqueia o menu do navegador');
assert(menuScreen.part('[data-vendas-modal]').includes('data-quantity-form'), 'contextmenu abre o modal de quantidade');
assert(quantityOf('x-burger') === 0, 'contextmenu nao adiciona');

// ---------- Layout: o container dos modais nao pode virar linha da grade ----------
const { readFile } = await import('node:fs/promises');
const pdvCss = await readFile(new URL('../src/styles/pdv-b.css', import.meta.url), 'utf8');
assert(pdvCss.includes('.pdv-screen.fc > [data-vendas-modal] { display: contents; }'), 'container dos modais fica fora da grade (display: contents)');
const wideStart = pdvCss.indexOf('@media (min-width: 761px) {');
const wideBlock = wideStart >= 0 ? pdvCss.slice(wideStart, pdvCss.indexOf('\n}', wideStart)) : '';
assert(wideBlock.includes('.pdv-screen.fc { height: 100%; grid-template-rows: minmax(0, 1fr); }'), 'em tela larga a grade tem uma unica linha que ocupa a altura toda');
assert(/<\/main>\s*<div class="fc-side" data-order-panel><\/div>\s*<div data-vendas-modal><\/div>\s*<\/section>/.test(openScreen.innerHTML), 'a secao tem so a grade, a comanda e o container dos modais');

console.log('frente de caixa markup ok');
