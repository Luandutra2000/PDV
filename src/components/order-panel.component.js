import { formatCurrency } from '../utils/currency.js';
import { getSubtotal } from '../services/comanda.service.js';

export function renderOrderPanel(comanda) {
  const subtotal = getSubtotal(comanda);
  const body = comanda.items.length ? renderOrderItems(comanda.items) : renderEmptyState();

  return `
    <aside class="order-panel">
      <header class="order-panel__header">
        <h2 class="order-panel__title">Comanda</h2>
      </header>
      <div class="order-panel__body">${body}</div>
      <footer class="order-panel__footer">
        <div class="subtotal-row">
          <span>Subtotal</span>
          <span class="subtotal-value">${formatCurrency(subtotal)}</span>
        </div>
        <div class="cash-actions">
          <button class="button button--success" type="button" data-action="open-entry">+ Entrada</button>
          <button class="button button--danger" type="button" data-action="open-output">- Saida</button>
        </div>
        <div class="order-actions">
          <button class="icon-button" type="button" data-action="clear-order" title="Limpar comanda">L</button>
          <button class="button" type="button" data-action="open-payment" ${subtotal <= 0 ? 'disabled' : ''}>Receber ${formatCurrency(subtotal)}</button>
        </div>
      </footer>
    </aside>
  `;
}

function renderOrderItems(items) {
  return items.map((item) => `
    <article class="order-item">
      <div>
        <h3 class="order-item__name">${item.name}</h3>
        <div class="order-item__price">${formatCurrency(item.unitPrice)} cada</div>
        <div class="order-item__controls">
          <button class="icon-button" type="button" data-action="decrease" data-product-id="${item.productId}">-</button>
          <span class="quantity">${item.quantity}</span>
          <button class="icon-button" type="button" data-action="increase" data-product-id="${item.productId}">+</button>
          <button class="icon-button" type="button" data-action="remove" data-product-id="${item.productId}">x</button>
        </div>
      </div>
      <strong class="order-item__total">${formatCurrency(item.total)}</strong>
    </article>
  `).join('');
}

function renderEmptyState() {
  return `
    <div class="order-empty">
      <div>
        <strong>Vazio</strong>
        <p>Adicione produtos para montar a comanda.</p>
      </div>
    </div>
  `;
}
