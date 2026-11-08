import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';

export function renderEntradasSaidas(movements) {
  const rows = movements.slice(0, 10);

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Movimentações financeiras <span>${movements.length} registro(s)</span></h2>
      ${rows.length ? `
        <table class="ui-table">
          <thead><tr><th>Movimento</th><th>Categoria</th><th class="r">Valor</th></tr></thead>
          <tbody>
            ${rows.map((movement) => `
              <tr>
                <td>${escapeHtml(movement.description || movement.type)}</td>
                <td>${escapeHtml(movement.category)}</td>
                <td class="r"><b class="${movement.type === 'saida' ? 'cx-minus' : 'cx-plus'}">${formatCurrency(movement.amount)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      ` : '<p class="cx-empty">Nenhuma movimentação no período.</p>'}
    </section>
  `;
}
