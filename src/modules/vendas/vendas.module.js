import { renderOrderPanel } from '../../components/order-panel.component.js?v=20260807-09';
import { renderProductCard } from '../../components/product-card.component.js?v=20260807-09';
import { icon } from '../../components/icons.js?v=20260807-06';
import { applyKeypadKey, formatReceivedText, getQuickCashOptions, parseReceivedAmount } from '../../utils/payment-keypad.js?v=20260807-10';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-21';
import { renderFechamentoRapidoModal } from '../../components/fechamento-rapido-modal.component.js?v=20260807-21';
import { buildClosingSummary, buildShowcaseConference, confirmClosing, saveClosingDraft } from '../../services/cash-closing.service.js?v=20260804-06';
import { getActiveComanda, addItem, addItemQuantity, clearComanda, removeItem, updateQuantity } from '../../services/comanda.service.js?v=20260804-06';
import { createPeriodFilter, getCrmSummary } from '../../services/crm-dashboard.service.js?v=20260804-06';
import { getCategories, getFavoriteProducts, getProductById, searchProducts } from '../../services/product.service.js?v=20260804-06';
import { finalizeComandaPayment, getBestSellingProducts } from '../../services/transaction.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { escapeHtml, qs } from '../../utils/dom.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { getShowcaseStockByProductId } from '../../services/showcase-stock.service.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { hasPermission } from '../../services/permission.service.js?v=20260804-06';
import { getCashSession, isCashSessionOpen } from '../../services/cash-session.service.js?v=20260804-06';
import { renderCashActionButtons, renderCashMovementModal, renderWriteOffModal, submitCashMovementForm, submitWriteOffForm } from '../../components/cash-actions.component.js?v=20260807-21';

const CATEGORY_ALL = 'todos';
const CATEGORY_FAVORITES = '__favoritos';
const CATEGORY_BEST_SELLERS = '__mais-vendidos';
const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 10;
// O OK da confirmacao fica onde estava "Finalizar venda": o segundo clique de
// um duplo clique fecharia a confirmacao (com o troco) antes de ser lida.
const SALE_SUCCESS_CLICK_GUARD_MS = 600;
const CASH_CLOSED_MESSAGE = 'Abra o caixa do dia antes de registrar vendas.';

const state = {
  query: '',
  categoryId: CATEGORY_ALL,
  modal: null,
  paymentMethod: 'dinheiro',
  receivedText: '',
  receivedFresh: true,
  quantityProductId: null,
  saleSuccess: null,
  quickClosingTab: 'resumo',
  quickClosing: createEmptyQuickClosing()
};
const boundContainers = new WeakSet();

export function initVendasModule(container) {
  renderScreen(container);

  if (!boundContainers.has(container)) {
    bindEvents(container);
    on(UI_EVENTS.showcaseStockChanged, () => {
      if (container.querySelector('.pdv-screen')) {
        renderProducts(container);
      }
    });
    boundContainers.add(container);
  }
}

function renderScreen(container) {
  const cashOpen = isCashSessionOpen();

  container.innerHTML = `
    <section class="pdv-screen fc${cashOpen ? '' : ' is-cash-closed'}">
      <main class="fc-main">
        <header class="fc-bar">
          <h1 class="fc-title">Frente de caixa</h1>
          <label class="fc-search">
            ${icon('search')}
            <span class="sr-only">Buscar produto</span>
            <input id="product-search" type="search" placeholder="Buscar produto" autocomplete="off" value="${escapeHtml(state.query)}">
          </label>
          <div class="fc-bar__actions">
            ${renderCashActionButtons(getCurrentUser(), { includeQuickClosing: true })}
          </div>
        </header>
        ${cashOpen ? '' : '<div class="cash-session-alert fc-alert" role="status">Caixa fechado. Abra o caixa antes de registrar uma venda.</div>'}
        <div class="fc-cats" data-category-tabs></div>
        <div class="fc-grid" data-product-grid></div>
      </main>
      <div class="fc-side" data-order-panel></div>
      <div data-vendas-modal></div>
    </section>
  `;

  renderCategories(container);
  renderProducts(container);
  renderComanda(container);
  renderModal(container);
}

function bindEvents(container) {
  const longPress = { timer: null, card: null, x: 0, y: 0, firedOn: null };

  const cancelLongPress = () => {
    clearTimeout(longPress.timer);
    longPress.timer = null;
    longPress.card = null;
  };

  const findProductCard = (event) => {
    const card = event.target?.closest?.('[data-action="add-product"]');
    return card && event.target.closest('.pdv-screen') ? card : null;
  };

  // Toque longo (500 ms) num cartao abre a quantidade, igual ao antigo "Qtd".
  container.addEventListener('pointerdown', (event) => {
    cancelLongPress();
    longPress.firedOn = null;
    const card = findProductCard(event);

    if (!card || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    longPress.card = card;
    longPress.x = event.clientX;
    longPress.y = event.clientY;
    longPress.timer = setTimeout(() => {
      longPress.timer = null;
      longPress.card = null;
      longPress.firedOn = card;
      openQuantityModal(container, card.dataset.productId);
    }, LONG_PRESS_MS);
  });

  container.addEventListener('pointermove', (event) => {
    if (!longPress.timer) {
      return;
    }

    const movedX = Math.abs(event.clientX - longPress.x);
    const movedY = Math.abs(event.clientY - longPress.y);
    if (movedX > LONG_PRESS_MOVE_TOLERANCE || movedY > LONG_PRESS_MOVE_TOLERANCE) {
      cancelLongPress();
    }
  });

  ['pointerup', 'pointercancel'].forEach((type) => container.addEventListener(type, cancelLongPress));
  // pointerleave e scroll nao sobem pela arvore: escuta na captura.
  container.addEventListener('pointerleave', (event) => {
    if (event.target === longPress.card) {
      cancelLongPress();
    }
  }, true);
  container.addEventListener('scroll', cancelLongPress, true);

  container.addEventListener('contextmenu', (event) => {
    const card = findProductCard(event);

    if (!card) {
      return;
    }

    event.preventDefault();

    // No toque, o navegador manda contextmenu perto dos 500 ms: abre uma vez so.
    if (longPress.firedOn === card) {
      return;
    }

    // Se o dedo ainda esta no cartao, o clique que vem ao soltar nao deve somar 1.
    // Botao direito e tecla de menu nao geram esse clique.
    if (longPress.card === card) {
      longPress.firedOn = card;
    }

    cancelLongPress();
    openQuantityModal(container, card.dataset.productId);
  });

  container.addEventListener('input', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    if (event.target.id === 'product-search') {
      state.query = event.target.value;
      renderProducts(container);
    }

    if (event.target.matches('[name="receivedAmount"]')) {
      // Digitacao direta: o texto fica como esta (aceita virgula) e so o troco e recalculado.
      state.receivedText = event.target.value;
      state.receivedFresh = false;
      renderPaymentChange(container);
    }

    if (event.target.matches('[data-quick-note]')) {
      state.quickClosing.note = event.target.value;
    }
  });

  container.addEventListener('click', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    const keypadButton = event.target.closest('[data-keypad-key]');
    if (keypadButton) {
      event.stopPropagation();
      // O valor sugerido (total ou cedula) e substituido na primeira tecla, como texto selecionado.
      const key = keypadButton.dataset.keypadKey;
      const current = state.receivedFresh ? '' : state.receivedText;
      setReceivedText(container, applyKeypadKey(current, key), false);
      return;
    }

    const quickCashButton = event.target.closest('[data-quick-cash]');
    if (quickCashButton) {
      event.stopPropagation();
      setReceivedText(container, formatReceivedText(quickCashButton.dataset.quickCash), true);
      return;
    }

    const categoryButton = event.target.closest('[data-category-id]');
    const actionButton = event.target.closest('[data-action]');
    const followsLongPress = Boolean(actionButton) && longPress.firedOn === actionButton;
    longPress.firedOn = null;

    if (categoryButton) {
      event.stopPropagation();
      state.categoryId = categoryButton.dataset.categoryId;
      renderCategories(container);
      renderProducts(container);
      return;
    }

    const quickTab = event.target.closest('[data-quick-closing-tab]');
    if (quickTab) {
      state.quickClosingTab = quickTab.dataset.quickClosingTab;
      renderModal(container);
      return;
    }

    if (actionButton?.dataset.action === 'add-product') {
      // O clique que segue um toque longo ja abriu a quantidade: nao soma 1.
      if (followsLongPress) {
        return;
      }
      if (!isCashSessionOpen()) { showNotification({ title: 'Caixa fechado', message: CASH_CLOSED_MESSAGE, type: 'warning' }); return; }
      const product = getProductById(actionButton.dataset.productId);
      warnIfProductOutOfStock(product);
      addItem(product);
      renderComanda(container);
      return;
    }

    if (actionButton?.dataset.action === 'open-quantity') {
      openQuantityModal(container, actionButton.dataset.productId);
      return;
    }

    if (actionButton) {
      event.stopPropagation();
      handleOrderAction(actionButton, container);
    }
  });

  container.addEventListener('change', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    if (event.target.matches('[name="paymentMethod"]')) {
      state.paymentMethod = event.target.value;
      renderModal(container);
      qs('[name="paymentMethod"]:checked', container)?.focus?.();
    }

    if (event.target.matches('[data-quick-payment]')) {
      state.quickClosing[event.target.dataset.quickPayment] = event.target.value;
      renderModal(container);
    }

    if (event.target.matches('[data-quick-leftover]')) {
      state.quickClosing.leftovers[event.target.dataset.quickLeftover] = event.target.value;
      renderModal(container);
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    if (event.target.matches('[data-payment-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        const sale = finalizeComandaPayment({
          paymentMethod: data.get('paymentMethod'),
          receivedAmount: parseReceivedAmount(data.get('receivedAmount'))
        });
        state.saleSuccess = sale;
        state.saleSuccessShownAt = performance.now();
        state.modal = 'sale-success';
        renderComanda(container);
        renderModal(container);
      } catch (error) {
        showNotification({
          title: 'Nao foi possivel finalizar',
          message: error.message || 'Confira a comanda e o pagamento.',
          type: 'danger'
        });
      }
    }

    if (event.target.matches('[data-cash-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      submitCashMovementForm(data).then((saved) => {
        if (saved) {
          state.modal = null;
          renderModal(container);
        }
      });
    }

    if (event.target.matches('[data-write-off-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      submitWriteOffForm(data).then((saved) => {
        if (saved) {
          state.modal = null;
          renderModal(container);
        }
      });
    }

    if (event.target.matches('[data-quantity-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        const product = getProductById(state.quantityProductId);
        warnIfProductOutOfStock(product);
        addItemQuantity(product, data.get('quantity'));
        state.modal = null;
        state.quantityProductId = null;
        renderComanda(container);
        renderModal(container);
      } catch (error) {
        showNotification({
          title: 'Quantidade invalida',
          message: error.message || 'Informe uma quantidade maior que zero.',
          type: 'danger'
        });
      }
    }
  });
}

function renderCategories(container) {
  const target = qs('[data-category-tabs]', container);

  if (!target) {
    return;
  }

  const categories = [
    { id: CATEGORY_ALL, name: 'Todos' },
    { id: CATEGORY_BEST_SELLERS, name: 'Mais vendidos' },
    { id: CATEGORY_FAVORITES, name: 'Favoritos' },
    ...getCategories().filter((category) => category.id !== CATEGORY_ALL)
  ];

  target.innerHTML = categories.map((category) => {
    const isActive = category.id === state.categoryId;
    return `
    <button
      class="fc-chip${isActive ? ' is-on' : ''}"
      type="button"
      aria-pressed="${isActive}"
      data-category-id="${escapeHtml(category.id)}"
    >${escapeHtml(category.name)}</button>
  `;
  }).join('');
}

function renderProducts(container) {
  const target = qs('[data-product-grid]', container);

  if (!target) {
    return;
  }

  // Lista completa, sem filtro: a cor da categoria fica igual em todas as telas.
  const categories = getCategories();
  const products = getVisibleProducts();

  if (!products.length) {
    target.innerHTML = '<div class="fc-empty">Nenhum produto encontrado.</div>';
    return;
  }

  const quantities = getOrderQuantities();
  target.innerHTML = products.map((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    const showcaseStock = getShowcaseStockByProductId(product.id).quantityAvailable;
    return renderProductCard({ ...product, showcaseStock }, category ? category.name : 'Sem categoria', {
      colorVar: category ? getCategoryColorVar(category, categories) : 'var(--muted)',
      quantityInOrder: quantities.get(product.id) || 0
    });
  }).join('');
}

function getOrderQuantities() {
  const quantities = new Map();
  getActiveComanda().items.forEach((item) => {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + Number(item.quantity || 0));
  });
  return quantities;
}

// Atualiza so o contorno e o circulo de quantidade dos cartoes ja na tela,
// sem redesenhar a grade a cada item somado.
function syncProductQuantities(container) {
  const grid = qs('[data-product-grid]', container);

  if (typeof grid?.querySelectorAll !== 'function') {
    return;
  }

  const quantities = getOrderQuantities();
  grid.querySelectorAll('[data-action="add-product"]').forEach((card) => {
    const quantity = quantities.get(card.dataset.productId) || 0;
    let badge = card.querySelector('.fc-card__qty');
    card.classList.toggle('is-in', quantity > 0);

    if (quantity <= 0) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'fc-card__qty';
      card.prepend(badge);
    }
    badge.textContent = String(quantity);
  });
}

function openQuantityModal(container, productId) {
  if (!isCashSessionOpen()) {
    showNotification({ title: 'Caixa fechado', message: CASH_CLOSED_MESSAGE, type: 'warning' });
    return;
  }

  state.modal = 'quantity';
  state.quantityProductId = productId;
  renderModal(container);
}

function getVisibleProducts() {
  if (state.categoryId === CATEGORY_BEST_SELLERS) {
    return filterProductsByCurrentQuery(getActiveBestSellingProducts());
  }

  if (state.categoryId === CATEGORY_FAVORITES) {
    return filterProductsByCurrentQuery(getFavoriteProducts());
  }

  return searchProducts({ query: state.query, categoryId: state.categoryId });
}

function filterProductsByCurrentQuery(products) {
  if (!state.query) {
    return products;
  }

  const matchingIds = new Set(searchProducts({ query: state.query, categoryId: CATEGORY_ALL }).map((product) => product.id));
  return products.filter((product) => matchingIds.has(product.id));
}

function getActiveBestSellingProducts() {
  return getBestSellingProducts()
    .map((item) => getProductById(item.productId))
    .filter((product) => product?.active);
}

function renderComanda(container) {
  const target = qs('[data-order-panel]', container);

  if (!target) {
    return;
  }

  target.innerHTML = gateOrderPanelActions(renderOrderPanel(getActiveComanda()));
  syncProductQuantities(container);
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
}

// + Entrada e - Saida sairam da comanda (vao no cabecalho, com a mesma permissao).
function gateOrderPanelActions(markup) {
  if (canCurrentUser('sales.create')) {
    return markup;
  }

  return markup.replace(/<button\b[^>]*data-action="open-payment"[^>]*>[\s\S]*?<\/button>/, '');
}

function handleOrderAction(actionButton, container) {
  const action = actionButton.dataset.action;
  const productId = actionButton.dataset.productId;
  const comanda = getActiveComanda();
  const item = comanda.items.find((currentItem) => currentItem.productId === productId);

  if (action === 'increase' && item) {
    updateQuantity(productId, item.quantity + 1);
  }

  if (action === 'decrease' && item) {
    updateQuantity(productId, item.quantity - 1);
  }

  if (action === 'remove') {
    removeItem(productId);
  }

  if (action === 'clear-order') {
    clearComanda();
  }

  if (action === 'open-payment') {
    state.modal = 'payment';
    state.paymentMethod = 'dinheiro';
    state.receivedText = formatReceivedText(getComandaTotal());
    state.receivedFresh = true;
  }

  if (action === 'open-entry') {
    state.modal = 'entrada';
  }

  if (action === 'open-output') {
    state.modal = 'saida';
  }

  if (action === 'close-modal') {
    state.modal = null;
    state.quantityProductId = null;
    state.saleSuccess = null;
  }

  if (action === 'close-sale-success') {
    if (performance.now() - (state.saleSuccessShownAt || 0) < SALE_SUCCESS_CLICK_GUARD_MS) {
      return;
    }
    state.modal = null;
    state.quantityProductId = null;
    state.saleSuccess = null;
    state.query = '';
    state.categoryId = CATEGORY_ALL;
    setActiveSalesMenu();
    renderScreen(container);
    return;
  }

  if (action === 'open-write-off') {
    state.modal = 'write-off';
  }

  if (action === 'open-quick-closing') {
    state.modal = 'quick-closing';
    state.quickClosingTab = 'resumo';
  }

  if (action === 'confirm-quick-closing') {
    confirmQuickClosing(container);
    return;
  }

  renderComanda(container);
  renderModal(container);
}

function renderModal(container) {
  const target = qs('[data-vendas-modal]', container);

  if (!target) {
    return;
  }

  if (!state.modal) {
    target.innerHTML = '';
    return;
  }

  if (state.modal === 'quantity') {
    target.innerHTML = renderQuantityModal();
    return;
  }

  if (state.modal === 'payment') {
    target.innerHTML = renderPaymentModal();
    return;
  }

  if (state.modal === 'sale-success') {
    target.innerHTML = renderSaleSuccessModal();
    return;
  }

  if (state.modal === 'write-off') {
    target.innerHTML = renderWriteOffModal();
    return;
  }

  if (state.modal === 'quick-closing') {
    const summary = getCrmSummary(createPeriodFilter('today'));
    const closingSummary = buildClosingSummary(buildQuickClosingInput(summary, {
      countedCash: state.quickClosing.countedCash,
      checkedPix: state.quickClosing.checkedPix,
      checkedDebit: state.quickClosing.checkedDebit,
      checkedCredit: state.quickClosing.checkedCredit,
      leftovers: state.quickClosing.leftovers
    }));
    target.innerHTML = renderFechamentoRapidoModal({
      summary,
      closingSummary,
      showcase: buildShowcaseConference(state.quickClosing.leftovers),
      state
    });
    return;
  }

  target.innerHTML = renderCashMovementModal(state.modal);
}

function renderSaleSuccessModal() {
  const sale = state.saleSuccess;

  if (!sale) {
    return '';
  }

  return `
    <div class="modal-backdrop modal-backdrop--soft is-open">
      <div class="modal sale-success-modal" role="dialog" aria-modal="true">
        <header class="sale-success-header">
          <div>
            <span>Venda finalizada</span>
            <h2>Comanda ${sale.comandaNumber}</h2>
          </div>
          <strong>${formatCurrency(sale.total)}</strong>
        </header>
        <div class="sale-success-body">
          <section class="sale-success-list">
            ${sale.items.map((item) => `
              <div class="sale-success-item">
                <div>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span>${item.quantity} x ${formatCurrency(item.unitPrice)}</span>
                </div>
                <strong>${formatCurrency(item.total)}</strong>
              </div>
            `).join('')}
          </section>
          <section class="sale-success-totals">
            ${renderSaleSuccessLine('Forma de pagamento', getPaymentLabel(sale.paymentMethod))}
            ${renderSaleSuccessLine('Total da comanda', formatCurrency(sale.total))}
            ${sale.paymentMethod === 'dinheiro' ? renderSaleSuccessLine('Valor recebido', formatCurrency(sale.receivedAmount)) : ''}
            ${sale.paymentMethod === 'dinheiro' ? renderSaleSuccessLine('Troco', formatCurrency(sale.change), 'sale-success-change') : ''}
          </section>
          <button class="button sale-success-ok" type="button" data-action="close-sale-success">OK</button>
        </div>
      </div>
    </div>
  `;
}

function renderSaleSuccessLine(label, value, className = '') {
  return `
    <div class="sale-success-line ${className}">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function confirmQuickClosing(container) {
  try {
    const summary = getCrmSummary(createPeriodFilter('today'));
    const closingInput = buildQuickClosingInput(summary, {
      countedCash: state.quickClosing.countedCash,
      checkedPix: state.quickClosing.checkedPix,
      checkedDebit: state.quickClosing.checkedDebit,
      checkedCredit: state.quickClosing.checkedCredit,
      leftovers: state.quickClosing.leftovers,
      note: state.quickClosing.note
    });
    const draft = saveClosingDraft({
      ...closingInput,
      differences: buildQuickClosingDifferences()
    });
    confirmClosing(draft);
    showNotification({
      title: 'Caixa fechado',
      message: 'Fechamento rapido salvo no historico.',
      type: 'success'
    });
    state.modal = null;
    state.quickClosing = createEmptyQuickClosing();
    state.quickClosingTab = 'resumo';
    renderComanda(container);
    renderModal(container);
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel fechar',
      message: error.message || 'Confira os campos do fechamento.',
      type: 'danger'
    });
  }
}

function buildQuickClosingDifferences() {
  const crmSummary = getCrmSummary(createPeriodFilter('today'));
  const summary = buildClosingSummary(buildQuickClosingInput(crmSummary, {
    countedCash: state.quickClosing.countedCash,
    checkedPix: state.quickClosing.checkedPix,
    checkedDebit: state.quickClosing.checkedDebit,
    checkedCredit: state.quickClosing.checkedCredit,
    leftovers: state.quickClosing.leftovers
  }));
  const differences = [];

  if (summary.payments.generalDifference) {
    differences.push({
      scope: 'payment',
      referenceId: 'geral',
      reason: 'fechamento-rapido',
      note: state.quickClosing.note,
      amount: summary.payments.generalDifference
    });
  }

  summary.showcase.forEach((item) => {
    if (!item.differenceQuantity) {
      return;
    }

    differences.push({
      scope: 'showcase',
      referenceId: item.productId,
      reason: 'fechamento-rapido',
      note: state.quickClosing.note,
      quantity: item.differenceQuantity,
      amount: item.estimatedDifferenceValue || 0
    });
  });

  return differences;
}

// O Fechamento rapido e sempre do dia: inclui o troco inicial da sessao aberta.
export function buildQuickClosingInput(summary, input = {}) {
  return {
    ...input,
    expectedCash: normalizeClosingMoney(Number(getCashSession()?.openingAmount || 0)
      + Number(summary?.paymentTotals?.dinheiro || 0)
      + Number(summary?.entriesTotal || 0)
      - Number(summary?.outputsTotal || 0)),
    expectedPix: normalizeClosingMoney(summary?.paymentTotals?.pix),
    expectedDebit: normalizeClosingMoney(summary?.paymentTotals?.debito),
    expectedCredit: normalizeClosingMoney(summary?.paymentTotals?.credito)
  };
}

function normalizeClosingMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function createEmptyQuickClosing() {
  return {
    countedCash: '',
    checkedPix: '',
    checkedDebit: '',
    checkedCredit: '',
    leftovers: {},
    note: ''
  };
}

function renderQuantityModal() {
  const product = getProductById(state.quantityProductId);

  if (!product) {
    return '';
  }

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Adicionar quantidade</h2>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">X</button>
        </header>
        <form class="product-form" data-quantity-form>
          <div class="payment-total">
            <span>${escapeHtml(product.name)}</span>
            <strong>${formatCurrency(product.price)}</strong>
          </div>
          <label class="stacked-label">
            Quantidade
            <input class="field" name="quantity" type="number" min="1" step="1" value="1" required>
          </label>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
            <button class="button" type="submit">Adicionar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function getComandaTotal() {
  return getActiveComanda().items.reduce((total, item) => total + item.total, 0);
}

const PAYMENT_METHODS = [
  { id: 'dinheiro', icon: 'cash' },
  { id: 'pix', icon: 'pix' },
  { id: 'debito', icon: 'card' },
  { id: 'credito', icon: 'card' }
];

const KEYPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];

// Quanto falta (ou sobra) para o valor digitado. Compara em centavos para nao errar por ponto flutuante.
function getPaymentBalance(total, receivedText) {
  const received = parseReceivedAmount(receivedText);
  const diffCents = Math.round(received * 100) - Math.round(total * 100);

  return {
    received,
    missing: diffCents < 0 ? -diffCents / 100 : 0,
    change: diffCents > 0 ? diffCents / 100 : 0,
    isShort: diffCents < 0
  };
}

function renderPaymentModal() {
  const comanda = getActiveComanda();
  const total = getComandaTotal();
  const needsCash = state.paymentMethod === 'dinheiro';
  const balance = getPaymentBalance(total, state.receivedText);
  const itemCount = comanda.items.reduce((count, item) => count + (Number(item.quantity) || 0), 0);
  const hasNumber = comanda.number !== undefined && comanda.number !== null && comanda.number !== '';
  const title = hasNumber ? `Receber comanda ${escapeHtml(comanda.number)}` : 'Receber comanda';
  const canSubmit = !needsCash || !balance.isShort;

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--pay" role="dialog" aria-modal="true" aria-labelledby="pay-title">
        <header class="modal__header">
          <h2 id="pay-title">${title} <span>${itemCount} ${itemCount === 1 ? 'item' : 'itens'}</span></h2>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">×</button>
        </header>
        <form class="product-form pay" data-payment-form>
          <div class="pay__main">
            <div class="pay__due"><span>Total a receber</span><b>${formatCurrency(total)}</b></div>
            <fieldset class="pay__methods">
              <legend class="pay__sr">Forma de pagamento</legend>
              ${PAYMENT_METHODS.map(({ id, icon: iconName }) => `
                <label class="pay__method${state.paymentMethod === id ? ' is-selected' : ''}">
                  <input type="radio" name="paymentMethod" value="${id}"${state.paymentMethod === id ? ' checked' : ''}>
                  ${icon(iconName)}
                  <span>${getPaymentLabel(id)}</span>
                </label>
              `).join('')}
            </fieldset>
            ${needsCash ? `
              <label class="pay__field">
                <span>Valor recebido</span>
                <input class="field pay__input" name="receivedAmount" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(state.receivedText)}">
              </label>
              <div data-pay-live>${renderPaymentLive(total, balance)}</div>
            ` : `
              <p class="pay__note" role="note">Confirme o pagamento na maquininha ou no app do banco antes de finalizar.</p>
            `}
          </div>
          ${needsCash ? `
            <div class="pay__keypad" role="group" aria-label="Teclado numérico">
              ${KEYPAD_KEYS.map((key) => key === 'back'
                ? '<button type="button" data-keypad-key="back" aria-label="Apagar">⌫</button>'
                : `<button type="button" data-keypad-key="${key}">${key}</button>`).join('')}
            </div>
          ` : ''}
          <div class="pay__acts">
            <button class="ui-btn" type="button" data-action="close-modal">Cancelar</button>
            <button class="ui-btn ui-btn--primary pay__submit" type="submit" data-pay-submit${canSubmit ? '' : ' disabled'}>Finalizar venda</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

// Parte que muda a cada tecla: cedulas rapidas e troco (ou quanto falta).
function renderPaymentLive(total, balance) {
  const options = [
    { value: total, label: 'Exato' },
    ...getQuickCashOptions(total).map((value) => ({ value, label: formatCurrency(value).replace(/,00$/, '') }))
  ];

  return `
    <div class="pay__quick">
      ${options.map(({ value, label }) => {
        const isOn = Math.round(balance.received * 100) === Math.round(value * 100);
        return `<button type="button"${isOn ? ' class="is-on"' : ''} aria-pressed="${isOn}" data-quick-cash="${String(value)}">${label}</button>`;
      }).join('')}
    </div>
    <div class="pay__change${balance.isShort ? ' is-short' : ''}" role="status">
      <span>${balance.isShort ? 'Faltam' : 'Troco'}</span>
      <b>${formatCurrency(balance.isShort ? balance.missing : balance.change)}</b>
    </div>
  `;
}

function renderPaymentChange(container) {
  const live = qs('[data-pay-live]', container);

  if (!live) {
    return;
  }

  const total = getComandaTotal();
  const balance = getPaymentBalance(total, state.receivedText);
  live.innerHTML = renderPaymentLive(total, balance);

  const submit = qs('[data-pay-submit]', container);
  if (submit) {
    submit.disabled = state.paymentMethod === 'dinheiro' && balance.isShort;
  }
}

// Teclado e cedulas mudam o texto do campo e recalculam o troco sem redesenhar o modal.
function setReceivedText(container, text, fresh) {
  state.receivedText = text;
  state.receivedFresh = fresh;

  const input = qs('[name="receivedAmount"]', container);
  if (input) {
    input.value = text;
  }

  renderPaymentChange(container);
}

function getPaymentLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    debito: 'Débito',
    credito: 'Crédito',
    pix: 'Pix'
  };

  return labels[method];
}

function setActiveSalesMenu() {
  document.querySelectorAll('[data-menu-id]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.menuId === 'frente-caixa');
  });
}

function warnIfProductOutOfStock(product) {
  if (!product) {
    return;
  }

  const stock = getShowcaseStockByProductId(product.id).quantityAvailable;
  if (stock > 0) {
    return;
  }

  showNotification({
    title: 'Produto sem estoque',
    message: 'Atencao: este produto esta sem estoque na vitrine.',
    type: 'warning'
  });
}
