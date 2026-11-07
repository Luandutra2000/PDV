import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';

const LOW_STOCK_LIMIT = 3;

// Cartao da frente de caixa (visual B claro): um unico botao. Toque simples
// adiciona 1; o toque longo (tratado em vendas.module.js) abre a quantidade.
export function renderProductCard(product, categoryName = '', { colorVar = 'var(--muted)', quantityInOrder = 0 } = {}) {
  const productId = escapeHtml(product.id);
  const stock = Number(product.showcaseStock ?? product.stock ?? 0) || 0;
  const visibleStock = Math.max(stock, 0);
  const isOut = visibleStock <= 0;
  const quantity = Math.max(Number(quantityInOrder) || 0, 0);
  const classes = ['fc-card', isOut ? 'is-out' : '', quantity > 0 ? 'is-in' : ''].filter(Boolean).join(' ');

  return `
    <button class="${classes}" type="button" style="--c: ${escapeHtml(colorVar)}" data-action="add-product" data-product-id="${productId}" data-stock-state="${isOut ? 'empty' : 'available'}">
      ${quantity > 0 ? `<span class="fc-card__qty">${quantity}</span>` : ''}
      <span class="fc-card__name">${escapeHtml(product.name)}</span>
      ${categoryName ? `<span class="sr-only">${escapeHtml(categoryName)}</span>` : ''}
      ${renderStock(visibleStock)}
      <span class="fc-card__price">${formatCurrency(product.price)}</span>
    </button>
  `;
}

function renderStock(stock) {
  if (stock <= 0) {
    return '<span class="fc-card__stock">Esgotado</span>';
  }

  if (stock <= LOW_STOCK_LIMIT) {
    return `<span class="fc-card__stock is-low">${stock} ${stock === 1 ? 'restante' : 'restantes'}</span>`;
  }

  return `<span class="fc-card__stock">${stock} em estoque</span>`;
}
