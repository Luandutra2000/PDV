import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';

// Mais vendidos: lista curta com a faixa de cor da categoria (ui-stripe).
// `getColorVar(item)` devolve a cor da categoria do produto.
export function renderMaisVendidos({ productRanking, categoryRanking, getColorVar = () => 'var(--muted)' }) {
  const rows = productRanking.byQuantity.slice(0, 5);
  const bestCategory = categoryRanking[0];

  return `
    <h2 class="ui-head">Mais vendidos <span>${bestCategory ? `Categoria destaque: ${escapeHtml(bestCategory.name)}` : 'Sem vendas'}</span></h2>
    ${rows.length ? `
      <div class="cx-list">
        ${rows.map((item) => `
          <div class="cx-list__row">
            <span class="ui-stripe" style="--c:${escapeHtml(getColorVar(item))}"></span>
            <span class="cx-list__name">${escapeHtml(item.name)}</span>
            <b>${item.quantity} un.</b>
          </div>
        `).join('')}
      </div>
    ` : '<p class="cx-empty">Nenhum produto vendido no período.</p>'}
  `;
}

export function renderRankingFaturamento({ productRanking }) {
  const rows = productRanking.byRevenue.slice(0, 6);

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Ranking por faturamento</h2>
      ${rows.length ? `
        <table class="ui-table">
          <thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Total</th></tr></thead>
          <tbody>
            ${rows.map((item) => `
              <tr>
                <td>${escapeHtml(item.name)}</td>
                <td class="r">${item.quantity}</td>
                <td class="r"><b>${formatCurrency(item.revenue)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="cx-empty">Nenhum produto vendido no período.</p>'}
    </section>
  `;
}
