import { formatCurrency } from '../utils/currency.js';

export function renderFechamentoRapidoModal({ summary, closingSummary, showcase, state }) {
  const cards = [
    ['Vendido hoje', formatCurrency(summary.salesTotal)],
    ['Entradas', formatCurrency(summary.entriesTotal)],
    ['Saidas', formatCurrency(summary.outputsTotal)],
    ['Lucro estimado', formatCurrency(summary.estimatedProfit)]
  ];
  const cardTotals = summary.paymentTotals.debito + summary.paymentTotals.credito;

  return `
    <div class="modal-backdrop is-open">
      <div class="modal quick-closing-modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div>
            <h2>Fechamento rapido</h2>
            <p class="modal-text">Resumo do dia, conferencia de pagamentos e vitrine em uma tela.</p>
          </div>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <div class="quick-closing-body">
          <section class="quick-closing-summary">
            ${cards.map(([label, value]) => `
              <article class="quick-closing-card">
                <span>${label}</span>
                <strong>${value}</strong>
              </article>
            `).join('')}
          </section>

          <div class="quick-closing-tabs">
            ${renderTab('resumo', 'Resumo', state.quickClosingTab)}
            ${renderTab('pagamentos', 'Pagamentos', state.quickClosingTab)}
            ${renderTab('vitrine', 'Vitrine', state.quickClosingTab)}
          </div>

          ${state.quickClosingTab === 'pagamentos' ? renderPayments(summary, closingSummary, state, cardTotals) : ''}
          ${state.quickClosingTab === 'vitrine' ? renderShowcase(showcase, state) : ''}
          ${state.quickClosingTab === 'resumo' ? renderSummary(summary, closingSummary, showcase, state, cardTotals) : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTab(id, label, activeTab) {
  return `
    <button class="quick-closing-tab ${activeTab === id ? 'is-active' : ''}" type="button" data-quick-closing-tab="${id}">
      ${label}
    </button>
  `;
}

function renderSummary(summary, closingSummary, showcase, state, cardTotals) {
  const expectedCash = summary.paymentTotals.dinheiro + summary.entriesTotal - summary.outputsTotal;
  const showcaseDifferences = showcase.filter((item) => Number(item.differenceQuantity || 0));

  return `
    <section class="quick-closing-section">
      <div class="quick-closing-list">
        ${renderLine('Dinheiro esperado', formatCurrency(expectedCash))}
        ${renderLine('Pix esperado', formatCurrency(summary.paymentTotals.pix))}
        ${renderLine('Cartoes esperados', formatCurrency(cardTotals))}
        ${renderLine('Diferenca geral', formatCurrency(closingSummary.payments.generalDifference), closingSummary.payments.generalDifference ? 'money-negative' : 'money-positive')}
        ${renderLine('Divergencias na vitrine', `${showcaseDifferences.length} produto(s)`)}
      </div>
      <label class="stacked-label">
        Observacao do fechamento
        <input class="field" data-quick-note value="${state.quickClosing.note}" placeholder="Obrigatoria se houver sobra, falta ou diferenca">
      </label>
      <button class="button" type="button" data-action="confirm-quick-closing">Fechar caixa agora</button>
    </section>
  `;
}

function renderPayments(summary, closingSummary, state, cardTotals) {
  const expectedCash = summary.paymentTotals.dinheiro + summary.entriesTotal - summary.outputsTotal;

  return `
    <section class="quick-closing-section">
      <div class="quick-closing-payments">
        ${renderPaymentInput('countedCash', 'Dinheiro contado', expectedCash, state.quickClosing.countedCash)}
        ${renderPaymentInput('checkedPix', 'Pix conferido', summary.paymentTotals.pix, state.quickClosing.checkedPix)}
        ${renderPaymentInput('checkedDebit', 'Debito conferido', summary.paymentTotals.debito, state.quickClosing.checkedDebit)}
        ${renderPaymentInput('checkedCredit', 'Credito conferido', summary.paymentTotals.credito, state.quickClosing.checkedCredit)}
      </div>
      <div class="quick-closing-list">
        ${renderLine('Cartoes esperados', formatCurrency(cardTotals))}
        ${renderLine('Diferenca geral', formatCurrency(closingSummary.payments.generalDifference), closingSummary.payments.generalDifference ? 'money-negative' : 'money-positive')}
      </div>
    </section>
  `;
}

function renderPaymentInput(name, label, expected, value) {
  return `
    <label class="stacked-label">
      ${label}
      <span>Esperado: ${formatCurrency(expected)}</span>
      <input class="field" data-quick-payment="${name}" type="number" min="0" step="0.01" value="${value}">
    </label>
  `;
}

function renderShowcase(showcase, state) {
  if (!showcase.length) {
    return '<div class="empty-products">Nenhum produto lancado na vitrine hoje.</div>';
  }

  return `
    <section class="quick-closing-section">
      <div class="quick-showcase-table">
        <div class="quick-showcase-head"><span>Produto</span><span>Esperado</span><span>Contado</span><span>Dif.</span></div>
        ${showcase.map((item) => `
          <div class="quick-showcase-row">
            <span>${item.productName}</span>
            <span>${item.expectedLeftoverQuantity}</span>
            <input class="field closing-small-input" data-quick-leftover="${item.productId}" type="number" min="0" step="1" value="${state.quickClosing.leftovers[item.productId] || ''}">
            <strong class="${Number(item.differenceQuantity || 0) ? 'money-negative' : 'money-positive'}">${item.differenceQuantity === null ? '-' : item.differenceQuantity}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderLine(label, value, className = '') {
  return `
    <div class="quick-closing-line">
      <span>${label}</span>
      <strong class="${className}">${value}</strong>
    </div>
  `;
}
