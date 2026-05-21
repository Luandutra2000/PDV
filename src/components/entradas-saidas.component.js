import { formatCurrency } from '../utils/currency.js';

export function renderEntradasSaidas(movements) {
  return `
    <section class="crm-panel">
      <header class="crm-panel__header">
        <h3>Movimentacoes financeiras</h3>
        <span>${movements.length} registro(s)</span>
      </header>
      <div class="crm-table">
        <div class="crm-table__head"><span>Movimento</span><span>Categoria</span><span>Valor</span></div>
        ${movements.slice(0, 10).map((movement) => `
          <div class="crm-table__row">
            <span>${movement.description || movement.type}</span>
            <span>${movement.category}</span>
            <strong class="${movement.type === 'saida' ? 'money-negative' : 'money-positive'}">${formatCurrency(movement.amount)}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
