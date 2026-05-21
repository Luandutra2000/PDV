import { formatCurrency } from '../utils/currency.js';

export function renderAnaliseProdutos({ productRanking, categoryRanking }) {
  const quantityRows = productRanking.byQuantity.slice(0, 6);
  const revenueRows = productRanking.byRevenue.slice(0, 6);
  const bestCategory = categoryRanking[0];

  return `
    <div class="crm-grid">
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Mais vendidos</h3>
          <span>${bestCategory ? `Categoria destaque: ${bestCategory.name}` : 'Sem vendas'}</span>
        </header>
        ${renderProductRows(quantityRows)}
      </section>
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Ranking por faturamento</h3>
        </header>
        ${renderProductRows(revenueRows)}
      </section>
    </div>
  `;
}

function renderProductRows(rows) {
  if (!rows.length) {
    return '<div class="empty-products">Nenhum produto vendido no periodo.</div>';
  }

  return `
    <div class="crm-table">
      <div class="crm-table__head"><span>Produto</span><span>Qtd</span><span>Total</span></div>
      ${rows.map((item) => `
        <div class="crm-table__row">
          <span>${item.name}</span>
          <span>${item.quantity}</span>
          <strong>${formatCurrency(item.revenue)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}
