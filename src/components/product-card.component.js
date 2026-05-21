import { formatCurrency } from '../utils/currency.js';

export function renderProductCard(product, categoryName = '') {
  return `
    <article class="product-card" data-product-card data-product-id="${product.id}">
      <button class="product-card__main" type="button" data-action="add-product" data-product-id="${product.id}">
        <span>
          <h3 class="product-card__name">${product.name}</h3>
          <span class="product-card__meta">${categoryName} - Estoque ${product.stock}</span>
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
