import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getFinancialMovements,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js?v=20260729-12';
import { buildClosingSummary, confirmClosing, getCashClosings, getSalesAfterClosing, saveClosingDraft } from '../../services/cash-closing.service.js?v=20260729-12';
import { renderDashboardResumo } from '../../components/dashboard-resumo.component.js?v=20260729-12';
import { renderGraficosFinanceiros } from '../../components/graficos-financeiros.component.js?v=20260729-12';
import { renderAnaliseProdutos } from '../../components/analise-produtos.component.js?v=20260729-12';
import { renderEntradasSaidas } from '../../components/entradas-saidas.component.js?v=20260729-12';
import { renderHistoricoFechamentos } from '../../components/historico-fechamentos.component.js?v=20260729-12';
import { formatCurrency } from '../../utils/currency.js?v=20260729-12';
import { showNotification } from '../../services/notification.service.js?v=20260729-12';
import { getTransactionSyncStatus } from '../../services/transaction.service.js?v=20260729-12';
import { UI_EVENTS } from '../../database/schema.js?v=20260729-12';
import { on } from '../../services/event-bus.service.js?v=20260729-12';
import { escapeHtml } from '../../utils/dom.js?v=20260729-12';

const caixaState = {
  period: 'today',
  customStart: '',
  customEnd: '',
  countedCash: '',
  checkedPix: '',
  checkedDebit: '',
  checkedCredit: '',
  note: ''
};
const boundContainers = new WeakSet();

export function initCaixaModule(container) {
  renderCaixa(container);

  if (!boundContainers.has(container)) {
    bindCaixaEvents(container);
    on(UI_EVENTS.financialSyncStatusChanged, () => {
      if (container.querySelector('[data-caixa-screen]')) {
        renderCaixa(container);
      }
    });
    boundContainers.add(container);
  }
}

function renderCaixa(container) {
  const filter = createPeriodFilter(caixaState.period, caixaState.customStart, caixaState.customEnd);
  const summary = getCrmSummary(filter);
  const productRanking = getProductRanking(filter);
  const categoryRanking = getCategoryRanking(filter);
  const series = getSalesSeries(filter);
  const movements = getFinancialMovements(filter);
  const closings = getCashClosings();
  const closingSummary = buildClosingSummary(buildCrmClosingInput(summary, {
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit
  }));

  container.innerHTML = `
    <section class="module-screen crm-screen" data-caixa-screen>
      <header class="crm-header">
        <div>
          <h1 class="pdv-title">Fechar Caixa / CRM</h1>
          <p class="module-subtitle">Caixa, vendas, produtos, movimentacoes e fechamento em uma visao gerencial.</p>
        </div>
        ${renderPeriodFilters()}
      </header>

      ${renderFinancialSyncStatus()}
      ${renderDashboardResumo(summary)}
      ${renderGraficosFinanceiros({ summary, series })}
      ${renderAnaliseProdutos({ productRanking, categoryRanking })}
      <div class="crm-grid">
        ${renderClosingPanel(summary, closingSummary)}
        ${renderEntradasSaidas(movements)}
      </div>
      ${renderHistoricoFechamentos(closings, getSalesAfterClosing)}
    </section>
  `;
}

function renderFinancialSyncStatus() {
  const status = getTransactionSyncStatus();
  const label = status.state === 'pending'
    ? `${status.pending || 0} alteracao(oes) financeira(s) pendente(s)`
    : status.state === 'local'
      ? 'Modo local'
      : status.state === 'error'
        ? 'Sincronizacao financeira com erro'
        : status.state === 'cache'
          ? 'Usando dados financeiros em cache'
          : 'Financeiro sincronizado';

  return `<div class="sync-status" data-sync-state="${status.state}"><span>${label}</span></div>`;
}

function bindCaixaEvents(container) {
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-caixa-screen]')) {
      return;
    }

    const periodButton = event.target.closest('[data-crm-period]');
    const actionButton = event.target.closest('[data-action]');

    if (periodButton) {
      caixaState.period = periodButton.dataset.crmPeriod;
      renderCaixa(container);
      return;
    }

    if (actionButton?.dataset.action === 'confirm-crm-closing') {
      confirmCrmClosing(container);
    }
  });

  container.addEventListener('input', (event) => {
    if (!event.target.closest('[data-caixa-screen]')) {
      return;
    }

    if (event.target.matches('[data-crm-custom-start]')) {
      caixaState.customStart = event.target.value;
      renderCaixa(container);
      return;
    }

    if (event.target.matches('[data-crm-custom-end]')) {
      caixaState.customEnd = event.target.value;
      renderCaixa(container);
      return;
    }

    if (event.target.matches('[data-crm-closing-input]')) {
      caixaState[event.target.dataset.crmClosingInput] = event.target.value;
      renderCaixa(container);
    }
  });
}

function renderPeriodFilters() {
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['week', 'Semana'],
    ['month', 'Mes'],
    ['custom', 'Personalizado']
  ];

  return `
    <div class="crm-filters">
      ${options.map(([value, label]) => `
        <button class="crm-filter ${caixaState.period === value ? 'is-active' : ''}" type="button" data-crm-period="${value}">${label}</button>
      `).join('')}
      ${caixaState.period === 'custom' ? `
        <input class="field" type="date" data-crm-custom-start value="${caixaState.customStart}">
        <input class="field" type="date" data-crm-custom-end value="${caixaState.customEnd}">
      ` : ''}
    </div>
  `;
}

function renderClosingPanel(summary, closingSummary) {
  const expectedCash = closingSummary.payments.expectedCash;

  return `
    <section class="crm-panel crm-closing-card">
      <header class="crm-panel__header">
        <h3>Fechamento completo</h3>
        <span>Resumo do periodo selecionado</span>
      </header>
      <div class="crm-payment-row"><span>Vendas</span><strong>${formatCurrency(summary.salesTotal)}</strong></div>
      <div class="crm-payment-row"><span>Entradas</span><strong>${formatCurrency(summary.entriesTotal)}</strong></div>
      <div class="crm-payment-row"><span>Saídas</span><strong>${formatCurrency(summary.outputsTotal)}</strong></div>
      <div class="crm-payment-row"><span>Dinheiro esperado</span><strong>${formatCurrency(expectedCash)}</strong></div>
      <div class="crm-payment-row"><span>Pix esperado</span><strong>${formatCurrency(summary.paymentTotals.pix)}</strong></div>
      <div class="crm-payment-row"><span>Cartoes</span><strong>${formatCurrency(summary.paymentTotals.debito + summary.paymentTotals.credito)}</strong></div>
      <div class="closing-form-grid closing-form-grid--compact">
        ${renderClosingInput('countedCash', 'Dinheiro contado', caixaState.countedCash)}
        ${renderClosingInput('checkedPix', 'Pix conferido', caixaState.checkedPix)}
        ${renderClosingInput('checkedDebit', 'Debito conferido', caixaState.checkedDebit)}
        ${renderClosingInput('checkedCredit', 'Credito conferido', caixaState.checkedCredit)}
      </div>
      <label class="stacked-label">
        Observacao do fechamento
        <input class="field" data-crm-closing-input="note" value="${escapeHtml(caixaState.note)}" placeholder="Obrigatoria se houver diferenca">
      </label>
      <div class="crm-payment-row">
        <span>Diferenca geral</span>
        <strong class="${closingSummary.payments.generalDifference ? 'money-negative' : 'money-positive'}">${formatCurrency(closingSummary.payments.generalDifference)}</strong>
      </div>
      <button class="button" type="button" data-action="confirm-crm-closing">Fechar caixa</button>
    </section>
  `;
}

function renderClosingInput(name, label, value) {
  const minimum = name === 'countedCash' ? '' : ' min="0"';

  return `
    <label class="stacked-label closing-field">
      ${label}
      <input class="field" data-crm-closing-input="${name}" type="number"${minimum} step="0.01" value="${value}">
    </label>
  `;
}

function confirmCrmClosing(container) {
  try {
    const summary = getCrmSummary(createPeriodFilter(caixaState.period, caixaState.customStart, caixaState.customEnd));
    const closingInput = buildCrmClosingInput(summary, {
      countedCash: caixaState.countedCash,
      checkedPix: caixaState.checkedPix,
      checkedDebit: caixaState.checkedDebit,
      checkedCredit: caixaState.checkedCredit,
      note: caixaState.note
    });
    const closingSummary = buildClosingSummary(closingInput);
    const draft = saveClosingDraft({
      ...closingInput,
      differences: buildDifferences(closingSummary, caixaState.note)
    });
    confirmClosing(draft);
    showNotification({
      title: 'Caixa fechado',
      message: 'Fechamento salvo no historico do CRM.',
      type: 'success'
    });
    resetClosingFields();
    renderCaixa(container);
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel fechar',
      message: error.message || 'Confira os campos do fechamento.',
      type: 'danger'
    });
  }
}

function getClosingDifferences() {
  const crmSummary = getCrmSummary(createPeriodFilter(caixaState.period, caixaState.customStart, caixaState.customEnd));
  const summary = buildClosingSummary(buildCrmClosingInput(crmSummary, {
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit
  }));

  return buildDifferences(summary, caixaState.note);
}

export function buildCrmClosingInput(summary, input = {}) {
  return {
    ...input,
    expectedCash: normalizeReportMoney(Number(summary?.paymentTotals?.dinheiro || 0)
      + Number(summary?.entriesTotal || 0)
      - Number(summary?.outputsTotal || 0)),
    expectedPix: normalizeReportMoney(summary?.paymentTotals?.pix),
    expectedDebit: normalizeReportMoney(summary?.paymentTotals?.debito),
    expectedCredit: normalizeReportMoney(summary?.paymentTotals?.credito)
  };
}

function normalizeReportMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function resetClosingFields() {
  caixaState.countedCash = '';
  caixaState.checkedPix = '';
  caixaState.checkedDebit = '';
  caixaState.checkedCredit = '';
  caixaState.note = '';
}

export function buildDifferences(summary, note = '') {
  const paymentDifferences = [
    ['dinheiro', summary.payments.cashDifference],
    ['pix', summary.payments.pixDifference],
    ['debito', summary.payments.debitDifference],
    ['credito', summary.payments.creditDifference]
  ].filter(([, amount]) => amount !== null && Number(amount || 0) !== 0)
    .map(([referenceId, amount]) => ({
      key: `payment:${referenceId}`,
      scope: 'payment',
      referenceId,
      reason: 'fechamento-crm',
      note,
      amount
    }));

  const showcaseDifferences = (summary.showcase || [])
    .filter((item) => item.differenceQuantity !== null && Number(item.differenceQuantity || 0) !== 0)
    .map((item) => ({
      key: `showcase:${item.productId}`,
      scope: 'showcase',
      referenceId: item.productId,
      reason: 'fechamento-crm',
      note,
      amount: item.estimatedDifferenceValue || 0,
      quantity: item.differenceQuantity
    }));

  return [...paymentDifferences, ...showcaseDifferences];
}
