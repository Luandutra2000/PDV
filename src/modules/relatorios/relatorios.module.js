import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getFinancialMovements,
  getProductRanking
} from '../../services/crm-dashboard.service.js?v=20260804-02';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-02';
import { on } from '../../services/event-bus.service.js?v=20260804-02';
import { formatCurrency } from '../../utils/currency.js?v=20260804-02';
import { escapeHtml } from '../../utils/dom.js?v=20260804-02';

const reportState = {
  period: 'today',
  customStart: '',
  customEnd: ''
};
const boundContainers = new WeakSet();

export function initRelatoriosModule(container) {
  renderReports(container);

  if (boundContainers.has(container)) {
    return;
  }

  container.addEventListener('change', (event) => {
    if (!event.target.closest('[data-reports-screen]')) {
      return;
    }

    if (event.target.matches('[data-report-period]')) {
      reportState.period = event.target.value;
      renderReports(container);
    }

    if (event.target.matches('[data-report-start]')) {
      reportState.customStart = event.target.value;
      renderReports(container);
    }

    if (event.target.matches('[data-report-end]')) {
      reportState.customEnd = event.target.value;
      renderReports(container);
    }
  });

  on(UI_EVENTS.cashSummaryChanged, () => renderIfActive(container));
  on(UI_EVENTS.showcaseDataChanged, () => renderIfActive(container));
  boundContainers.add(container);
}

function renderIfActive(container) {
  if (container.querySelector('[data-reports-screen]')) {
    renderReports(container);
  }
}

function renderReports(container) {
  const filter = createPeriodFilter(reportState.period, reportState.customStart, reportState.customEnd);
  const summary = getCrmSummary(filter);
  const products = getProductRanking(filter);
  const categories = getCategoryRanking(filter);
  const movements = getFinancialMovements(filter).slice(0, 20);

  container.innerHTML = `
    <section class="module-screen" data-reports-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Relatorios</h1>
          <p class="module-subtitle">Vendas, pagamentos, produtos, categorias e movimentacoes reconciliados por periodo.</p>
        </div>
        <label class="stacked-label">
          Periodo
          <select class="field" data-report-period>
            ${renderPeriodOptions()}
          </select>
        </label>
      </header>

      ${reportState.period === 'custom' ? `
        <div class="products-filter-row">
          <input class="field" type="date" aria-label="Data inicial do relatorio" data-report-start value="${escapeHtml(reportState.customStart)}">
          <input class="field" type="date" aria-label="Data final do relatorio" data-report-end value="${escapeHtml(reportState.customEnd)}">
        </div>
      ` : ''}

      <section class="summary-grid" aria-label="Resumo dos relatorios">
        ${renderMetric('Total vendido', summary.salesTotal)}
        ${renderMetric('Entradas', summary.entriesTotal)}
        ${renderMetric('Saidas', summary.outputsTotal)}
        ${renderMetric('Caixa liquido', summary.estimatedProfit)}
        ${renderMetric('Ticket medio', summary.ticketAverage)}
        ${renderMetric('Comandas fechadas', summary.closedComandas, false)}
      </section>

      <div class="crm-grid">
        ${renderPaymentReport(summary.paymentTotals)}
        ${renderRankingReport('Produtos mais vendidos', products.byQuantity)}
      </div>

      <div class="crm-grid">
        ${renderCategoryReport(categories)}
        ${renderMovementReport(movements)}
      </div>
    </section>
  `;
}

function renderMetric(label, value, currency = true) {
  return `
    <article class="summary-card">
      <span>${label}</span>
      <strong>${currency ? formatCurrency(value) : Number(value || 0)}</strong>
    </article>
  `;
}

function renderPaymentReport(totals = {}) {
  const rows = [
    ['Dinheiro', totals.dinheiro],
    ['Pix', totals.pix],
    ['Debito', totals.debito],
    ['Credito', totals.credito],
    ['Outros', totals.outros]
  ];

  return renderReportTable('Formas de pagamento', ['Forma', 'Total'], rows.map(([label, value]) => [
    label,
    formatCurrency(value)
  ]));
}

function renderRankingReport(title, ranking = []) {
  const rows = ranking.slice(0, 10).map((item) => [
    escapeHtml(item.name),
    Number(item.quantity || 0),
    formatCurrency(item.revenue)
  ]);
  return renderReportTable(title, ['Produto', 'Qtd', 'Faturamento'], rows);
}

function renderCategoryReport(ranking = []) {
  const rows = ranking.slice(0, 10).map((item) => [
    escapeHtml(item.name),
    Number(item.quantity || 0),
    formatCurrency(item.revenue)
  ]);
  return renderReportTable('Categorias', ['Categoria', 'Qtd', 'Faturamento'], rows);
}

function renderMovementReport(movements = []) {
  const rows = movements.map((item) => [
    escapeHtml(item.description),
    escapeHtml(item.category),
    formatCurrency(item.amount)
  ]);
  return renderReportTable('Movimentacoes recentes', ['Movimento', 'Categoria', 'Valor'], rows);
}

function renderReportTable(title, headers, rows) {
  return `
    <section class="crm-panel">
      <header class="crm-panel__header">
        <h3>${title}</h3>
        <span>${rows.length} registro(s)</span>
      </header>
      ${rows.length ? `
        <div class="comparison-table">
          <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
            <tbody>
              ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty-products">Nenhum dado no periodo selecionado.</div>'}
    </section>
  `;
}

function renderPeriodOptions() {
  return [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['week', 'Ultimos 7 dias'],
    ['month', 'Mes'],
    ['custom', 'Personalizado']
  ].map(([value, label]) => (
    `<option value="${value}" ${reportState.period === value ? 'selected' : ''}>${label}</option>`
  )).join('');
}
