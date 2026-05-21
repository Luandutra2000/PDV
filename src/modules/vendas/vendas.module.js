import { renderOrderPanel } from '../../components/order-panel.component.js';
import { renderProductCard } from '../../components/product-card.component.js';
import { renderFechamentoRapidoModal } from '../../components/fechamento-rapido-modal.component.js';
import { buildClosingSummary, buildShowcaseConference, confirmClosing, saveClosingDraft } from '../../services/cash-closing.service.js';
import { getActiveComanda, addItem, addItemQuantity, clearComanda, removeItem, updateQuantity } from '../../services/comanda.service.js';
import { createPeriodFilter, getCrmSummary } from '../../services/crm-dashboard.service.js';
import { getCategories, getFavoriteProducts, getProductById, searchProducts } from '../../services/product.service.js';
import { finalizeComandaPayment, getBestSellingProducts, registerCashMovement } from '../../services/transaction.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { qs } from '../../utils/dom.js';
import { showNotification } from '../../services/notification.service.js';
import { createShowcaseWriteOff, getTodayShowcaseProducts } from '../../services/estoque.service.js';

const CATEGORY_ALL = 'todos';
const CATEGORY_FAVORITES = '__favoritos';
const CATEGORY_BEST_SELLERS = '__mais-vendidos';
const ENTRY_CATEGORIES = ['Reforco de caixa', 'Pagamento de cliente', 'Dinheiro extra', 'Ajuste manual', 'Outros'];
const OUTPUT_CATEGORIES = ['Compra de material', 'Compra de ingredientes', 'Pagamento de fornecedor', 'Despesa operacional', 'Retirada do dono', 'Troco', 'Manutencao', 'Outros'];

const state = {
  query: '',
  categoryId: CATEGORY_ALL,
  modal: null,
  paymentMethod: 'dinheiro',
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
    boundContainers.add(container);
  }
}

function renderScreen(container) {
  container.innerHTML = `
    <section class="pdv-screen">
      <main class="pdv-main">
        <header class="pdv-header">
          <h1 class="pdv-title">Frente de Caixa</h1>
          <div class="pdv-actions">
            <label class="sr-only" for="product-search">Buscar produto</label>
            <input id="product-search" class="field" type="search" placeholder="Buscar produto..." value="${state.query}">
            <button class="button button--ghost" type="button" data-action="open-quick-closing">Fechamento Rapido</button>
            <button class="button button--danger" type="button" data-action="open-write-off">Perda / Consumo</button>
          </div>
        </header>
        ${renderQuickAccess()}
        <section class="products-panel">
          <div class="category-tabs" data-category-tabs></div>
          <div class="product-grid" data-product-grid></div>
        </section>
      </main>
      <div data-order-panel></div>
      <div data-vendas-modal></div>
    </section>
  `;

  renderCategories(container);
  renderProducts(container);
  renderComanda(container);
  renderModal(container);
}

function bindEvents(container) {
  container.addEventListener('input', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    if (event.target.id === 'product-search') {
      state.query = event.target.value;
      renderProducts(container);
    }

    if (event.target.matches('[name="receivedAmount"]')) {
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

    const categoryButton = event.target.closest('[data-category-id]');
    const actionButton = event.target.closest('[data-action]');

    if (categoryButton) {
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
      const product = getProductById(actionButton.dataset.productId);
      addItem(product);
      renderComanda(container);
      return;
    }

    if (actionButton?.dataset.action === 'quick-add') {
      try {
        const product = getProductById(actionButton.dataset.productId);
        addItemQuantity(product, actionButton.dataset.quantity);
        renderComanda(container);
      } catch (error) {
        showNotification({
          title: 'Quantidade invalida',
          message: error.message || 'Informe uma quantidade maior que zero.',
          type: 'danger'
        });
      }
      return;
    }

    if (actionButton?.dataset.action === 'open-quantity') {
      state.modal = 'quantity';
      state.quantityProductId = actionButton.dataset.productId;
      renderModal(container);
      return;
    }

    if (actionButton) {
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
          receivedAmount: data.get('receivedAmount')
        });
        state.saleSuccess = sale;
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
      registerCashMovement({
        type: data.get('type'),
        amount: data.get('amount'),
        category: data.get('category'),
        description: data.get('description'),
        userName: 'Operador local'
      });
      showNotification({
        title: data.get('type') === 'entrada' ? 'Entrada registrada' : 'Saida registrada',
        message: `${formatCurrency(data.get('amount'))} lancado no historico.`,
        type: data.get('type') === 'entrada' ? 'success' : 'danger'
      });
      state.modal = null;
      renderModal(container);
    }

    if (event.target.matches('[data-write-off-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        createShowcaseWriteOff({
          productId: data.get('productId'),
          quantity: data.get('quantity'),
          reason: data.get('reason'),
          note: data.get('note')
        });
        showNotification({
          title: 'Baixa registrada',
          message: 'Perda ou consumo entrou na conferencia da vitrine.',
          type: 'success'
        });
        state.modal = null;
        renderModal(container);
      } catch (error) {
        showNotification({
          title: 'Nao foi possivel registrar',
          message: error.message || 'Confira produto, quantidade e motivo.',
          type: 'danger'
        });
      }
    }

    if (event.target.matches('[data-quantity-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);

      try {
        addItemQuantity(getProductById(state.quantityProductId), data.get('quantity'));
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
  const categories = [
    { id: CATEGORY_ALL, name: 'Todos' },
    { id: CATEGORY_BEST_SELLERS, name: 'Mais vendidos' },
    { id: CATEGORY_FAVORITES, name: 'Favoritos' },
    ...getCategories().filter((category) => category.id !== CATEGORY_ALL)
  ];

  target.innerHTML = categories.map((category) => `
    <button
      class="category-tab ${category.id === state.categoryId ? 'is-active' : ''}"
      type="button"
      data-category-id="${category.id}"
    >
      ${category.name}
    </button>
  `).join('');
}

function renderQuickAccess() {
  const favorites = getFavoriteProducts().slice(0, 4);
  const bestSellers = getActiveBestSellingProducts().slice(0, 4);
  const quickProducts = [...favorites, ...bestSellers]
    .filter((product, index, list) => list.findIndex((item) => item.id === product.id) === index)
    .slice(0, 6);

  if (!quickProducts.length) {
    return '';
  }

  return `
    <section class="quick-access" aria-label="Acesso rapido">
      <div class="quick-access__header">
        <strong>Acesso rapido</strong>
        <span>Favoritos e mais vendidos</span>
      </div>
      <div class="quick-access__list">
        ${quickProducts.map((product) => `
          <button class="quick-access__item" type="button" data-action="add-product" data-product-id="${product.id}">
            <span>${product.name}</span>
            <strong>${formatCurrency(product.price)}</strong>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}

function renderProducts(container) {
  const target = qs('[data-product-grid]', container);
  const categories = getCategories();
  const products = getVisibleProducts();

  if (!products.length) {
    target.innerHTML = '<div class="empty-products">Nenhum produto encontrado.</div>';
    return;
  }

  target.innerHTML = products.map((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    return renderProductCard(product, category ? category.name : 'Sem categoria');
  }).join('');
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
  target.innerHTML = renderOrderPanel(getActiveComanda());
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
    renderPaymentChange(container);
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
    const closingSummary = buildClosingSummary({
      countedCash: state.quickClosing.countedCash,
      checkedPix: state.quickClosing.checkedPix,
      checkedDebit: state.quickClosing.checkedDebit,
      checkedCredit: state.quickClosing.checkedCredit,
      leftovers: state.quickClosing.leftovers
    });
    target.innerHTML = renderFechamentoRapidoModal({
      summary: getCrmSummary(createPeriodFilter('today')),
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
                  <strong>${item.name}</strong>
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
    const draft = saveClosingDraft({
      countedCash: state.quickClosing.countedCash,
      checkedPix: state.quickClosing.checkedPix,
      checkedDebit: state.quickClosing.checkedDebit,
      checkedCredit: state.quickClosing.checkedCredit,
      leftovers: state.quickClosing.leftovers,
      differences: buildQuickClosingDifferences(),
      note: state.quickClosing.note
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
  const summary = buildClosingSummary({
    countedCash: state.quickClosing.countedCash,
    checkedPix: state.quickClosing.checkedPix,
    checkedDebit: state.quickClosing.checkedDebit,
    checkedCredit: state.quickClosing.checkedCredit,
    leftovers: state.quickClosing.leftovers
  });
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
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <form class="product-form" data-quantity-form>
          <div class="payment-total">
            <span>${product.name}</span>
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

function renderWriteOffModal() {
  const showcaseProducts = getTodayShowcaseProducts();

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Perda / Consumo</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        ${showcaseProducts.length ? `
          <form class="product-form" data-write-off-form>
            <label class="stacked-label">
              Produto da vitrine
              <select class="field" name="productId" required>
                ${showcaseProducts.map((product) => `
                  <option value="${product.id}">${product.name} - ${formatCurrency(product.price)}</option>
                `).join('')}
              </select>
            </label>
            <label class="stacked-label">
              Quantidade
              <input class="field" name="quantity" type="number" min="1" step="1" required>
            </label>
            <label class="stacked-label">
              Motivo
              <select class="field" name="reason" required>
                <option value="quebra">Quebra</option>
                <option value="consumo-interno">Consumo interno</option>
                <option value="cortesia">Cortesia</option>
                <option value="vencido">Vencido</option>
                <option value="erro-lancamento">Erro de lancamento</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label class="stacked-label">
              Observacao
              <input class="field" name="note" placeholder="Opcional">
            </label>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
              <button class="button button--danger" type="submit">Registrar baixa</button>
            </div>
          </form>
        ` : `
          <div class="product-form">
            <p class="modal-text">Nenhum produto foi lancado na vitrine hoje. Lance estoque antes de registrar perda ou consumo.</p>
            <div class="form-actions">
              <button class="button" type="button" data-action="close-modal">Entendi</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

function renderPaymentModal() {
  const subtotal = getActiveComanda().items.reduce((total, item) => total + item.total, 0);
  const needsCash = state.paymentMethod === 'dinheiro';

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Receber comanda</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <form class="product-form" data-payment-form>
          <div class="payment-total">
            <span>Total da comanda</span>
            <strong>${formatCurrency(subtotal)}</strong>
          </div>
          <fieldset class="payment-methods">
            <legend>Forma de pagamento</legend>
            ${['dinheiro', 'debito', 'credito', 'pix'].map((method) => `
              <label class="payment-method ${state.paymentMethod === method ? 'is-selected' : ''}">
                <input type="radio" name="paymentMethod" value="${method}" ${state.paymentMethod === method ? 'checked' : ''}>
                ${getPaymentLabel(method)}
              </label>
            `).join('')}
          </fieldset>
          <div ${needsCash ? '' : 'hidden'}>
            <label class="stacked-label">
              Valor recebido
              <input class="field" name="receivedAmount" type="number" min="0" step="0.01" value="${subtotal.toFixed(2)}">
            </label>
            <div class="payment-total">
              <span>Troco</span>
              <strong data-change-value>${formatCurrency(0)}</strong>
            </div>
          </div>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
            <button class="button" type="submit">Finalizar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCashMovementModal(type) {
  const title = type === 'entrada' ? 'Registrar entrada' : 'Registrar saida';
  const categories = type === 'entrada' ? ENTRY_CATEGORIES : OUTPUT_CATEGORIES;

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>${title}</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <form class="product-form" data-cash-form>
          <input type="hidden" name="type" value="${type}">
          <label class="stacked-label">
            Valor
            <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
          </label>
          <label class="stacked-label">
            Categoria
            <select class="field" name="category" required>
              ${categories.map((category) => `<option value="${category}">${category}</option>`).join('')}
            </select>
          </label>
          <label class="stacked-label">
            Descricao
            <input class="field" name="description" placeholder="Ex: Sangria, reforco de caixa">
          </label>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
            <button class="button" type="submit">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderPaymentChange(container) {
  const changeTarget = qs('[data-change-value]', container);
  const receivedInput = qs('[name="receivedAmount"]', container);

  if (!changeTarget || !receivedInput) {
    return;
  }

  const subtotal = getActiveComanda().items.reduce((total, item) => total + item.total, 0);
  const received = Number(receivedInput.value) || 0;
  changeTarget.textContent = formatCurrency(Math.max(received - subtotal, 0));
}

function getPaymentLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    debito: 'Debito',
    credito: 'Credito',
    pix: 'Pix'
  };

  return labels[method];
}

function setActiveSalesMenu() {
  document.querySelectorAll('[data-menu-id]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.menuId === 'frente-caixa');
  });
}
