const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');

storage.ensureSeedData();

const created = products.createProduct({
  name: 'Teste Produto',
  categoryId: 'lanches',
  price: 12.5,
  cost: 5,
  stock: 7,
  active: true
});

assert(created.id, 'created product should have an id');
assert(products.getProductById(created.id).name === 'Teste Produto', 'created product should be persisted');

const updated = products.updateProduct(created.id, {
  name: 'Teste Produto Editado',
  price: 15,
  stock: 9
});

assert(updated.name === 'Teste Produto Editado', 'updated product should return new name');
assert(products.getProductById(created.id).price === 15, 'updated product should persist price');
assert(products.getProductById(created.id).stock === 9, 'updated product should persist stock');

products.deleteProduct(created.id);

assert(products.getProductById(created.id) === null, 'deleted product should not be returned by id');
assert(!products.getActiveProducts().some((product) => product.id === created.id), 'deleted product should not be active');

const category = products.createCategory('Promocoes');
const productWithNewCategory = products.createProduct({
  name: 'Combo Promocional',
  categoryId: category.id,
  price: 29.9,
  cost: 0,
  stock: 0,
  active: true
});

assert(category.id === 'promocoes', 'new category should use a slug id');
assert(products.getCategories().some((item) => item.id === category.id), 'new category should be persisted');
assert(products.getProductById(productWithNewCategory.id).categoryId === category.id, 'product should use new category');

const editedCategory = products.updateCategory(category.id, 'Ofertas');
assert(editedCategory.name === 'Ofertas', 'category should be renamed');
assert(products.getCategories().some((item) => item.id === category.id && item.name === 'Ofertas'), 'renamed category should persist');

products.deleteCategory(category.id);
assert(!products.getCategories().some((item) => item.id === category.id), 'deleted category should be removed');
assert(!products.getProducts().some((product) => product.categoryId === category.id), 'products in deleted category should be removed');

console.log('product service crud ok');
