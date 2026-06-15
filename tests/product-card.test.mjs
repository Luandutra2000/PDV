import { renderProductCard } from '../src/components/product-card.component.js';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const emptyStockHtml = renderProductCard({
  id: 'risole',
  name: 'Risole',
  price: 7,
  stock: 20,
  showcaseStock: 0
}, 'Salgados');

assert(emptyStockHtml.includes('Sem estoque'), 'product card should render Sem estoque tag');
assert(emptyStockHtml.includes('data-stock-state="empty"'), 'product card should mark empty stock state');
assert(emptyStockHtml.includes('Estoque 0'), 'product card should show showcase stock instead of catalog stock');

const availableStockHtml = renderProductCard({
  id: 'coxinha',
  name: 'Coxinha',
  price: 6,
  stock: 0,
  showcaseStock: 4
}, 'Salgados');

assert(!availableStockHtml.includes('Sem estoque'), 'available stock card should not render empty tag');
assert(availableStockHtml.includes('data-stock-state="available"'), 'available stock card should mark available state');
assert(availableStockHtml.includes('Estoque 4'), 'available stock card should show current showcase stock');

console.log('product card stock state ok');
