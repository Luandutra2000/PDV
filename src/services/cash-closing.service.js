import { STORAGE_KEYS } from '../database/schema.js';
import { getProductionSalesComparison } from './estoque.service.js';
import { getItem, setItem } from './storage.service.js';
import { getTransactions } from './transaction.service.js';

export function buildClosingSummary(input = {}) {
  const payments = buildPaymentConference(input);
  const showcase = buildShowcaseConference(input.leftovers || {});
  const transactions = getClosingTransactions();
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entries = transactions.filter((transaction) => transaction.type === 'entrada');
  const outputs = transactions.filter((transaction) => transaction.type === 'saida');

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sales: sumTransactions(sales),
      entries: sumTransactions(entries),
      outputs: sumTransactions(outputs),
      closedComandas: sales.length
    },
    payments,
    showcase
  };
}

export function buildPaymentConference(input = {}) {
  const transactions = getClosingTransactions();
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entriesTotal = sumTransactions(transactions.filter((transaction) => transaction.type === 'entrada'));
  const outputsTotal = sumTransactions(transactions.filter((transaction) => transaction.type === 'saida'));
  const expectedCash = sumPayment(sales, 'dinheiro') + entriesTotal - outputsTotal;
  const expectedPix = sumPayment(sales, 'pix');
  const expectedDebit = sumPayment(sales, 'debito');
  const expectedCredit = sumPayment(sales, 'credito');
  const countedCash = normalizeRequiredNumber(input.countedCash);
  const checkedPix = normalizeOptionalNumber(input.checkedPix);
  const checkedDebit = normalizeOptionalNumber(input.checkedDebit);
  const checkedCredit = normalizeOptionalNumber(input.checkedCredit);
  const comparableExpected = expectedCash + expectedPix + expectedDebit + expectedCredit;
  const comparableActual = countedCash
    + (checkedPix ?? expectedPix)
    + (checkedDebit ?? expectedDebit)
    + (checkedCredit ?? expectedCredit);

  return {
    expectedCash,
    countedCash,
    cashDifference: countedCash - expectedCash,
    expectedPix,
    checkedPix,
    pixDifference: checkedPix === null ? null : checkedPix - expectedPix,
    expectedDebit,
    checkedDebit,
    debitDifference: checkedDebit === null ? null : checkedDebit - expectedDebit,
    expectedCredit,
    checkedCredit,
    creditDifference: checkedCredit === null ? null : checkedCredit - expectedCredit,
    expectedTotal: comparableExpected,
    actualComparableTotal: comparableActual,
    generalDifference: comparableActual - comparableExpected
  };
}

export function buildShowcaseConference(leftovers = {}) {
  return getProductionSalesComparison({ period: 'today' }).map((item) => {
    const countedLeftoverQuantity = normalizeOptionalNumber(leftovers[item.produtoId]);
    const expectedLeftoverQuantity = item.sobraQuantidade;
    const differenceQuantity = countedLeftoverQuantity === null
      ? null
      : expectedLeftoverQuantity - countedLeftoverQuantity;

    return {
      productId: item.produtoId,
      productName: item.produtoNome,
      categoryId: item.categoriaId,
      categoryName: item.categoriaNome,
      producedQuantity: item.quantidadeProduzida,
      soldQuantity: item.quantidadeVendida,
      writeOffQuantity: item.quantidadeBaixada || 0,
      writeOffValue: item.valorBaixado || 0,
      expectedLeftoverQuantity,
      countedLeftoverQuantity,
      differenceQuantity,
      estimatedDifferenceValue: differenceQuantity === null
        ? null
        : differenceQuantity * getUnitValue(item)
    };
  });
}

export function saveClosingDraft(input = {}) {
  const summary = buildClosingSummary(input);
  const draft = {
    id: input.id || createId('closing-draft'),
    status: 'rascunho',
    ...summary,
    differences: input.differences || [],
    input,
    updatedAt: new Date().toISOString()
  };

  setItem(STORAGE_KEYS.cashClosingDraft, draft);
  return draft;
}

export function getCurrentClosingDraft() {
  return getItem(STORAGE_KEYS.cashClosingDraft, null);
}

export function confirmClosing(draft) {
  if (!draft || !draft.payments) {
    throw new Error('Rascunho de fechamento invalido.');
  }

  if (!Number.isFinite(Number(draft.payments.countedCash))) {
    throw new Error('Dinheiro contado obrigatorio.');
  }

  const missingReason = (draft.differences || []).some((difference) => (
    !difference.reason || (difference.reason === 'outro' && !difference.note)
  ));

  if (missingReason) {
    throw new Error('Toda divergencia precisa de motivo.');
  }

  const closedAt = new Date().toISOString();
  const closing = {
    ...draft,
    id: createId('closing'),
    status: 'fechado',
    totals: {
      ...draft.totals,
      expectedCash: draft.payments.expectedCash,
      countedCash: draft.payments.countedCash,
      cashDifference: draft.payments.cashDifference,
      expectedPix: draft.payments.expectedPix,
      checkedPix: draft.payments.checkedPix,
      expectedDebit: draft.payments.expectedDebit,
      checkedDebit: draft.payments.checkedDebit,
      expectedCredit: draft.payments.expectedCredit,
      checkedCredit: draft.payments.checkedCredit,
      generalDifference: draft.payments.generalDifference
    },
    closedAt,
    createdAt: closedAt,
    updatedAt: closedAt
  };

  const closings = getCashClosings();
  closings.unshift(closing);
  setItem(STORAGE_KEYS.cashClosings, closings);
  setItem(STORAGE_KEYS.cashClosingDraft, null);

  return closing;
}

export function getCashClosings() {
  return getItem(STORAGE_KEYS.cashClosings, []);
}

export function getCashClosingById(closingId) {
  return getCashClosings().find((closing) => closing.id === closingId) || null;
}

export function getSalesAfterClosing(closing) {
  if (!closing?.closedAt) {
    return [];
  }

  const closedAt = new Date(closing.closedAt);
  return getTransactions().filter((transaction) => (
    transaction.type === 'venda'
      && transaction.status !== 'cancelada'
      && new Date(transaction.createdAt) > closedAt
  ));
}

function getClosingTransactions() {
  return getTransactions().filter((transaction) => transaction.status !== 'cancelada');
}

function sumPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function sumTransactions(transactions) {
  return transactions.reduce((total, transaction) => total + Number(transaction.total || transaction.amount || 0), 0);
}

function normalizeRequiredNumber(value) {
  return Number(value) || 0;
}

function normalizeOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getUnitValue(item) {
  if (item.quantidadeProduzida <= 0) {
    return 0;
  }

  return item.valorProduzido / item.quantidadeProduzida;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
