import { formatCurrency } from '../utils/currency.js?v=20260804-06';

// Vendas por periodo: barras verticais, a maior em ambar.
export function renderVendasPorPeriodo(series) {
  const maxSales = Math.max(...series.map((item) => item.sales), 1);

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Vendas por período <span>${series.length} ponto(s)</span></h2>
      ${series.length ? `
        <div class="cx-bars">
          ${series.map((item) => `
            <div class="cx-bars__col${item.sales > 0 && item.sales === maxSales ? ' is-peak' : ''}" title="${formatCurrency(item.sales)}">
              <i style="height:${Math.max((item.sales / maxSales) * 100, 4)}%"></i>
              <span>${item.label.slice(5)}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p class="cx-empty">Nenhuma venda no período.</p>'}
    </section>
  `;
}

// Formas de pagamento em barras horizontais (ui-bars), proporcionais ao maior valor.
export function renderFormasPagamento(summary) {
  const payments = summary.paymentTotals;
  const rows = [
    ['Dinheiro', payments.dinheiro],
    ['Pix', payments.pix],
    ['Débito', payments.debito],
    ['Crédito', payments.credito],
    ['Outros', payments.outros]
  ];
  const max = Math.max(...rows.map(([, value]) => Number(value) || 0), 0);

  return `
    <div class="ui-bars">
      ${rows.map(([label, value]) => `
        <div class="ui-bar-row">
          <span>${label}</span>
          <div class="track"><i style="width:${max > 0 ? Math.round(((Number(value) || 0) / max) * 100) : 0}%;--c:var(--ink)"></i></div>
          <b>${formatCurrency(value)}</b>
        </div>
      `).join('')}
    </div>
  `;
}
