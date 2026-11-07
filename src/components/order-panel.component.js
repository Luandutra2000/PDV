import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { getSubtotal } from '../services/comanda.service.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';

// Comanda da frente de caixa (visual B claro). + Entrada e - Saida ficam no
// cabecalho da tela (renderCashActionButtons), nao aqui.
export function renderOrderPanel(comanda) {
  const items = comanda?.items || [];
  const subtotal = getSubtotal(comanda);
  const hasNumber = comanda?.number !== undefined && comanda?.number !== null && comanda?.number !== '';
  const title = hasNumber ? `Comanda ${escapeHtml(comanda.number)}` : 'Comanda';
  const body = items.length ? renderOrderItems(items) : renderEmptyState();

  return `
    <aside class="fc-order" aria-label="Comanda">
      <header class="fc-order__head">
        <h2 class="fc-order__title">${title}</h2>
        <button class="fc-order__clear" type="button" data-action="clear-order" ${items.length ? '' : 'disabled'}>Limpar</button>
      </header>
      <div class="fc-order__lines">${body}</div>
      <div class="fc-order__total">
        <span>Total</span>
        <strong>${formatCurrency(subtotal)}</strong>
      </div>
      <div class="fc-order__actions">
        <button class="ui-btn ui-btn--primary fc-pay" type="button" data-action="open-payment" ${subtotal <= 0 ? 'disabled' : ''}>Receber ${formatCurrency(subtotal)}</button>
      </div>
    </aside>
  `;
}

function renderOrderItems(items) {
  return items.map((item) => {
    const productId = escapeHtml(item.productId);
    const name = escapeHtml(item.name);
    return `
    <div class="fc-line">
      <span class="fc-line__name">${name}</span>
      <span class="fc-line__total">${formatCurrency(item.total)}</span>
      <span class="fc-line__unit">${formatCurrency(item.unitPrice)} cada</span>
      <span class="fc-line__step">
        <button type="button" data-action="decrease" data-product-id="${productId}" aria-label="Tirar um de ${name}">&minus;</button>
        <span class="fc-line__qty">${item.quantity}</span>
        <button type="button" data-action="increase" data-product-id="${productId}" aria-label="Pôr mais um de ${name}">+</button>
        <button class="fc-line__remove" type="button" data-action="remove" data-product-id="${productId}" aria-label="Remover ${name}">&times;</button>
      </span>
    </div>
  `;
  }).join('');
}

function renderEmptyState() {
  return `
    <div class="fc-order__empty">
      <strong>Comanda vazia</strong>
      <p>Toque num produto para adicionar.</p>
    </div>
  `;
}
