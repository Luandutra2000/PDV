import { formatCurrency } from '../utils/currency.js?v=20260804-06';

// Cartoes de resumo da tela Caixa. O "Caixa atual" ja aparece na barra do topo.
export function renderDashboardResumo(summary) {
  const cards = [
    ['Total vendido', formatCurrency(summary.salesTotal), ''],
    ['Ticket médio', formatCurrency(summary.ticketAverage), ''],
    ['Comandas fechadas', String(summary.closedComandas), ''],
    ['Entradas', formatCurrency(summary.entriesTotal), 'is-plus'],
    ['Saídas', formatCurrency(summary.outputsTotal), 'is-minus']
  ];

  return `
    <section class="ui-stats cx-stats" style="--n:${cards.length}" aria-label="Resumo do período">
      ${cards.map(([label, value, tone]) => `
        <div class="ui-stat">
          <small>${label}</small>
          <b${tone ? ` class="${tone}"` : ''}>${value}</b>
        </div>
      `).join('')}
    </section>
  `;
}
