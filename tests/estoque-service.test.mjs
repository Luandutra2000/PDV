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
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const estoque = await import('../src/services/estoque.service.js');

storage.ensureSeedData();

const product = products.getProductById('x-burger');
const initialStock = product.stock;
const launch = estoque.createStockLaunch({
  produtoId: product.id,
  quantidade: 10
});

assert(launch.valorUnitario === product.price, 'unit value should come from selected product');
assert(launch.valorTotal === 160, 'total should be quantity times product price');
assert(launch.categoriaId === product.categoryId, 'category should come from selected product');
assert(products.getProductById(product.id).stock === initialStock + 10, 'launch should add quantity to product stock');

comandas.clearComanda();
comandas.addItem(product);
comandas.addItem(product);
transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});

const summary = estoque.getStockSummary();
assert(summary.estimatedProductionValue === 160, 'summary should include production value');
assert(summary.producedUnits === 10, 'summary should include produced units');
assert(summary.soldUnits === 2, 'summary should include sold units');
assert(summary.salesValue === 32, 'summary should include sales value');
assert(summary.quantityBalance === 8, 'summary should calculate leftover units');

const comparison = estoque.getProductionSalesComparison();
assert(comparison[0].produtoId === product.id, 'comparison should include launched product');
assert(comparison[0].quantidadeProduzida === 10, 'comparison should include produced quantity');
assert(comparison[0].quantidadeVendida === 2, 'comparison should include sold quantity');
assert(comparison[0].percentualVendido === 20, 'comparison should calculate sold percentage');

estoque.updateStockLaunch(launch.id, { quantidade: 5 });
assert(estoque.getStockSummary().producedUnits === 5, 'editing launch should recalculate summary');
assert(products.getProductById(product.id).stock === initialStock + 5, 'editing launch should adjust product stock by the quantity difference');

estoque.cancelStockLaunch(launch.id);
assert(estoque.getStockSummary().producedUnits === 0, 'canceling launch should remove it from totals');
assert(products.getProductById(product.id).stock === initialStock, 'canceling launch should remove the quantity from product stock');

estoque.deleteStockComparisonRow(product.id);
assert(estoque.getProductionSalesComparison().length === 0, 'deleting comparison row should hide it without deleting the sale');

storage.resetAppData();
const saleOnlyProduct = products.getProductById('x-burger');
comandas.clearComanda();
comandas.addItem(saleOnlyProduct);
transactions.finalizeComandaPayment({
  paymentMethod: 'pix'
});
assert(estoque.getProductionSalesComparison().length === 0, 'comparison should not show sales without a vitrine launch in the period');

estoque.createStockLaunch({
  produtoId: saleOnlyProduct.id,
  quantidade: 3
});
assert(estoque.getProductionSalesComparison().length === 1, 'new launch should show hidden product in comparison again');

console.log('estoque service ok');
