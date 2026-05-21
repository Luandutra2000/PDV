import { formatCurrency } from '../utils/currency.js';

export function renderHistoricoFechamentos(closings, getSalesAfterClosing) {
  if (!closings.length) {
    return '<div class="empty-products">Nenhum fechamento salvo.</div>';
  }

  return `
    <section class="crm-panel">
      <header class="crm-panel__header">
        <h3>Historico de fechamentos</h3>
        <span>${closings.length} fechamento(s)</span>
      </header>
      ${closings.slice(0, 5).map((closing) => {
        const afterClosing = getSalesAfterClosing(closing);
        return `
          <article class="crm-closing-row">
            <div>
              <strong>${formatDate(closing.closedAt)}</strong>
              <span>${afterClosing.length ? `${afterClosing.length} venda(s) apos fechamento` : 'Sem vendas apos fechamento'}</span>
            </div>
            <strong>${formatCurrency(closing.totals?.generalDifference || 0)}</strong>
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
