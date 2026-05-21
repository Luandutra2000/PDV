import { STORAGE_KEYS } from '../database/schema.js';
import { getCategories, getProductById, getProducts, updateProduct } from './product.service.js';
import { getTransactions } from './transaction.service.js';
import { getItem, setItem } from './storage.service.js';

export function createStockLaunch({ produtoId, quantidade }) {
  const product = getProductById(produtoId);

  if (!product) {
    throw new Error('Produto nao encontrado.');
  }

  const category = getCategories().find((item) => item.id === product.categoryId);
  const normalizedQuantity = Number(quantidade) || 0;

  if (normalizedQuantity <= 0) {
    throw new Error('Quantidade precisa ser maior que zero.');
  }

  const launch = {
    id: createId('stock'),
    produtoId: product.id,
    produtoNome: product.name,
    categoriaId: product.categoryId,
    categoriaNome: category ? category.name : 'Sem categoria',
    quantidade: normalizedQuantity,
    valorUnitario: Number(product.price) || 0,
    valorTotal: normalizedQuantity * (Number(product.price) || 0),
    dataHora: new Date().toISOString(),
    usuarioId: null,
    usuarioNome: 'Local',
    status: 'ativo'
  };

  const launches = getStockLaunches();
  launches.unshift(launch);
  setItem(STORAGE_KEYS.stockLaunches, launches);
  showStockComparisonProduct(product.id);
  updateProductStock(product.id, normalizedQuantity);

  return launch;
}

export function deleteStockComparisonRow(produtoId, filters = {}) {
  const activeLaunches = getActiveLaunches(filters).filter((launch) => launch.produtoId === produtoId);

  activeLaunches.forEach((launch) => cancelStockLaunch(launch.id));
  hideStockComparisonProduct(produtoId);

  return {
    canceledLaunches: activeLaunches.length,
    hidden: true
  };
}

export function updateStockLaunch(launchId, data) {
  const currentLaunch = getStockLaunches().find((launch) => launch.id === launchId);

  const launches = getStockLaunches().map((launch) => {
    if (launch.id !== launchId) {
      return launch;
    }

    const quantity = Number(data.quantidade ?? launch.quantidade) || 0;
    const unitValue = Number(data.valorUnitario ?? launch.valorUnitario) || 0;

    return {
      ...launch,
      quantidade: quantity,
      valorUnitario: unitValue,
      valorTotal: quantity * unitValue
    };
  });

  setItem(STORAGE_KEYS.stockLaunches, launches);

  if (currentLaunch?.status === 'ativo') {
    const nextQuantity = Number(data.quantidade ?? currentLaunch.quantidade) || 0;
    updateProductStock(currentLaunch.produtoId, nextQuantity - currentLaunch.quantidade);
  }
}

export function cancelStockLaunch(launchId) {
  const currentLaunch = getStockLaunches().find((launch) => launch.id === launchId);

  const launches = getStockLaunches().map((launch) => {
    if (launch.id !== launchId) {
      return launch;
    }

    return {
      ...launch,
      status: 'cancelado',
      canceledAt: new Date().toISOString()
    };
  });

  setItem(STORAGE_KEYS.stockLaunches, launches);

  if (currentLaunch?.status === 'ativo') {
    updateProductStock(currentLaunch.produtoId, -currentLaunch.quantidade);
  }
}

export function getStockLaunches(filters = {}) {
  const launches = getItem(STORAGE_KEYS.stockLaunches, []);
  return applyStockFilters(launches, filters);
}

export function getStockSummary(filters = {}) {
  const launches = getActiveLaunches(filters);
  const comparison = getProductionSalesComparison(filters);
  const estimatedProductionValue = launches.reduce((total, launch) => total + launch.valorTotal, 0);
  const producedUnits = launches.reduce((total, launch) => total + launch.quantidade, 0);
  const uniqueProducts = new Set(launches.map((launch) => launch.produtoId)).size;
  const salesValue = comparison.reduce((total, item) => total + item.valorVendido, 0);
  const soldUnits = comparison.reduce((total, item) => total + item.quantidadeVendida, 0);

  return {
    estimatedProductionValue,
    producedUnits,
    uniqueProducts,
    salesValue,
    soldUnits,
    valueDifference: estimatedProductionValue - salesValue,
    quantityBalance: producedUnits - soldUnits
  };
}

export function getProductionSalesComparison(filters = {}) {
  const launches = getActiveLaunches(filters);
  const salesByProduct = getSalesByProduct(filters);
  const hiddenProducts = new Set(getHiddenStockComparisonProducts());
  const productIds = new Set(launches.map((launch) => launch.produtoId));

  return Array.from(productIds).filter((produtoId) => !hiddenProducts.has(produtoId)).map((produtoId) => {
    const product = getProductById(produtoId);
    const productLaunches = launches.filter((launch) => launch.produtoId === produtoId);
    const producedQuantity = productLaunches.reduce((total, launch) => total + launch.quantidade, 0);
    const producedValue = productLaunches.reduce((total, launch) => total + launch.valorTotal, 0);
    const sold = salesByProduct.get(produtoId) || { quantity: 0, value: 0 };

    return {
      produtoId,
      produtoNome: product ? product.name : productLaunches[0]?.produtoNome || 'Produto removido',
      categoriaId: product ? product.categoryId : productLaunches[0]?.categoriaId || '',
      categoriaNome: getCategoryName(product, productLaunches),
      quantidadeProduzida: producedQuantity,
      valorProduzido: producedValue,
      quantidadeVendida: sold.quantity,
      valorVendido: sold.value,
      sobraQuantidade: producedQuantity - sold.quantity,
      diferencaValor: producedValue - sold.value,
      percentualVendido: producedQuantity > 0 ? Math.round((sold.quantity / producedQuantity) * 100) : 0
    };
  }).sort((a, b) => b.valorProduzido - a.valorProduzido);
}

function getActiveLaunches(filters) {
  return getStockLaunches(filters).filter((launch) => launch.status === 'ativo');
}

function getSalesByProduct(filters) {
  const result = new Map();
  const productFilter = new Set(filters.productIds || []);
  const categoryFilter = new Set(filters.categoryIds || []);

  getTransactions()
    .filter((transaction) => transaction.type === 'venda' && transaction.status !== 'cancelada')
    .filter((transaction) => isInPeriod(transaction.createdAt, filters.period || 'today', filters))
    .forEach((sale) => {
      sale.items.forEach((item) => {
        const product = getProductById(item.productId);

        if (!product) {
          return;
        }

        if (productFilter.size && !productFilter.has(item.productId)) {
          return;
        }

        if (categoryFilter.size && !categoryFilter.has(product.categoryId)) {
          return;
        }

        const current = result.get(item.productId) || { quantity: 0, value: 0 };
        current.quantity += item.quantity;
        current.value += item.total;
        result.set(item.productId, current);
      });
    });

  return result;
}

function applyStockFilters(launches, filters = {}) {
  const productFilter = new Set(filters.productIds || []);
  const categoryFilter = new Set(filters.categoryIds || []);

  return launches.filter((launch) => {
    const matchesPeriod = isInPeriod(launch.dataHora, filters.period || 'today', filters);
    const matchesProduct = !productFilter.size || productFilter.has(launch.produtoId);
    const matchesCategory = !categoryFilter.size || categoryFilter.has(launch.categoriaId);

    return matchesPeriod && matchesProduct && matchesCategory;
  });
}

function isInPeriod(value, period, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(value);
  const now = new Date();

  if (period === 'custom') {
    const start = filters.customStart ? new Date(`${filters.customStart}T00:00:00`) : null;
    const end = filters.customEnd ? new Date(`${filters.customEnd}T23:59:59`) : null;
    return (!start || date >= start) && (!end || date <= end);
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
}

function getCategoryName(product, launches) {
  if (launches[0]?.categoriaNome) {
    return launches[0].categoriaNome;
  }

  if (!product) {
    return 'Sem categoria';
  }

  return getCategories().find((category) => category.id === product.categoryId)?.name || 'Sem categoria';
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function updateProductStock(productId, quantityDelta) {
  const product = getProductById(productId);

  if (!product || !quantityDelta) {
    return;
  }

  updateProduct(productId, {
    stock: Math.max(0, Number(product.stock || 0) + quantityDelta)
  });
}

function getHiddenStockComparisonProducts() {
  return getItem(STORAGE_KEYS.hiddenStockComparisons, []);
}

function hideStockComparisonProduct(productId) {
  const hiddenProducts = new Set(getHiddenStockComparisonProducts());
  hiddenProducts.add(productId);
  setItem(STORAGE_KEYS.hiddenStockComparisons, Array.from(hiddenProducts));
}

function showStockComparisonProduct(productId) {
  const nextHiddenProducts = getHiddenStockComparisonProducts().filter((id) => id !== productId);
  setItem(STORAGE_KEYS.hiddenStockComparisons, nextHiddenProducts);
}
