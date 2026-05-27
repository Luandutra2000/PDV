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
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const products = await import('../src/services/product.service.js');

storage.ensureSeedData();

const createdCategory = products.createCategory('Bebidas Frias', { showInShowcase: true });
assert(createdCategory.id === 'bebidas-frias', 'category should keep slug id');

const createdProduct = products.createProduct({
  name: 'Suco Natural',
  categoryId: createdCategory.id,
  price: 8,
  cost: 3,
  stock: 5,
  active: true,
  aliases: ['suco'],
  favorite: true
});

assert(createdProduct.id.startsWith('suco-natural'), 'product should keep slug id prefix');
assert(products.getProductById(createdProduct.id).name === 'Suco Natural', 'product should be readable after create');

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
  stock: 9,
  active: false
});

assert(updated.name === 'Teste Produto Editado', 'updated product should return new name');
assert(products.getProductById(created.id).price === 15, 'updated product should persist price');
assert(products.getProductById(created.id).stock === 9, 'updated product should persist stock');
assert(products.getProductById(created.id).active === false, 'updated product should persist cash register visibility');
assert(!products.searchProducts({ query: 'Teste Produto Editado' }).some((product) => product.id === created.id), 'hidden product should not appear in cash register search');

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

const hiddenShowcaseCategory = products.updateCategory(category.id, {
  name: 'Ofertas',
  showInShowcase: false
});
assert(hiddenShowcaseCategory.showInShowcase === false, 'category should allow hiding from showcase');
assert(!products.getShowcaseCategories().some((item) => item.id === category.id), 'hidden category should not appear in showcase categories');
assert(!products.getShowcaseProducts().some((product) => product.id === productWithNewCategory.id), 'products in hidden category should not appear in showcase products');

const visibleShowcaseCategory = products.updateCategory(category.id, {
  name: 'Ofertas',
  showInShowcase: true
});
assert(visibleShowcaseCategory.showInShowcase === true, 'category should allow showing in showcase');
assert(products.getShowcaseCategories().some((item) => item.id === category.id), 'visible category should appear in showcase categories');

storage.setItem(STORAGE_KEYS.categories, [
  { id: 'todos', name: 'Todos' },
  { id: 'fritos', name: '[object Object]', showInShowcase: false },
  { id: 'assados', name: { name: 'Assados' }, showInShowcase: true }
]);
const repairedCategories = products.getCategories();
assert(repairedCategories.find((item) => item.id === 'fritos').name === 'Fritos', 'corrupted object category name should fall back to id label');
assert(repairedCategories.find((item) => item.id === 'assados').name === 'Assados', 'object category name should use nested name');
storage.resetAppData();

products.deleteCategory(category.id);
assert(!products.getCategories().some((item) => item.id === category.id), 'deleted category should be removed');
assert(!products.getProducts().some((product) => product.categoryId === category.id), 'products in deleted category should be removed');

const aliasProduct = products.createProduct({
  name: 'Coxinha Especial',
  categoryId: 'lanches',
  price: 9,
  cost: 4,
  stock: 12,
  active: true,
  aliases: ['cox', 'salgado'],
  favorite: true
});

assert(products.getProductById(aliasProduct.id).aliases.includes('cox'), 'product aliases should be persisted');
assert(products.getProductById(aliasProduct.id).favorite === true, 'product favorite flag should be persisted');
assert(products.searchProducts({ query: 'cox' }).some((product) => product.id === aliasProduct.id), 'search should match aliases');
assert(products.searchProducts({ query: 'salgado' }).some((product) => product.id === aliasProduct.id), 'search should match aliases with business terms');
assert(products.searchProducts({ query: 'lanches' }).some((product) => product.id === aliasProduct.id), 'search should match category name');
assert(products.getFavoriteProducts().some((product) => product.id === aliasProduct.id), 'favorite products should be returned');

const favoritesCategory = products.createCategory('Favoritos');
const productInFavoritesCategory = products.createProduct({
  name: 'Produto Categoria Favoritos',
  categoryId: favoritesCategory.id,
  price: 11,
  cost: 4,
  stock: 3,
  active: true,
  favorite: false
});
const realFavoritesCategoryResults = products.searchProducts({ categoryId: favoritesCategory.id });

assert(favoritesCategory.id === 'favoritos', 'real favorites category should use favoritos slug');
assert(realFavoritesCategoryResults.some((product) => product.id === productInFavoritesCategory.id), 'real favorites category search should include products in that category');
assert(!realFavoritesCategoryResults.some((product) => product.id === aliasProduct.id), 'real favorites category search should not include favorite products from other categories');
assert(products.getFavoriteProducts().some((product) => product.id === aliasProduct.id), 'favorite products helper should still return favorite products');

console.log('product service crud ok');
