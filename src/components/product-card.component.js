import { formatCurrency } from '../utils/currency.js';
import { escapeHtml } from '../utils/dom.js';

export function renderProductCard(product, categoryName = '') {
  const stock = Number(product.showcaseStock ?? product.stock ?? 0);
  const visibleStock = Math.max(stock, 0);
  const isEmpty = visibleStock <= 0;

  return `
    <article class="product-card ${isEmpty ? 'product-card--empty-stock' : ''}" data-product-card data-product-id="${product.id}" data-stock-state="${isEmpty ? 'empty' : 'available'}">
      <button class="product-card__main" type="button" data-action="add-product" data-product-id="${product.id}">
        <span>
          <h3 class="product-card__name">${escapeHtml(product.name)}</h3>
          <span class="product-card__meta">${categoryName} - Estoque ${visibleStock}</span>
          ${isEmpty ? '<span class="stock-badge stock-badge--empty">Sem estoque</span>' : ''}
        </span>
        <strong class="product-card__price">${formatCurrency(product.price)}</strong>
      </button>
      <div class="product-card__quick-actions" aria-label="Acoes rapidas">
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="2">+2</button>
        <button type="button" data-action="quick-add" data-product-id="${product.id}" data-quantity="5">+5</button>
        <button type="button" data-action="open-quantity" data-product-id="${product.id}">Qtd</button>
      </div>
    </article>
  `;
}
