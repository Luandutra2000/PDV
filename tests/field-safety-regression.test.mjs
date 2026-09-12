process.env.NODE_ENV = 'test';

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

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

const productModule = await import('../src/modules/produtos/produtos.module.js?v=20260804-06');
const productService = await import('../src/services/product.service.js?v=20260804-06');

const productListeners = {};
const productContainer = {
  innerHTML: '',
  addEventListener(eventName, handler) {
    productListeners[eventName] = handler;
  }
};

productModule.initProdutosModule(productContainer);
const product = productService.getProducts()[0];
productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'delete-product', productId: product.id } };
      }
      return null;
    }
  }
});

if (!productContainer.innerHTML.includes('data-action="confirm-delete-product"')) {
  throw new Error('product deletion must require an in-app confirmation');
}
if (!productService.getProducts().some((candidate) => candidate.id === product.id)) {
  throw new Error('requesting product deletion must not remove the product');
}

productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'cancel-delete-catalog' } };
      }
      return null;
    }
  }
});
if (!productService.getProducts().some((candidate) => candidate.id === product.id)) {
  throw new Error('canceling product deletion must preserve the product');
}

productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'delete-product', productId: product.id } };
      }
      return null;
    }
  }
});
await productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'confirm-delete-product' } };
      }
      return null;
    }
  }
});
if (productService.getProducts().some((candidate) => candidate.id === product.id)) {
  throw new Error('confirming product deletion must remove the product');
}

const category = productService.getCategories().find((candidate) => candidate.id !== 'todos');
productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'delete-category', categoryId: category.id } };
      }
      return null;
    }
  }
});

if (!productContainer.innerHTML.includes('data-action="confirm-delete-category"')) {
  throw new Error('category deletion must require an in-app confirmation');
}
if (!productService.getCategories().some((candidate) => candidate.id === category.id)) {
  throw new Error('requesting category deletion must not remove the category');
}

productListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-action]') {
        return { dataset: { action: 'cancel-delete-catalog' } };
      }
      return null;
    }
  }
});
if (!productService.getCategories().some((candidate) => candidate.id === category.id)) {
  throw new Error('canceling category deletion must preserve the category');
}

const caixaModule = await import('../src/modules/caixa/caixa.module.js?v=20260804-06');
const caixaListeners = {};
const caixaContainer = {
  innerHTML: '',
  addEventListener(eventName, handler) {
    caixaListeners[eventName] = handler;
  }
};

caixaModule.initCaixaModule(caixaContainer);
caixaListeners.click({
  target: {
    closest(selector) {
      if (selector === '[data-caixa-screen]') return {};
      if (selector === '[data-crm-period]') return { dataset: { crmPeriod: 'yesterday' } };
      return null;
    }
  }
});

if (!caixaContainer.innerHTML.includes('data-action="confirm-crm-closing"')) {
  throw new Error('closing panel should remain visible for the selected period');
}
if (!caixaContainer.innerHTML.includes('disabled')) {
  throw new Error('closing a non-current period must be disabled');
}
if (!caixaContainer.innerHTML.includes('Selecione Hoje')) {
  throw new Error('disabled closing should explain that Hoje is required');
}

console.log('field safety regressions ok');
