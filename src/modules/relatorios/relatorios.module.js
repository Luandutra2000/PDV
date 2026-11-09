import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getFinancialMovements,
  getProductRanking
} from '../../services/crm-dashboard.service.js?v=20261109-01';
import { getCategories } from '../../services/product.service.js?v=20261109-01';
import { getFinancialCategories } from '../../services/financial.service.js?v=20261109-01';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20261109-01';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-21';

const reportState = {
  period: 'today',
  customStart: '',
  customEnd: ''
};
const boundContainers = new WeakSet();

const PERIODS = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['week', '7 dias'],
  ['month', 'Mês'],
  ['custom', 'Período']
];

const PAYMENT_LABELS = [
  ['dinheiro', 'Dinheiro'],
  ['pix', 'Pix'],
  ['debito', 'Débito'],
  ['credito', 'Crédito'],
  ['outros', 'Outros']
];

const MOVEMENT_CATEGORY_LABELS = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  debito: 'Débito',
  credito: 'Crédito',
  'sem-categoria': 'Sem categoria'
};

const MOVEMENT_LIMIT = 20;

export function initRelatoriosModule(container) {
  renderReports(container);

  if (boundContainers.has(container)) {
    return;
  }

  container.addEventListener('click', (event) => {
    const button = event.target.closest('[data-report-period]');

    if (!button || !event.target.closest('[data-reports-screen]')) {
      return;
    }

    const period = button.dataset.reportPeriod;

    if (PERIODS.some(([value]) => value === period)) {
      reportState.period = period;
      renderReports(container);
    }
  });

  container.addEventListener('change', (event) => {
    if (!event.target.closest('[data-reports-screen]')) {
      return;
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

  container.innerHTML = renderReportsMarkup({
    period: reportState.period,
    customStart: reportState.customStart,
    customEnd: reportState.customEnd,
    summary: getCrmSummary(filter),
    products: getProductRanking(filter),
    categories: getCategoryRanking(filter),
    allCategories: getCategories(),
    movements: getFinancialMovements(filter)
  });
}

export function renderReportsMarkup({
  period = 'today',
  customStart = '',
  customEnd = '',
  summary = {},
  products = {},
  categories = [],
  allCategories = [],
  movements = []
}) {
  const hourlySales = buildHourlySales(movements);

  return `
    <section class="ui-screen rp" data-reports-screen>
      <header class="ui-head rp-head">
        <div class="rp-head__title">
          <h1 class="rp-title">Relatórios</h1>
          <p class="rp-sub">Vendas, pagamentos, produtos e categorias do período.</p>
        </div>
        <div class="ui-head__actions">
          ${renderPeriodSelector(period)}
        </div>
      </header>

      ${period === 'custom' ? `
        <div class="rp-range">
          <input class="ui-input" type="date" aria-label="Data inicial do relatório" data-report-start value="${escapeHtml(customStart)}">
          <input class="ui-input" type="date" aria-label="Data final do relatório" data-report-end value="${escapeHtml(customEnd)}">
        </div>
      ` : ''}

      <div class="ui-stats rp-stats" aria-label="Resumo dos relatórios">
        ${renderStat('Total vendido', formatCurrency(summary.salesTotal))}
        ${renderStat('Entradas', formatCurrency(summary.entriesTotal), 'is-plus')}
        ${renderStat('Saídas', formatCurrency(summary.outputsTotal), 'is-minus')}
        ${renderStat('Caixa líquido', formatCurrency(summary.estimatedProfit), Number(summary.estimatedProfit) < 0 ? 'is-minus' : '')}
        ${renderStat('Ticket médio', formatCurrency(summary.ticketAverage))}
        ${renderStat('Comandas fechadas', Number(summary.closedComandas || 0))}
      </div>

      <div class="ui-cols">
        ${renderHourlyPanel(hourlySales, period)}
        <div class="rp-side">
          ${renderPaymentPanel(summary.paymentTotals)}
          ${renderCategoryPanel(categories, allCategories)}
        </div>
      </div>

      <div class="ui-cols ui-cols--even">
        ${renderProductsPanel(products.byQuantity, allCategories)}
        ${renderMovementsPanel(movements.slice(0, MOVEMENT_LIMIT))}
      </div>
    </section>
  `;
}

// Soma das vendas por hora do dia, da primeira a ultima hora com venda. Horas sem
// venda no meio da faixa entram com zero, para o grafico nao esconder os intervalos.
export function buildHourlySales(movements = []) {
  const totals = new Map();

  movements.forEach((movement) => {
    if (movement.type !== 'venda') {
      return;
    }

    const date = new Date(movement.createdAt);

    if (Number.isNaN(date.getTime())) {
      return;
    }

    const hour = date.getHours();
    totals.set(hour, (totals.get(hour) || 0) + Number(movement.amount || 0));
  });

  if (!totals.size) {
    return [];
  }

  const hours = [...totals.keys()];
  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const series = [];

  for (let hour = first; hour <= last; hour += 1) {
    series.push({ hour, total: totals.get(hour) || 0 });
  }

  return series;
}

function renderPeriodSelector(activePeriod) {
  return `
    <div class="ui-seg" role="group" aria-label="Período do relatório">
      ${PERIODS.map(([value, label]) => `<button type="button" class="${activePeriod === value ? 'is-on' : ''}" data-report-period="${value}" aria-pressed="${activePeriod === value}">${label}</button>`).join('')}
    </div>
  `;
}

function renderStat(label, value, tone = '') {
  return `
    <div class="ui-stat ${tone}">
      <small>${label}</small>
      <b>${value}</b>
    </div>
  `;
}

function renderHourlyPanel(series, period) {
  const caption = period === 'today' || period === 'yesterday'
    ? 'o horário de pico em destaque'
    : 'soma de todos os dias do período';
  const max = Math.max(0, ...series.map((point) => point.total));
  const peakHour = series.find((point) => point.total === max)?.hour;

  return `
    <section class="ui-panel rp-main">
      <h2 class="ui-head">Vendas por hora <span>${caption}</span></h2>
      ${series.length ? `
        <div class="rp-chart">
          ${series.map((point) => {
            const height = max > 0 ? Math.round((point.total / max) * 100) : 0;
            const peak = point.hour === peakHour && max > 0;

            return `
              <div class="rp-col" title="${formatHour(point.hour)}: ${formatCurrency(point.total)}">
                <span class="rp-val">${point.total > 0 ? `R$ ${Math.round(point.total)}` : ''}</span>
                <i class="rp-bar${peak ? ' is-peak' : ''}" style="height:${height}%"></i>
              </div>
            `;
          }).join('')}
        </div>
        <div class="rp-hours">
          ${series.map((point) => `<span>${formatHour(point.hour)}</span>`).join('')}
        </div>
      ` : '<p class="rp-empty">Nenhuma venda no período.</p>'}
    </section>
  `;
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}h`;
}

function renderPaymentPanel(totals = {}) {
  const rows = PAYMENT_LABELS
    .map(([key, label]) => ({ label, value: Number(totals?.[key] || 0) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Formas de pagamento</h2>
      ${renderBars(rows.map((row) => ({ label: row.label, value: row.value, color: 'var(--ink)' })), 'Nenhuma venda no período.')}
    </section>
  `;
}

// Categoria apagada ou desconhecida (fora de getCategories) fica em --muted e nao gasta cor da paleta.
function getKnownCategoryColorVar(categoryId, allCategories = []) {
  const category = allCategories.find((current) => current.id === categoryId);
  return category ? getCategoryColorVar(category, allCategories) : 'var(--muted)';
}

function renderCategoryPanel(ranking = [], allCategories = []) {
  const rows = ranking.slice(0, 10).map((item) => {
    const label = escapeHtml(item.name);

    return {
      label,
      value: Number(item.revenue || 0),
      color: getKnownCategoryColorVar(item.categoryId, allCategories)
    };
  });

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Por categoria</h2>
      ${renderBars(rows, 'Nenhuma venda no período.')}
    </section>
  `;
}

function renderBars(rows, emptyText) {
  if (!rows.length) {
    return `<p class="rp-empty">${emptyText}</p>`;
  }

  const max = Math.max(...rows.map((row) => row.value));

  return `
    <div class="ui-bars">
      ${rows.map((row) => `
        <div class="ui-bar-row">
          <span>${row.label}</span>
          <div class="track"><i style="width:${max > 0 ? Math.round((row.value / max) * 100) : 0}%;--c:${row.color}"></i></div>
          <b>${formatCurrency(row.value)}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function renderProductsPanel(ranking = [], allCategories = []) {
  const rows = (ranking || []).slice(0, 10).map((item) => {
    const name = escapeHtml(item.name);
    const color = getKnownCategoryColorVar(item.categoryId, allCategories);

    return `
      <tr>
        <td><i class="ui-stripe" style="--c:${color}"></i><b>${name}</b></td>
        <td class="r">${Number(item.quantity || 0)}</td>
        <td class="r">${formatCurrency(item.revenue)}</td>
      </tr>
    `;
  });

  return renderTablePanel('Produtos mais vendidos', [['Produto', ''], ['Qtd', 'r'], ['Faturamento', 'r']], rows);
}

function renderMovementsPanel(movements = []) {
  // Entradas/saidas guardam o id da categoria financeira (ex.: outros-financeiro).
  const financialNames = new Map(getFinancialCategories({ activeOnly: false }).map((category) => [category.id, category.name]));
  const rows = movements.map((item) => {
    const description = escapeHtml(item.description);
    const category = escapeHtml(MOVEMENT_CATEGORY_LABELS[item.category] || financialNames.get(item.category) || item.category);
    const entry = item.type === 'entrada';
    const output = item.type === 'saida' || item.type === 'sangria';
    const sign = entry ? '+ ' : output ? '− ' : '';

    return `
      <tr>
        <td>${description}</td>
        <td><span class="ui-pill">${category}</span></td>
        <td class="r rp-amount${entry ? ' is-plus' : ''}${output ? ' is-minus' : ''}">${sign}${formatCurrency(item.amount)}</td>
      </tr>
    `;
  });

  return renderTablePanel('Movimentações recentes', [['Movimento', ''], ['Categoria', ''], ['Valor', 'r']], rows);
}

function renderTablePanel(title, headers, rows) {
  return `
    <section class="ui-panel">
      <h2 class="ui-head">${title} <span>${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}</span></h2>
      ${rows.length ? `
        <div class="rp-scroll">
          <table class="ui-table">
            <thead><tr>${headers.map(([header, align]) => `<th${align ? ` class="${align}"` : ''}>${header}</th>`).join('')}</tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
      ` : '<p class="rp-empty">Nenhum dado no período selecionado.</p>'}
    </section>
  `;
}
