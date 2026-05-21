import { formatCurrency } from '../utils/currency.js';

export function renderGraficosFinanceiros({ summary, series }) {
  const maxSales = Math.max(...series.map((item) => item.sales), 1);
  const payments = summary.paymentTotals;

  return `
    <div class="crm-grid">
      <section class="crm-panel crm-panel--wide">
        <header class="crm-panel__header">
          <h3>Vendas por periodo</h3>
          <span>${series.length} ponto(s)</span>
        </header>
        <div class="crm-bars">
          ${series.map((item) => `
            <div class="crm-bar" style="height:${Math.max((item.sales / maxSales) * 100, 8)}%">
              <span>${item.label.slice(5)}</span>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Formas de pagamento</h3>
        </header>
        ${renderPaymentRow('Dinheiro', payments.dinheiro)}
        ${renderPaymentRow('Pix', payments.pix)}
        ${renderPaymentRow('Debito', payments.debito)}
        ${renderPaymentRow('Credito', payments.credito)}
        ${renderPaymentRow('Outros', payments.outros)}
      </section>
    </div>
  `;
}

function renderPaymentRow(label, value) {
  return `
    <div class="crm-payment-row">
      <span>${label}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `;
}
