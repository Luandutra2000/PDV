import { renderOrderPanel } from '../../components/order-panel.component.js';
import { renderProductCard } from '../../components/product-card.component.js';
import { getActiveComanda, addItem, clearComanda, removeItem, updateQuantity } from '../../services/comanda.service.js';
import { getCategories, getProductById, searchProducts } from '../../services/product.service.js';
import { finalizeComandaPayment, registerCashMovement } from '../../services/transaction.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { qs } from '../../utils/dom.js';
import { showNotification } from '../../services/notification.service.js';
import { createShowcaseWriteOff, getTodayShowcaseProducts } from '../../services/estoque.service.js';

const state = {
  query: '',
  categoryId: 'todos',
  modal: null,
  paymentMethod: 'dinheiro'
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
            <button class="button button--danger" type="button" data-action="open-write-off">Perda / Consumo</button>
          </div>
        </header>
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
  });

  container.addEventListener('click', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    const categoryButton = event.target.closest('[data-category-id]');
    const productButton = event.target.closest('[data-product-id]');
    const actionButton = event.target.closest('[data-action]');

    if (categoryButton) {
      state.categoryId = categoryButton.dataset.categoryId;
      renderCategories(container);
      renderProducts(container);
      return;
    }

    if (productButton && productButton.classList.contains('product-card')) {
      const product = getProductById(productButton.dataset.productId);
      addItem(product);
      renderComanda(container);
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
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest('.pdv-screen')) {
      return;
    }

    if (event.target.matches('[data-payment-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);
      finalizeComandaPayment({
        paymentMethod: data.get('paymentMethod'),
        receivedAmount: data.get('receivedAmount')
      });
      const change = qs('[data-change-value]', container)?.textContent || formatCurrency(0);
      showNotification({
        title: 'Comanda finalizada',
        message: `Troco: ${change}`,
        type: 'success'
      });
      state.modal = null;
      renderComanda(container);
      renderModal(container);
    }

    if (event.target.matches('[data-cash-form]')) {
      event.preventDefault();
      const data = new FormData(event.target);
      registerCashMovement({
        type: data.get('type'),
        amount: data.get('amount'),
        description: data.get('description')
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
  });
}

function renderCategories(container) {
  const target = qs('[data-category-tabs]', container);
  const categories = getCategories();

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

function renderProducts(container) {
  const target = qs('[data-product-grid]', container);
  const categories = getCategories();
  const products = searchProducts({ query: state.query, categoryId: state.categoryId });

  if (!products.length) {
    target.innerHTML = '<div class="empty-products">Nenhum produto encontrado.</div>';
    return;
  }

  target.innerHTML = products.map((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    return renderProductCard(product, category ? category.name : 'Sem categoria');
  }).join('');
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
  }

  if (action === 'open-write-off') {
    state.modal = 'write-off';
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

  if (state.modal === 'payment') {
    target.innerHTML = renderPaymentModal();
    renderPaymentChange(container);
    return;
  }

  if (state.modal === 'write-off') {
    target.innerHTML = renderWriteOffModal();
    return;
  }

  target.innerHTML = renderCashMovementModal(state.modal);
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
              <label>
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
