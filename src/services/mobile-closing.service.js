import { buildClosingSummary, getCashClosings } from './cash-closing.service.js';

export function getMobileClosingSummary() {
  const base = buildClosingSummary({});
  const current = buildClosingSummary({ countedCash: base.payments.expectedCash });
  const history = getCashClosings();

  return {
    expectedCash: current.payments.expectedCash,
    expectedPix: current.payments.expectedPix,
    expectedDebit: current.payments.expectedDebit,
    expectedCredit: current.payments.expectedCredit,
    entriesTotal: current.totals.entries,
    outputsTotal: current.totals.outputs,
    cashDifference: current.payments.cashDifference,
    generalDifference: current.payments.generalDifference,
    history
  };
}
