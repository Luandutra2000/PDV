import { formatCurrency } from '../utils/currency.js';

export function renderProductCard(product, categoryName = '') {
  return `
    <button class="product-card" type="button" data-product-id="${product.id}">
      <span>
        <h3 class="product-card__name">${product.name}</h3>
        <span class="product-card__meta">${categoryName} - Estoque ${product.stock}</span>
      </span>
      <strong class="product-card__price">${formatCurrency(product.price)}</strong>
    </button>
  `;
}

export function renderItemAvulsoCard() {
  return `
    <button class="item-avulso-card" type="button" data-action="item-avulso">
      + Item avulso
    </button>
  `;
}
