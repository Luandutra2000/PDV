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
products.updateCategory(saleOnlyProduct.categoryId, {
  name: 'Lanches',
  showInShowcase: false
});
let rejectedHiddenCategory = false;
try {
  estoque.createStockLaunch({
    produtoId: saleOnlyProduct.id,
    quantidade: 1
  });
} catch (error) {
  rejectedHiddenCategory = error.message === 'Categoria desativada para lancamento na vitrine.';
}
assert(rejectedHiddenCategory, 'stock launch should reject category hidden from showcase');
products.updateCategory(saleOnlyProduct.categoryId, {
  name: 'Lanches',
  showInShowcase: true
});
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

storage.resetAppData();
const writeOffProduct = products.getProductById('x-burger');
estoque.createStockLaunch({
  produtoId: writeOffProduct.id,
  quantidade: 5
});

const todayProducts = estoque.getTodayShowcaseProducts();
assert(todayProducts.some((item) => item.id === writeOffProduct.id), 'today showcase products should include launched products');

const writeOff = estoque.createShowcaseWriteOff({
  productId: writeOffProduct.id,
  quantity: 2,
  reason: 'consumo-interno',
  note: ''
});

assert(writeOff.productId === writeOffProduct.id, 'write-off should store product id');
assert(writeOff.quantity === 2, 'write-off should store quantity');
assert(writeOff.unitValue === writeOffProduct.price, 'write-off should store current product price');
assert(writeOff.totalValue === writeOffProduct.price * 2, 'write-off should calculate total estimated value');

const writeOffSummary = estoque.getShowcaseWriteOffSummary();
assert(writeOffSummary.get(writeOffProduct.id).quantity === 2, 'write-off summary should group quantity by product');
assert(writeOffSummary.get(writeOffProduct.id).totalValue === writeOffProduct.price * 2, 'write-off summary should group value by product');

const comparisonWithWriteOff = estoque.getProductionSalesComparison();
assert(comparisonWithWriteOff[0].quantidadeBaixada === 2, 'comparison should include write-off quantity');
assert(comparisonWithWriteOff[0].valorBaixado === writeOffProduct.price * 2, 'comparison should include write-off value');
assert(comparisonWithWriteOff[0].sobraQuantidade === 3, 'comparison should subtract write-offs from leftover');

let rejectedMissingLaunch = false;
try {
  estoque.createShowcaseWriteOff({
    productId: 'agua',
    quantity: 1,
    reason: 'quebra'
  });
} catch (error) {
  rejectedMissingLaunch = error.message === 'Produto sem lancamento de vitrine no periodo.';
}
assert(rejectedMissingLaunch, 'write-off should reject product without showcase launch today');

let rejectedTooLarge = false;
try {
  estoque.createShowcaseWriteOff({
    productId: writeOffProduct.id,
    quantity: 10,
    reason: 'quebra'
  });
} catch (error) {
  rejectedTooLarge = error.message === 'Quantidade maior que a sobra disponivel na vitrine.';
}
assert(rejectedTooLarge, 'write-off should reject quantity greater than available showcase leftover');

console.log('estoque service ok');
