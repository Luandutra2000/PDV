import { buildClosingSummary, completeClosingLocalEffects, getCashClosings, validateClosingInput } from './cash-closing.service.js?v=20260804-06';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { saveCashClosingToSupabaseStrict } from './financial-sync.service.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20260804-06';
import { assertPermission } from './permission.service.js?v=20260804-06';

export function getMobileClosingSummary() {
  const base = buildClosingSummary({});
  const expectedCard = normalizeMoney(base.payments.expectedDebit + base.payments.expectedCredit);
  const current = buildClosingSummary({
    countedCash: base.payments.expectedCash,
    checkedPix: base.payments.expectedPix,
    checkedDebit: base.payments.expectedDebit,
    checkedCredit: base.payments.expectedCredit
  });
  const history = getCashClosings().map(normalizeClosingHistoryItem);

  return {
    expectedCash: current.payments.expectedCash,
    expectedPix: current.payments.expectedPix,
    expectedDebit: current.payments.expectedDebit,
    expectedCredit: current.payments.expectedCredit,
    expectedCard,
    entriesTotal: current.totals.entries,
    outputsTotal: current.totals.outputs,
    cashDifference: current.payments.cashDifference,
    generalDifference: current.payments.generalDifference,
    formDefaults: {
      countedCash: current.payments.expectedCash,
      checkedPix: current.payments.expectedPix,
      checkedCard: expectedCard
    },
    history
  };
}

export function previewMobileClosing(input = {}) {
  const base = buildClosingSummary({});
  const expectedCard = normalizeMoney(base.payments.expectedDebit + base.payments.expectedCredit);
  const checkedCard = normalizeMoney(Number(input.checkedCard ?? expectedCard) || 0);
  const preview = buildClosingSummary({
    countedCash: input.countedCash ?? base.payments.expectedCash,
    checkedPix: input.checkedPix ?? base.payments.expectedPix,
    checkedDebit: checkedCard,
    checkedCredit: 0
  });
  const expectedTotal = preview.payments.expectedTotal;
  const countedTotal = preview.payments.actualComparableTotal;
  const differenceTotal = preview.payments.generalDifference;

  return {
    ...preview,
    note: String(input.note || '').trim(),
    expectedCard,
    checkedCard,
    expectedTotal,
    countedTotal,
    differenceTotal,
    cashDifference: preview.payments.cashDifference,
    pixDifference: preview.payments.pixDifference,
    cardDifference: normalizeMoney(checkedCard - expectedCard),
    statusLabel: getClosingStatusLabel(differenceTotal)
  };
}

export async function submitMobileClosing(input = {}) {
  if (!isSupabaseEnabled()) {
    throw new Error('Sem conexao com Supabase para registrar este fechamento.');
  }

  const user = getCurrentUser();
  assertPermission(user, 'cash.close');

  validateClosingInput(input);

  const preview = previewMobileClosing(input);
  const closedAt = new Date().toISOString();
  const closing = {
    id: createId('closing'),
    status: 'fechado',
    generatedAt: preview.generatedAt,
    totals: {
      ...preview.totals,
      expectedCash: preview.payments.expectedCash,
      countedCash: preview.payments.countedCash,
      cashDifference: preview.payments.cashDifference,
      expectedPix: preview.payments.expectedPix,
      checkedPix: preview.payments.checkedPix,
      expectedDebit: preview.expectedCard,
      checkedDebit: preview.checkedCard,
      expectedCredit: 0,
      checkedCredit: 0,
      generalDifference: preview.differenceTotal
    },
    payments: {
      ...preview.payments,
      expectedDebit: preview.expectedCard,
      checkedDebit: preview.checkedCard,
      expectedCredit: 0,
      checkedCredit: 0,
      debitDifference: preview.cardDifference,
      creditDifference: 0,
      generalDifference: preview.differenceTotal
    },
    showcase: preview.showcase,
    outOfStockSales: preview.outOfStockSales,
    differences: [],
    input: {
      countedCash: input.countedCash,
      checkedPix: input.checkedPix,
      checkedCard: input.checkedCard,
      note: input.note || ''
    },
    createdBy: user?.id || '',
    userName: user?.name || 'Sistema',
    closedAt,
    createdAt: closedAt,
    updatedAt: closedAt
  };

  const saved = await saveCashClosingToSupabaseStrict(closing);
  return normalizeClosingHistoryItem(completeClosingLocalEffects(saved, user));
}

export function getClosingStatusLabel(difference) {
  const absolute = Math.abs(Number(difference || 0));

  if (absolute === 0) {
    return 'Conferido';
  }

  if (absolute <= 5) {
    return 'Pequena diferenca';
  }

  return 'Grande diferenca';
}

function normalizeClosingHistoryItem(item) {
  const totals = item.totals || {};
  const expectedTotal = Number(totals.expectedCash || 0)
    + Number(totals.expectedPix || 0)
    + Number(totals.expectedDebit || 0)
    + Number(totals.expectedCredit || 0);
  const countedTotal = Number(totals.countedCash || 0)
    + Number((totals.checkedPix ?? totals.expectedPix) || 0)
    + Number((totals.checkedDebit ?? totals.expectedDebit) || 0)
    + Number((totals.checkedCredit ?? totals.expectedCredit) || 0);
  const difference = Number(totals.generalDifference ?? (countedTotal - expectedTotal));

  return {
    ...item,
    expectedTotal,
    countedTotal,
    difference,
    statusLabel: getClosingStatusLabel(difference)
  };
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
