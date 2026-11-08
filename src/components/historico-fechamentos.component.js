import { formatCurrency } from '../utils/currency.js?v=20260804-06';

export function renderHistoricoFechamentos(closings, getSalesAfterClosing) {
  if (!closings.length) {
    return `
      <section class="ui-panel">
        <h2 class="ui-head">Fechamentos salvos</h2>
        <p class="cx-empty">Nenhum fechamento salvo.</p>
      </section>
    `;
  }

  return `
    <section class="ui-panel">
      <h2 class="ui-head">Fechamentos salvos <span>${closings.length} fechamento(s)</span></h2>
      <div class="cx-list">
        ${closings.slice(0, 5).map((closing) => {
          const afterClosing = getSalesAfterClosing(closing);
          const difference = Number(closing.totals?.generalDifference || 0);
          return `
            <article class="cx-list__row cx-list__row--stack">
              <div class="cx-list__name">
                <strong>${formatDate(closing.closedAt)}</strong>
                <small>${afterClosing.length ? `${afterClosing.length} venda(s) após o fechamento` : 'Sem vendas após o fechamento'}</small>
              </div>
              <b class="${difference < 0 ? 'cx-minus' : 'cx-plus'}">${formatCurrency(difference)}</b>
            </article>
          `;
        }).join('')}
      </div>
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
