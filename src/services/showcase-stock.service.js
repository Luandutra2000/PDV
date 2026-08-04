import { STORAGE_KEYS } from '../database/schema.js?v=20260804-01';
import { getItem, setItem } from './storage.service.js?v=20260804-01';

const MOVEMENT_TYPES = {
  production: 'entrada_producao',
  sale: 'saida_venda',
  outOfStockSale: 'venda_sem_estoque',
  saleReverse: 'estorno_venda',
  outOfStockReverse: 'estorno_sem_estoque',
  manualAdjustment: 'ajuste_manual'
};

export function getShowcaseStock() {
  return readList(STORAGE_KEYS.productStock);
}

export function getShowcaseMovements() {
  return readList(STORAGE_KEYS.showcaseMovements);
}

export function getOutOfStockSales() {
  return readList(STORAGE_KEYS.outOfStockSales);
}

export function getActiveOutOfStockSales() {
  return getOutOfStockSales().filter((item) => item.status !== 'cancelada');
}

export function getShowcaseStockByProductId(productId) {
  const normalizedProductId = requireText(productId, 'productId');
  return getShowcaseStock().find((item) => item.productId === normalizedProductId) || createStockRow({
    productId: normalizedProductId,
    quantityAvailable: 0
  });
}

export function applyProductionToShowcase({ operationId, productId, quantity, userId = '', createdAt } = {}) {
  const normalizedOperationId = requireText(operationId, 'operationId');
  const normalizedProductId = requireText(productId, 'productId');
  const productionQuantity = parsePositiveQuantity(quantity, 'quantity');
  const movementId = buildMovementId(normalizedOperationId, normalizedProductId, MOVEMENT_TYPES.production);
  const movements = getShowcaseMovements();

  if (movements.some((movement) => movement.id === movementId)) {
    return unchangedResult({
      stock: getShowcaseStockByProductId(normalizedProductId),
      movements: movements.filter((movement) => movement.id === movementId)
    });
  }

  const stockRows = getShowcaseStock();
  const previousStock = getShowcaseStockByProductId(normalizedProductId);
  const nextQuantity = previousStock.quantityAvailable + productionQuantity;
  const stock = upsertStock(stockRows, {
    productId: normalizedProductId,
    quantityAvailable: nextQuantity,
    userId,
    updatedAt: createdAt
  });
  const movement = createMovement({
    operationId: normalizedOperationId,
    productId: normalizedProductId,
    movementType: MOVEMENT_TYPES.production,
    quantity: productionQuantity,
    previousQuantity: previousStock.quantityAvailable,
    newQuantity: nextQuantity,
    userId,
    notes: 'Entrada de producao na vitrine',
    createdAt
  });

  setItem(STORAGE_KEYS.productStock, stockRows);
  setItem(STORAGE_KEYS.showcaseMovements, [...movements, movement]);

  return {
    changed: true,
    stock,
    movements: [movement],
    outOfStockSales: []
  };
}

export function applySaleToShowcase({
  operationId,
  saleId,
  commandId = '',
  userId = '',
  createdAt,
  items = []
} = {}) {
  const normalizedOperationId = requireText(operationId, 'operationId');
  const normalizedSaleId = requireText(saleId, 'saleId');

  if (saleWasAlreadyApplied(normalizedOperationId, normalizedSaleId)) {
    return unchangedResult({
      stock: getShowcaseStock(),
      movements: getShowcaseMovements().filter((movement) => (
        movement.operationId === normalizedOperationId || movement.saleId === normalizedSaleId
      )),
      outOfStockSales: getOutOfStockSales().filter((item) => item.saleId === normalizedSaleId)
    });
  }

  const aggregatedItems = aggregateSaleItems(items);
  const stockRows = getShowcaseStock();
  const movements = getShowcaseMovements();
  const outOfStockRows = getOutOfStockSales();
  const changedStock = [];
  const changedMovements = [];
  const changedOutOfStock = [];

  for (const item of aggregatedItems) {
    const previousStock = getStockFromRows(stockRows, item.productId);
    const stockedQuantity = Math.min(previousStock.quantityAvailable, item.quantity);
    const missingQuantity = Math.max(item.quantity - stockedQuantity, 0);
    const nextQuantity = previousStock.quantityAvailable - stockedQuantity;
    const stock = upsertStock(stockRows, {
      productId: item.productId,
      quantityAvailable: nextQuantity,
      userId,
      updatedAt: createdAt
    });

    changedStock.push(stock);

    if (stockedQuantity > 0) {
      changedMovements.push(createMovement({
        operationId: normalizedOperationId,
        productId: item.productId,
        movementType: MOVEMENT_TYPES.sale,
        quantity: stockedQuantity,
        previousQuantity: previousStock.quantityAvailable,
        newQuantity: nextQuantity,
        saleId: normalizedSaleId,
        commandId,
        userId,
        notes: 'Baixa automatica por venda',
        createdAt
      }));
    }

    if (missingQuantity > 0) {
      changedMovements.push(createMovement({
        operationId: normalizedOperationId,
        productId: item.productId,
        movementType: MOVEMENT_TYPES.outOfStockSale,
        quantity: missingQuantity,
        previousQuantity: nextQuantity,
        newQuantity: nextQuantity,
        saleId: normalizedSaleId,
        commandId,
        userId,
        notes: 'Produto vendido sem estoque na vitrine',
        createdAt
      }));

      changedOutOfStock.push(createOutOfStockSale({
        operationId: normalizedOperationId,
        productId: item.productId,
        saleId: normalizedSaleId,
        commandId,
        quantity: missingQuantity,
        unitPrice: item.unitPrice,
        userId,
        createdAt
      }));
    }
  }

  setItem(STORAGE_KEYS.productStock, stockRows);
  setItem(STORAGE_KEYS.showcaseMovements, [...movements, ...changedMovements]);
  setItem(STORAGE_KEYS.outOfStockSales, [...outOfStockRows, ...changedOutOfStock]);

  return {
    changed: changedStock.length > 0 || changedMovements.length > 0 || changedOutOfStock.length > 0,
    stock: changedStock,
    movements: changedMovements,
    outOfStockSales: changedOutOfStock
  };
}

export function reverseSaleInShowcase({
  operationId,
  saleId,
  commandId = '',
  userId = '',
  createdAt
} = {}) {
  const normalizedOperationId = requireText(operationId, 'operationId');
  const normalizedSaleId = requireText(saleId, 'saleId');
  const movements = getShowcaseMovements();
  const reverseAlreadyExists = movements.some((movement) => (
    movement.operationId === normalizedOperationId && movement.movementType === MOVEMENT_TYPES.saleReverse
  ));

  if (reverseAlreadyExists) {
    return unchangedResult({
      stock: getShowcaseStock(),
      movements: movements.filter((movement) => movement.operationId === normalizedOperationId),
      outOfStockSales: getOutOfStockSales().filter((item) => item.saleId === normalizedSaleId)
    });
  }

  const stockRows = getShowcaseStock();
  const outOfStockRows = getOutOfStockSales();
  const changedStock = [];
  const changedMovements = [];
  let changed = false;

  for (const movement of movements) {
    if (movement.saleId !== normalizedSaleId || movement.movementType !== MOVEMENT_TYPES.sale || movement.status === 'estornada') {
      continue;
    }

    const previousStock = getStockFromRows(stockRows, movement.productId);
    const nextQuantity = previousStock.quantityAvailable + movement.quantity;
    const stock = upsertStock(stockRows, {
      productId: movement.productId,
      quantityAvailable: nextQuantity,
      userId,
      updatedAt: createdAt
    });
    const reverseMovement = createMovement({
      operationId: normalizedOperationId,
      productId: movement.productId,
      movementType: MOVEMENT_TYPES.saleReverse,
      quantity: movement.quantity,
      previousQuantity: previousStock.quantityAvailable,
      newQuantity: nextQuantity,
      saleId: normalizedSaleId,
      commandId: commandId || movement.commandId,
      userId,
      notes: 'Estorno automatico por cancelamento de venda',
      reversedMovementId: movement.id,
      createdAt
    });

    movement.status = 'estornada';
    changedStock.push(stock);
    changedMovements.push(reverseMovement);
    changed = true;
  }

  for (const movement of movements) {
    if (movement.saleId === normalizedSaleId && movement.movementType === MOVEMENT_TYPES.outOfStockSale && movement.status !== 'estornada') {
      movement.status = 'estornada';
      changed = true;
    }
  }

  const canceledOutOfStock = [];
  for (const item of outOfStockRows) {
    if (item.saleId === normalizedSaleId && item.status !== 'cancelada') {
      const outOfStockMovement = movements.find((movement) => (
        movement.saleId === normalizedSaleId
        && movement.productId === item.productId
        && movement.movementType === MOVEMENT_TYPES.outOfStockSale
      ));
      const previousStock = getStockFromRows(stockRows, item.productId);
      changedMovements.push(createMovement({
        operationId: normalizedOperationId,
        productId: item.productId,
        movementType: MOVEMENT_TYPES.outOfStockReverse,
        quantity: item.quantity,
        previousQuantity: previousStock.quantityAvailable,
        newQuantity: previousStock.quantityAvailable,
        saleId: normalizedSaleId,
        commandId: commandId || item.commandId,
        userId,
        notes: 'Estorno de venda sem estoque',
        reversedMovementId: outOfStockMovement?.id || '',
        createdAt
      }));
      item.status = 'cancelada';
      item.canceledAt = createdAt || new Date().toISOString();
      item.canceledBy = userId;
      canceledOutOfStock.push(item);
      changed = true;
    }
  }

  setItem(STORAGE_KEYS.productStock, stockRows);
  setItem(STORAGE_KEYS.showcaseMovements, [...movements, ...changedMovements]);
  setItem(STORAGE_KEYS.outOfStockSales, outOfStockRows);

  return {
    changed,
    stock: changedStock,
    movements: changedMovements,
    outOfStockSales: canceledOutOfStock
  };
}

export function adjustShowcaseStock({
  operationId,
  productId,
  quantityAvailable,
  reason = '',
  note = '',
  userId = '',
  createdAt
} = {}) {
  const normalizedOperationId = requireText(operationId, 'operationId');
  const normalizedProductId = requireText(productId, 'productId');
  const nextQuantity = parseQuantity(quantityAvailable, 'quantityAvailable');
  const movementId = buildMovementId(normalizedOperationId, normalizedProductId, MOVEMENT_TYPES.manualAdjustment);
  const movements = getShowcaseMovements();

  if (movements.some((movement) => movement.id === movementId)) {
    return unchangedResult({
      stock: getShowcaseStockByProductId(normalizedProductId),
      movements: movements.filter((movement) => movement.id === movementId)
    });
  }

  const stockRows = getShowcaseStock();
  const previousStock = getShowcaseStockByProductId(normalizedProductId);
  const stock = upsertStock(stockRows, {
    productId: normalizedProductId,
    quantityAvailable: nextQuantity,
    userId,
    updatedAt: createdAt
  });
  const notes = [reason && `Motivo: ${reason}`, note && `Nota: ${note}`].filter(Boolean).join(' | ');
  const movement = createMovement({
    operationId: normalizedOperationId,
    productId: normalizedProductId,
    movementType: MOVEMENT_TYPES.manualAdjustment,
    quantity: Math.abs(nextQuantity - previousStock.quantityAvailable),
    previousQuantity: previousStock.quantityAvailable,
    newQuantity: nextQuantity,
    userId,
    notes,
    createdAt
  });

  setItem(STORAGE_KEYS.productStock, stockRows);
  setItem(STORAGE_KEYS.showcaseMovements, [...movements, movement]);

  return {
    changed: true,
    stock,
    movements: [movement],
    outOfStockSales: []
  };
}

export function resetShowcaseStockForTests() {
  setItem(STORAGE_KEYS.productStock, []);
  setItem(STORAGE_KEYS.showcaseMovements, []);
  setItem(STORAGE_KEYS.outOfStockSales, []);
}

function saleWasAlreadyApplied(operationId, saleId) {
  return getShowcaseMovements().some((movement) => movement.operationId === operationId || movement.saleId === saleId)
    || getOutOfStockSales().some((item) => item.operationId === operationId || item.saleId === saleId);
}

function aggregateSaleItems(items) {
  if (!Array.isArray(items)) {
    throw new Error('items must be an array');
  }

  const byProduct = new Map();
  for (const item of items) {
    const productId = requireText(item?.productId, 'productId');
    const quantity = parseQuantity(item?.quantity, 'quantity');

    if (quantity === 0) {
      continue;
    }

    const unitPrice = parseOptionalNumber(item?.unitPrice ?? item?.price, 'unitPrice');
    const current = byProduct.get(productId) || {
      productId,
      quantity: 0,
      totalPrice: 0
    };

    current.quantity += quantity;
    current.totalPrice += quantity * unitPrice;
    current.unitPrice = current.quantity > 0 ? current.totalPrice / current.quantity : unitPrice;
    byProduct.set(productId, current);
  }

  return [...byProduct.values()];
}

function createStockRow({ productId, quantityAvailable, userId = '', updatedAt }) {
  return {
    id: `stock-${productId}`,
    productId,
    quantityAvailable,
    updatedBy: userId,
    updatedAt: updatedAt || new Date().toISOString()
  };
}

function upsertStock(stockRows, { productId, quantityAvailable, userId = '', updatedAt }) {
  const nextStock = createStockRow({
    productId,
    quantityAvailable,
    userId,
    updatedAt
  });
  const existingIndex = stockRows.findIndex((item) => item.productId === productId);

  if (existingIndex >= 0) {
    stockRows[existingIndex] = nextStock;
  } else {
    stockRows.push(nextStock);
  }

  return nextStock;
}

function getStockFromRows(stockRows, productId) {
  return stockRows.find((item) => item.productId === productId) || createStockRow({
    productId,
    quantityAvailable: 0
  });
}

function createMovement({
  operationId,
  productId,
  movementType,
  quantity,
  previousQuantity,
  newQuantity,
  saleId = '',
  commandId = '',
  userId = '',
  notes = '',
  reversedMovementId = '',
  createdAt
}) {
  return {
    id: buildMovementId(operationId, productId, movementType),
    operationId,
    productId,
    movementType,
    quantity,
    previousQuantity,
    newQuantity,
    saleId,
    commandId,
    userId,
    notes,
    reversedMovementId,
    status: 'ativa',
    createdAt: createdAt || new Date().toISOString()
  };
}

function createOutOfStockSale({
  operationId,
  productId,
  saleId,
  commandId = '',
  quantity,
  unitPrice = 0,
  userId = '',
  createdAt
}) {
  return {
    id: `out-${saleId}-${productId}`,
    operationId,
    productId,
    saleId,
    commandId,
    quantity,
    unitPrice,
    totalPrice: quantity * unitPrice,
    userId,
    status: 'ativa',
    createdAt: createdAt || new Date().toISOString(),
    canceledAt: '',
    canceledBy: ''
  };
}

function buildMovementId(operationId, productId, movementType) {
  return `mov-${operationId}-${productId}-${movementType}`;
}

function readList(key) {
  const value = getItem(key, []);
  return Array.isArray(value) ? value : [];
}

function unchangedResult({ stock = null, movements = [], outOfStockSales = [] } = {}) {
  return {
    changed: false,
    stock,
    movements,
    outOfStockSales
  };
}

function requireText(value, fieldName) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

function parseQuantity(value, fieldName) {
  const number = parseOptionalNumber(value, fieldName);

  if (number < 0) {
    throw new Error(`${fieldName} must be greater than or equal to 0`);
  }

  return number;
}

function parsePositiveQuantity(value, fieldName) {
  const number = parseOptionalNumber(value, fieldName);

  if (number <= 0) {
    throw new Error(`${fieldName} must be greater than 0`);
  }

  return number;
}

function parseOptionalNumber(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    if (fieldName === 'unitPrice') {
      return 0;
    }

    throw new Error(`${fieldName} is required`);
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  return number;
}
