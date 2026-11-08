import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getFinancialMovements,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js?v=20260804-06';
import { buildClosingSummary, confirmClosing, getCashClosings, getSalesAfterClosing, saveClosingDraft } from '../../services/cash-closing.service.js?v=20260804-06';
import { renderDashboardResumo } from '../../components/dashboard-resumo.component.js?v=20260807-12';
import { renderFormasPagamento, renderVendasPorPeriodo } from '../../components/graficos-financeiros.component.js?v=20260807-12';
import { renderMaisVendidos, renderRankingFaturamento } from '../../components/analise-produtos.component.js?v=20260807-12';
import { renderEntradasSaidas } from '../../components/entradas-saidas.component.js?v=20260807-12';
import { renderHistoricoFechamentos } from '../../components/historico-fechamentos.component.js?v=20260807-12';
import { renderCashActionButtons, renderCashMovementModal, renderWriteOffModal, submitCashMovementForm, submitWriteOffForm } from '../../components/cash-actions.component.js?v=20260807-21';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-21';
import { getCategories } from '../../services/product.service.js?v=20260804-06';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { getCashSessionStatus } from '../../services/cash-session.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { getTransactionSyncStatus } from '../../services/transaction.service.js?v=20260804-06';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { getDifferenceTone } from '../../utils/difference-tone.js?v=20260807-21';

const caixaState = {
  period: 'today',
  customStart: '',
  customEnd: '',
  countedCash: '',
  checkedPix: '',
  checkedDebit: '',
  checkedCredit: '',
  note: '',
  modal: null
};
const boundContainers = new WeakSet();

export function initCaixaModule(container) {
  caixaState.modal = null;
  renderCaixa(container);

  if (!boundContainers.has(container)) {
    bindCaixaEvents(container);
    const refresh = () => {
      if (!container.querySelector('[data-caixa-screen]')) {
        return;
      }

      // Com Entrada/Saida/Perda aberto, redesenhar apagaria o que ja foi digitado:
      // so a etiqueta de sincronizacao muda. Fechar o modal redesenha a tela inteira.
      if (caixaState.modal) {
        const syncStatus = container.querySelector('[data-caixa-sync]');
        if (syncStatus) {
          syncStatus.outerHTML = renderFinancialSyncStatus();
        }
        return;
      }

      renderCaixa(container);
    };
    on(UI_EVENTS.financialSyncStatusChanged, refresh);
    on(UI_EVENTS.cashSessionChanged, refresh);
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
  const categories = getCategories();
  const getColorVar = (item) => {
    const category = categories.find((candidate) => candidate.id === item.categoryId);
    return category ? getCategoryColorVar(category, categories) : 'var(--muted)';
  };

  container.innerHTML = `
    <section class="ui-screen cx" data-caixa-screen>
      <header class="ui-head cx-head">
        <div class="cx-head__title">
          <h1 class="cx-title">Caixa</h1>
          <p class="cx-open">${renderOpeningLine()}</p>
        </div>
        ${renderPeriodFilters()}
        <div class="ui-head__actions cx-head__actions">
          ${renderCashActionButtons(getCurrentUser(), { includeQuickClosing: false })}
        </div>
      </header>

      ${renderFinancialSyncStatus()}
      ${renderDashboardResumo(summary)}
      <div class="ui-cols cx-cols">
        ${renderClosingPanel(closingSummary)}
        <section class="ui-panel cx-side">
          <h2 class="ui-head">Formas de pagamento</h2>
          ${renderFormasPagamento(summary)}
          <p class="cx-note">O dinheiro esperado soma as vendas em dinheiro e as entradas, menos as saídas.</p>
          ${renderMaisVendidos({ productRanking, categoryRanking, getColorVar })}
        </section>
      </div>
      <div class="ui-cols ui-cols--even">
        ${renderVendasPorPeriodo(series)}
        ${renderRankingFaturamento({ productRanking })}
      </div>
      <div class="ui-cols ui-cols--even">
        ${renderEntradasSaidas(movements)}
        ${renderHistoricoFechamentos(closings, getSalesAfterClosing)}
      </div>
      <div class="cx-modal" data-caixa-modal>${renderCaixaModal()}</div>
    </section>
  `;
}

function renderOpeningLine() {
  const { open, session } = getCashSessionStatus();

  if (!open || !session) {
    return 'Caixa fechado';
  }

  const openedAt = session.openedAt ? new Date(session.openedAt) : null;
  const time = openedAt && !Number.isNaN(openedAt.getTime())
    ? openedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '';
  const name = String(session.openedByName || '').trim();
  const opening = formatCurrency(session.openingAmount || 0);

  return `Aberto${time ? ` às ${time}` : ''}${name ? ` por ${escapeHtml(name)}` : ''}, com ${opening} de troco inicial.`;
}

function renderCaixaModal() {
  if (caixaState.modal === 'entrada' || caixaState.modal === 'saida') {
    return renderCashMovementModal(caixaState.modal);
  }

  if (caixaState.modal === 'write-off') {
    return renderWriteOffModal();
  }

  return '';
}

function renderFinancialSyncStatus() {
  const status = getTransactionSyncStatus();
  const label = status.state === 'pending'
    ? `${status.pending || 0} alteração(ões) financeira(s) pendente(s)`
    : status.state === 'local'
      ? 'Modo local'
      : status.state === 'error'
        ? 'Sincronização financeira com erro'
        : status.state === 'cache'
          ? 'Usando dados financeiros em cache'
          : 'Financeiro sincronizado';
  const tone = status.state === 'error' ? ' ui-pill--danger' : ['pending', 'cache'].includes(status.state) ? ' ui-pill--warn' : status.state === 'synced' ? ' ui-pill--ok' : '';

  return `<div class="cx-sync" data-caixa-sync><span class="ui-pill${tone}" data-sync-state="${status.state}">${label}</span></div>`;
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

    const action = actionButton?.dataset.action;
    const modalByAction = { 'open-entry': 'entrada', 'open-output': 'saida', 'open-write-off': 'write-off' };

    if (modalByAction[action]) {
      caixaState.modal = modalByAction[action];
      renderCaixa(container);
      return;
    }

    if (action === 'close-modal') {
      caixaState.modal = null;
      renderCaixa(container);
      return;
    }

    if (action === 'confirm-crm-closing') {
      confirmCrmClosing(container);
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest?.('[data-caixa-screen]')) {
      return;
    }

    const submitter = event.target.matches('[data-cash-form]')
      ? submitCashMovementForm
      : event.target.matches('[data-write-off-form]')
        ? submitWriteOffForm
        : null;

    if (!submitter) {
      return;
    }

    event.preventDefault();
    submitter(new FormData(event.target)).then((saved) => {
      if (saved) {
        caixaState.modal = null;
        renderCaixa(container);
      }
    });
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
      updateClosingDifference(container);
    }
  });
}

// Diferenca negativa em vermelho; zero ou positiva em verde (regra unica em difference-tone.js).
function differenceTone(value) {
  return getDifferenceTone(value) === 'minus' ? 'is-neg' : 'is-pos';
}

function formatDifference(value) {
  const amount = Number(value) || 0;
  return amount < 0 ? `− ${formatCurrency(Math.abs(amount))}` : formatCurrency(amount);
}

function applyDifference(element, value, extraClass = '') {
  if (!element) {
    return;
  }

  if (value === null || value === undefined) {
    element.textContent = '—';
    element.className = `cx-diff is-none ${extraClass}`.trim();
    return;
  }

  element.textContent = formatDifference(value);
  element.className = `cx-diff ${differenceTone(value)} ${extraClass}`.trim();
}

function updateClosingDifference(container) {
  const summary = getCrmSummary(createPeriodFilter(caixaState.period, caixaState.customStart, caixaState.customEnd));
  const closing = buildClosingSummary(buildCrmClosingInput(summary, caixaState));
  const { payments } = closing;

  applyDifference(container.querySelector('[data-crm-closing-difference]'), payments.generalDifference, 'cx-diff--big');
  applyDifference(container.querySelector('[data-crm-row-difference="cash"]'), payments.cashDifference);
  applyDifference(container.querySelector('[data-crm-row-difference="pix"]'), payments.pixDifference);
  applyDifference(container.querySelector('[data-crm-row-difference="debit"]'), payments.debitDifference);
  applyDifference(container.querySelector('[data-crm-row-difference="credit"]'), payments.creditDifference);
}

function renderPeriodFilters() {
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['week', 'Semana'],
    ['month', 'Mês'],
    ['custom', 'Personalizado']
  ];

  return `
    <div class="cx-period">
      <div class="ui-seg" role="group" aria-label="Período">
        ${options.map(([value, label]) => `
          <button${caixaState.period === value ? ' class="is-on" aria-pressed="true"' : ' aria-pressed="false"'} type="button" data-crm-period="${value}">${label}</button>
        `).join('')}
      </div>
      ${caixaState.period === 'custom' ? `
        <input class="ui-input cx-date" type="date" aria-label="Data inicial" data-crm-custom-start value="${escapeHtml(caixaState.customStart)}">
        <input class="ui-input cx-date" type="date" aria-label="Data final" data-crm-custom-end value="${escapeHtml(caixaState.customEnd)}">
      ` : ''}
    </div>
  `;
}

function renderClosingPanel(closingSummary) {
  const canClose = caixaState.period === 'today';
  const { payments } = closingSummary;
  const rows = [
    ['Dinheiro', 'cash', 'countedCash', caixaState.countedCash, payments.expectedCash, payments.cashDifference],
    ['Pix', 'pix', 'checkedPix', caixaState.checkedPix, payments.expectedPix, payments.pixDifference],
    ['Débito', 'debit', 'checkedDebit', caixaState.checkedDebit, payments.expectedDebit, payments.debitDifference],
    ['Crédito', 'credit', 'checkedCredit', caixaState.checkedCredit, payments.expectedCredit, payments.creditDifference]
  ];

  return `
    <section class="ui-panel cx-closing">
      <h2 class="ui-head">Conferência do fechamento <span>${canClose ? 'digite o que foi contado' : 'resumo do período selecionado'}</span></h2>
      <div class="cx-scroll">
        <table class="ui-table">
          <thead><tr><th>Forma</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferença</th></tr></thead>
          <tbody>
            ${rows.map(([label, key, field, value, expected, difference]) => `
              <tr>
                <td><b>${label}</b></td>
                <td class="r">${formatCurrency(expected)}</td>
                <td class="r">${renderClosingInput(field, `${label} contado`, value)}</td>
                <td class="r">${renderDifference(difference, `data-crm-row-difference="${key}"`)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      <div class="ui-field">
        <label for="cx-closing-note">Observação do fechamento</label>
        <input class="ui-input" id="cx-closing-note" data-crm-closing-input="note" value="${escapeHtml(caixaState.note)}" placeholder="Obrigatória se houver diferença">
      </div>
      <footer class="cx-closing__foot">
        <span class="cx-muted">Diferença geral</span>
        ${renderDifference(payments.generalDifference, 'data-crm-closing-difference', 'cx-diff--big')}
        <button class="ui-btn ui-btn--primary cx-close-btn" type="button" data-action="confirm-crm-closing"${canClose ? '' : ' disabled'}>${canClose ? 'Fechar caixa' : 'Selecione Hoje para fechar'}</button>
      </footer>
    </section>
  `;
}

function renderDifference(value, attribute, extraClass = '') {
  if (value === null || value === undefined) {
    return `<b class="cx-diff is-none ${extraClass}" ${attribute}>—</b>`;
  }

  return `<b class="cx-diff ${differenceTone(value)} ${extraClass}" ${attribute}>${formatDifference(value)}</b>`;
}

function renderClosingInput(name, label, value) {
  const minimum = name === 'countedCash' ? '' : ' min="0"';

  return `<input class="ui-input cx-count" data-crm-closing-input="${name}" type="number"${minimum} step="0.01" inputmode="decimal" aria-label="${label}" value="${escapeHtml(value)}">`;
}

function confirmCrmClosing(container) {
  try {
    if (caixaState.period !== 'today') {
      throw new Error('Selecione Hoje para fechar a sessao atual.');
    }

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
    const closing = confirmClosing(draft);
    showNotification({
      title: 'Caixa fechado',
      message: closing.warnings?.length ? closing.warnings.join(' ') : 'Fechamento salvo no historico do CRM.',
      type: closing.warnings?.length ? 'warning' : 'success'
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
