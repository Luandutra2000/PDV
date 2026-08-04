const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const productAdapter = await import('../src/services/repositories/product.adapter.js?v=20260804-05');
const categoryAdapter = await import('../src/services/repositories/category.adapter.js?v=20260804-05');

const productRow = productAdapter.toRow({
  id: 'x-burger',
  name: 'X-Burger',
  categoryId: 'lanches',
  price: '16.50',
  cost: '7.25',
  stock: '12',
  active: true,
  aliases: ['burger', 'x'],
  favorite: true
});

assert(productRow.category_id === 'lanches', 'product categoryId should map to category_id');
assert(productRow.price === 16.5, 'product price should be numeric');
assert(productRow.cost === 7.25, 'product cost should be numeric');
assert(productRow.stock === 12, 'product stock should be numeric');
assert(productRow.active === true, 'product active should be boolean');
assert(Array.isArray(productRow.aliases), 'product aliases should stay array');
assert(productRow.aliases.join(',') === 'burger,x', 'product aliases should keep expected values');
assert(productRow.favorite === true, 'product favorite should be boolean');

const product = productAdapter.fromRow({
  id: 'batata-frita',
  name: 'Batata Frita',
  category_id: 'porcoes',
  price: 14,
  cost: 6,
  stock: 18,
  active: true,
  aliases: ['batata'],
  favorite: false
});

assert(product.categoryId === 'porcoes', 'product category_id should map to categoryId');
assert(product.price === 14, 'product row price should map to app product');
assert(product.cost === 6, 'product row cost should map to app product');
assert(product.stock === 18, 'product row stock should map to app product');
assert(product.active === true, 'product row active should map to app product');
assert(product.aliases.join(',') === 'batata', 'product row aliases should map to app product');
assert(product.favorite === false, 'product row favorite should map to app product');

const categoryRow = categoryAdapter.toRow({
  id: 'lanches',
  name: 'Lanches',
  showInShowcase: false
});

assert(categoryRow.show_in_showcase === false, 'category showInShowcase should map to show_in_showcase');

const category = categoryAdapter.fromRow({
  id: 'bebidas',
  name: 'Bebidas',
  show_in_showcase: true
});

assert(category.showInShowcase === true, 'category show_in_showcase should map to showInShowcase');

console.log('product adapters ok');
