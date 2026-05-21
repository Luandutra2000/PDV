import { formatCurrency } from '../utils/currency.js';

export function renderDashboardResumo(summary) {
  const cards = [
    ['Total vendido', formatCurrency(summary.salesTotal), 'R$'],
    ['Entradas', formatCurrency(summary.entriesTotal), '+'],
    ['Saidas', formatCurrency(summary.outputsTotal), '-'],
    ['Lucro estimado', formatCurrency(summary.estimatedProfit), '%'],
    ['Ticket medio', formatCurrency(summary.ticketAverage), 'TM'],
    ['Comandas fechadas', summary.closedComandas, 'CF']
  ];

  return `
    <section class="crm-kpis">
      ${cards.map(([label, value, icon]) => `
        <article class="crm-kpi">
          <div class="crm-kpi__icon">${icon}</div>
          <div>
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        </article>
      `).join('')}
    </section>
  `;
}
