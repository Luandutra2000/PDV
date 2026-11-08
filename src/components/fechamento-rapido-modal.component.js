import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';

export function renderFechamentoRapidoModal({ summary, closingSummary, showcase, state }) {
  const cards = [
    ['Vendido hoje', formatCurrency(summary.salesTotal)],
    ['Entradas', formatCurrency(summary.entriesTotal)],
    ['Saídas', formatCurrency(summary.outputsTotal)],
    ['Caixa atual', formatCurrency(summary.estimatedProfit)]
  ];
  const cardTotals = summary.paymentTotals.debito + summary.paymentTotals.credito;

  return `
    <div class="modal-backdrop is-open">
      <div class="modal quick-closing-modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <div>
            <h2>Fechamento rápido</h2>
            <p class="modal-text">Resumo do dia, conferência de pagamentos e vitrine em uma tela.</p>
          </div>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <div class="quick-closing-body">
          <section class="ui-stats quick-closing-summary" style="--n: 4">
            ${cards.map(([label, value]) => `
              <article class="ui-stat quick-closing-card">
                <small>${label}</small>
                <b>${value}</b>
              </article>
            `).join('')}
          </section>

          <div class="ui-seg quick-closing-tabs" role="group" aria-label="Seções do fechamento">
            ${renderTab('resumo', 'Resumo', state.quickClosingTab)}
            ${renderTab('pagamentos', 'Pagamentos', state.quickClosingTab)}
            ${renderTab('vitrine', 'Vitrine', state.quickClosingTab)}
          </div>

          ${state.quickClosingTab === 'pagamentos' ? renderPayments(summary, closingSummary, state, cardTotals) : ''}
          ${state.quickClosingTab === 'vitrine' ? renderShowcase(showcase, state, closingSummary.outOfStockSales) : ''}
          ${state.quickClosingTab === 'resumo' ? renderSummary(summary, closingSummary, showcase, state, cardTotals) : ''}
        </div>
      </div>
    </div>
  `;
}

function renderTab(id, label, activeTab) {
  const active = activeTab === id;

  return `
    <button class="quick-closing-tab${active ? ' is-on' : ''}" type="button" data-quick-closing-tab="${id}" aria-pressed="${active ? 'true' : 'false'}">${label}</button>
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
        ${renderLine('Cartões esperados', formatCurrency(cardTotals))}
        ${renderLine('Diferença geral', formatCurrency(closingSummary.payments.generalDifference), closingSummary.payments.generalDifference ? 'money-negative' : 'money-positive')}
        ${renderLine('Divergências na vitrine', `${showcaseDifferences.length} produto(s)`)}
      </div>
      <label class="stacked-label">
        Observação do fechamento
        <input class="field" data-quick-note value="${escapeHtml(state.quickClosing.note)}" placeholder="Obrigatória se houver sobra, falta ou diferença">
      </label>
      ${renderOutOfStockSales(closingSummary.outOfStockSales)}
      <button class="button quick-closing-confirm" type="button" data-action="confirm-quick-closing">Fechar caixa agora</button>
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
        ${renderPaymentInput('checkedDebit', 'Débito conferido', summary.paymentTotals.debito, state.quickClosing.checkedDebit)}
        ${renderPaymentInput('checkedCredit', 'Crédito conferido', summary.paymentTotals.credito, state.quickClosing.checkedCredit)}
      </div>
      <div class="quick-closing-list">
        ${renderLine('Cartões esperados', formatCurrency(cardTotals))}
        ${renderLine('Diferença geral', formatCurrency(closingSummary.payments.generalDifference), closingSummary.payments.generalDifference ? 'money-negative' : 'money-positive')}
      </div>
    </section>
  `;
}

function renderPaymentInput(name, label, expected, value) {
  const minimum = name === 'countedCash' ? '' : ' min="0"';

  return `
    <label class="stacked-label">
      ${label}
      <span class="quick-closing-expected">Esperado: ${formatCurrency(expected)}</span>
      <input class="field" data-quick-payment="${name}" type="number"${minimum} step="0.01" value="${value}">
    </label>
  `;
}

function renderShowcase(showcase, state, outOfStockSales = []) {
  if (!showcase.length) {
    return `
      <section class="quick-closing-section">
        <div class="empty-products">Nenhum produto lançado na vitrine hoje.</div>
        ${renderOutOfStockSales(outOfStockSales)}
      </section>
    `;
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
      ${renderOutOfStockSales(outOfStockSales)}
    </section>
  `;
}

function renderOutOfStockSales(rows = []) {
  if (!rows.length) {
    return '';
  }

  return `
    <section class="quick-closing-out-of-stock">
      <h3 class="ui-head">Produtos vendidos sem estoque <span>${rows.length} registro(s)</span></h3>
      <div class="quick-closing-table">
        <table class="ui-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Qtd.</th>
              <th>Unitário</th>
              <th>Total</th>
              <th>Venda</th>
              <th>Usuário</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${escapeHtml(item.categoryName)}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unitPrice)}</td>
                <td>${formatCurrency(item.totalPrice)}</td>
                <td>${item.commandReference || item.commandId || item.saleId}</td>
                <td>${escapeHtml(item.userName || item.userId || 'Sistema')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
