import {
  buildClosingSummary,
  confirmClosing,
  getCashClosings,
  getSalesAfterClosing,
  saveClosingDraft
} from '../../services/cash-closing.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { showNotification } from '../../services/notification.service.js';

const caixaState = {
  tab: 'current',
  step: 'summary',
  countedCash: '',
  checkedPix: '',
  checkedDebit: '',
  checkedCredit: '',
  leftovers: {},
  differenceReasons: {}
};
const boundContainers = new WeakSet();

export function initCaixaModule(container) {
  renderCaixa(container);

  if (!boundContainers.has(container)) {
    bindCaixaEvents(container);
    boundContainers.add(container);
  }
}

function renderCaixa(container) {
  const summary = getSummary();

  container.innerHTML = `
    <section class="module-screen products-module" data-caixa-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Fechar Caixa</h1>
          <p class="module-subtitle">Confira pagamentos, vitrine, sobras e divergencias antes de salvar.</p>
        </div>
        <div class="header-actions">
          <button class="button ${caixaState.tab === 'current' ? '' : 'button--ghost'}" type="button" data-caixa-tab="current">Fechamento atual</button>
          <button class="button ${caixaState.tab === 'history' ? '' : 'button--ghost'}" type="button" data-caixa-tab="history">Historico</button>
        </div>
      </header>

      ${caixaState.tab === 'current' ? renderCurrentClosing(summary) : renderClosingHistory()}
    </section>
  `;
}

function bindCaixaEvents(container) {
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-caixa-screen]')) {
      return;
    }

    const tab = event.target.closest('[data-caixa-tab]');
    const step = event.target.closest('[data-caixa-step]');
    const action = event.target.closest('[data-action]');

    if (tab) {
      caixaState.tab = tab.dataset.caixaTab;
      renderCaixa(container);
      return;
    }

    if (step) {
      caixaState.step = step.dataset.caixaStep;
      renderCaixa(container);
      return;
    }

    if (action?.dataset.action === 'save-closing-draft') {
      const draft = saveClosingDraft(readClosingInput());
      showNotification({
        title: 'Rascunho salvo',
        message: `Fechamento atualizado as ${new Date(draft.updatedAt).toLocaleTimeString('pt-BR')}.`,
        type: 'success'
      });
      renderCaixa(container);
      return;
    }

    if (action?.dataset.action === 'confirm-closing') {
      try {
        const draft = saveClosingDraft(readClosingInput());
        confirmClosing(draft);
        showNotification({
          title: 'Caixa fechado',
          message: 'Fechamento salvo no historico.',
          type: 'success'
        });
        resetCurrentClosingState();
        caixaState.tab = 'history';
        renderCaixa(container);
      } catch (error) {
        showNotification({
          title: 'Nao foi possivel fechar',
          message: error.message || 'Confira os campos obrigatorios.',
          type: 'danger'
        });
      }
    }
  });

  container.addEventListener('input', (event) => {
    if (!event.target.closest('[data-caixa-screen]')) {
      return;
    }

    if (event.target.matches('[data-payment-input]')) {
      caixaState[event.target.dataset.paymentInput] = event.target.value;
      renderCaixa(container);
      return;
    }

    if (event.target.matches('[data-leftover-input]')) {
      caixaState.leftovers[event.target.dataset.productId] = event.target.value;
      renderCaixa(container);
      return;
    }

    if (event.target.matches('[data-difference-note]')) {
      const key = event.target.dataset.differenceKey;
      caixaState.differenceReasons[key] = {
        ...(caixaState.differenceReasons[key] || {}),
        note: event.target.value
      };
    }
  });

  container.addEventListener('change', (event) => {
    if (!event.target.closest('[data-caixa-screen]')) {
      return;
    }

    if (event.target.matches('[data-difference-reason]')) {
      const key = event.target.dataset.differenceKey;
      caixaState.differenceReasons[key] = {
        ...(caixaState.differenceReasons[key] || {}),
        reason: event.target.value
      };
      renderCaixa(container);
    }
  });
}

function renderCurrentClosing(summary) {
  return `
    <div class="closing-layout">
      <aside class="closing-steps">
        ${renderStepButton('summary', '1. Resumo do dia')}
        ${renderStepButton('payments', '2. Pagamentos')}
        ${renderStepButton('showcase', '3. Vitrine / salgados')}
        ${renderStepButton('differences', '4. Divergencias')}
        ${renderStepButton('confirm', '5. Confirmar')}
      </aside>
      <div class="closing-content">
        ${renderStepContent(summary)}
      </div>
    </div>
  `;
}

function renderStepButton(step, label) {
  return `<button class="closing-step ${caixaState.step === step ? 'is-active' : ''}" type="button" data-caixa-step="${step}">${label}</button>`;
}

function renderStepContent(summary) {
  if (caixaState.step === 'payments') return renderPayments(summary);
  if (caixaState.step === 'showcase') return renderShowcase(summary);
  if (caixaState.step === 'differences') return renderDifferences(summary);
  if (caixaState.step === 'confirm') return renderConfirm(summary);
  return renderSummary(summary);
}

function renderSummary(summary) {
  const showcaseTotals = getShowcaseTotals(summary);

  return `
    <div class="summary-grid">
      ${renderSummaryCard('Total vendido', summary.totals.sales)}
      ${renderSummaryCard('Dinheiro esperado', summary.payments.expectedCash)}
      ${renderSummaryCard('Entradas', summary.totals.entries)}
      ${renderSummaryCard('Saidas', summary.totals.outputs)}
      <article class="summary-card"><span>Comandas</span><strong>${summary.totals.closedComandas}</strong></article>
      <article class="summary-card"><span>Salgados produzidos</span><strong>${showcaseTotals.produced}</strong></article>
      <article class="summary-card"><span>Salgados vendidos</span><strong>${showcaseTotals.sold}</strong></article>
      <article class="summary-card"><span>Baixas justificadas</span><strong>${showcaseTotals.writeOffs}</strong></article>
    </div>
  `;
}

function renderPayments(summary) {
  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Conferencia de pagamentos</strong>
        <span>Total esperado: ${formatCurrency(summary.payments.expectedTotal)}</span>
      </header>
      <div class="closing-form-grid">
        ${renderPaymentField('countedCash', 'Dinheiro contado', summary.payments.expectedCash, true)}
        ${renderPaymentField('checkedPix', 'Pix conferido', summary.payments.expectedPix)}
        ${renderPaymentField('checkedDebit', 'Debito conferido', summary.payments.expectedDebit)}
        ${renderPaymentField('checkedCredit', 'Credito conferido', summary.payments.expectedCredit)}
      </div>
      <div class="manager-list">
        <article class="manager-row">
          <div>
            <strong>Diferenca geral</strong>
            <span>Pix, debito e credito nao preenchidos usam o valor esperado.</span>
          </div>
          <strong class="${summary.payments.generalDifference ? 'money-negative' : 'money-positive'}">${formatCurrency(summary.payments.generalDifference)}</strong>
        </article>
      </div>
    </section>
  `;
}

function renderPaymentField(name, label, expected, required = false) {
  return `
    <label class="stacked-label closing-field">
      ${label}
      <span>Esperado: ${formatCurrency(expected)}</span>
      <input class="field" data-payment-input="${name}" type="number" min="0" step="0.01" value="${caixaState[name]}" ${required ? 'required' : ''}>
    </label>
  `;
}

function renderShowcase(summary) {
  if (!summary.showcase.length) {
    return '<div class="empty-products product-empty-large">NENHUM PRODUTO LANCADO NA VITRINE HOJE</div>';
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Vitrine / salgados</strong>
        <span>Informe a sobra contada no fim do dia</span>
      </header>
      <div class="comparison-table">
        <table>
          <thead>
            <tr>
              <th>Produto</th>
              <th>Produzido</th>
              <th>Vendido</th>
              <th>Baixado</th>
              <th>Sobra esperada</th>
              <th>Sobra contada</th>
              <th>Diferenca</th>
            </tr>
          </thead>
          <tbody>
            ${summary.showcase.map((item) => `
              <tr>
                <td><strong>${item.productName}</strong></td>
                <td>${item.producedQuantity}</td>
                <td>${item.soldQuantity}</td>
                <td>${item.writeOffQuantity}</td>
                <td>${item.expectedLeftoverQuantity}</td>
                <td><input class="field closing-small-input" data-leftover-input data-product-id="${item.productId}" type="number" min="0" step="1" value="${caixaState.leftovers[item.productId] || ''}"></td>
                <td>${item.differenceQuantity === null ? '-' : item.differenceQuantity}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDifferences(summary) {
  const differences = buildDifferences(summary);

  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Divergencias</strong>
        <span>${differences.length ? `${differences.length} item(ns) para explicar` : 'Tudo certo'}</span>
      </header>
      <div class="manager-list">
        ${differences.length ? differences.map(renderDifferenceRow).join('') : '<div class="empty-products">Nenhuma divergencia encontrada.</div>'}
      </div>
    </section>
  `;
}

function renderDifferenceRow(difference) {
  const current = caixaState.differenceReasons[difference.key] || {};

  return `
    <article class="manager-row closing-difference-row">
      <div>
        <strong>${difference.label}</strong>
        <span>${difference.description}</span>
      </div>
      <div class="closing-difference-controls">
        <select class="field" data-difference-reason data-difference-key="${difference.key}" required>
          <option value="">Escolha o motivo</option>
          ${getDifferenceReasons().map((reason) => `
            <option value="${reason.value}" ${current.reason === reason.value ? 'selected' : ''}>${reason.label}</option>
          `).join('')}
        </select>
        <input class="field" data-difference-note data-difference-key="${difference.key}" placeholder="${current.reason === 'outro' ? 'Observacao obrigatoria' : 'Observacao'}" value="${current.note || ''}">
      </div>
    </article>
  `;
}

function renderConfirm(summary) {
  const differences = buildDifferences(summary);

  return `
    ${renderSummary(summary)}
    ${renderMoneyConference(summary)}
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Confirmar fechamento</strong>
        <span>${differences.length ? 'Divergencias precisam de motivo' : 'Sem divergencias'}</span>
      </header>
      <div class="manager-list">
        <article class="manager-row">
          <div>
            <strong>Diferenca geral do caixa</strong>
            <span>Comparacao entre esperado e contado/conferido.</span>
          </div>
          <strong class="${summary.payments.generalDifference ? 'money-negative' : 'money-positive'}">${formatCurrency(summary.payments.generalDifference)}</strong>
        </article>
        <article class="manager-row">
          <div>
            <strong>Divergencias de vitrine</strong>
            <span>${differences.filter((item) => item.scope === 'showcase').length} item(ns)</span>
          </div>
        </article>
      </div>
      <div class="form-actions closing-actions">
        <button class="button button--ghost" type="button" data-action="save-closing-draft">Salvar rascunho</button>
        <button class="button" type="button" data-action="confirm-closing">Confirmar fechamento</button>
      </div>
    </section>
  `;
}

function renderMoneyConference(summary) {
  const paymentRows = [
    {
      label: 'Pix',
      expected: summary.payments.expectedPix,
      checked: summary.payments.checkedPix,
      difference: summary.payments.pixDifference
    },
    {
      label: 'Debito',
      expected: summary.payments.expectedDebit,
      checked: summary.payments.checkedDebit,
      difference: summary.payments.debitDifference
    },
    {
      label: 'Credito',
      expected: summary.payments.expectedCredit,
      checked: summary.payments.checkedCredit,
      difference: summary.payments.creditDifference
    }
  ];

  return `
    <section class="manager-section money-conference">
      <header class="manager-section__header">
        <strong>Conferencia do dinheiro</strong>
        <span>Dinheiro esperado = vendas em dinheiro + entradas - saidas</span>
      </header>
      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Vendas em dinheiro', summary.payments.expectedCash - summary.totals.entries + summary.totals.outputs)}
        ${renderSummaryCard('Entradas', summary.totals.entries)}
        ${renderSummaryCard('Saidas', summary.totals.outputs)}
        ${renderSummaryCard('Dinheiro esperado', summary.payments.expectedCash)}
        ${renderSummaryCard('Dinheiro contado', summary.payments.countedCash)}
        ${renderSummaryCard('Diferenca', summary.payments.cashDifference)}
      </div>
      <div class="payment-conference-grid">
        ${paymentRows.map((row) => `
          <article class="payment-conference-card">
            <span>${row.label}</span>
            <strong>${formatCurrency(row.expected)}</strong>
            <small>${row.checked === null ? 'Nao conferido' : `Conferido: ${formatCurrency(row.checked)}`}</small>
            <small>Diferenca: ${row.difference === null ? '-' : formatCurrency(row.difference)}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderClosingHistory() {
  const closings = getCashClosings();

  if (!closings.length) {
    return '<div class="empty-products product-empty-large">NENHUM FECHAMENTO SALVO</div>';
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Historico de caixa</strong>
        <span>${closings.length} fechamento(s)</span>
      </header>
      <div class="manager-list">
        ${closings.map((closing) => {
          const afterClosing = getSalesAfterClosing(closing);
          return `
            <article class="manager-row closing-history-row">
              <div>
                <strong>${formatDate(closing.closedAt)}</strong>
                <span>
                  Vendas: ${formatCurrency(closing.totals.sales)}
                  - Diferenca: ${formatCurrency(closing.totals.generalDifference || 0)}
                  ${afterClosing.length ? `- ${afterClosing.length} venda(s) apos fechamento` : ''}
                </span>
              </div>
              <div class="row-actions">
                <strong>${closing.status}</strong>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderSummaryCard(label, value) {
  return `<article class="summary-card"><span>${label}</span><strong>${formatCurrency(value)}</strong></article>`;
}

function readClosingInput() {
  const summary = getSummary();

  return {
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit,
    leftovers: caixaState.leftovers,
    differences: buildDifferences(summary).map((difference) => ({
      scope: difference.scope,
      referenceId: difference.referenceId,
      reason: caixaState.differenceReasons[difference.key]?.reason || '',
      note: caixaState.differenceReasons[difference.key]?.note || '',
      quantity: difference.quantity,
      amount: difference.amount
    }))
  };
}

function buildDifferences(summary) {
  const differences = [];

  if (summary.payments.cashDifference) {
    differences.push({
      key: 'payment:dinheiro',
      scope: 'payment',
      referenceId: 'dinheiro',
      label: 'Dinheiro',
      description: `Diferenca de ${formatCurrency(summary.payments.cashDifference)} entre esperado e contado.`,
      quantity: null,
      amount: summary.payments.cashDifference
    });
  }

  summary.showcase.forEach((item) => {
    if (!item.differenceQuantity) {
      return;
    }

    differences.push({
      key: `showcase:${item.productId}`,
      scope: 'showcase',
      referenceId: item.productId,
      label: item.productName,
      description: `Diferenca de ${item.differenceQuantity} unidade(s), estimada em ${formatCurrency(item.estimatedDifferenceValue || 0)}.`,
      quantity: item.differenceQuantity,
      amount: item.estimatedDifferenceValue || 0
    });
  });

  return differences;
}

function getSummary() {
  return buildClosingSummary({
    countedCash: caixaState.countedCash,
    checkedPix: caixaState.checkedPix,
    checkedDebit: caixaState.checkedDebit,
    checkedCredit: caixaState.checkedCredit,
    leftovers: caixaState.leftovers
  });
}

function getShowcaseTotals(summary) {
  return summary.showcase.reduce((totals, item) => ({
    produced: totals.produced + item.producedQuantity,
    sold: totals.sold + item.soldQuantity,
    writeOffs: totals.writeOffs + item.writeOffQuantity
  }), {
    produced: 0,
    sold: 0,
    writeOffs: 0
  });
}

function getDifferenceReasons() {
  return [
    { value: 'perda-quebra', label: 'Perda/quebra' },
    { value: 'consumo-interno', label: 'Consumo interno' },
    { value: 'cortesia', label: 'Cortesia' },
    { value: 'vencido', label: 'Vencido' },
    { value: 'erro-lancamento', label: 'Erro de lancamento' },
    { value: 'erro-caixa', label: 'Erro de caixa' },
    { value: 'outro', label: 'Outro' }
  ];
}

function resetCurrentClosingState() {
  caixaState.step = 'summary';
  caixaState.countedCash = '';
  caixaState.checkedPix = '';
  caixaState.checkedDebit = '';
  caixaState.checkedCredit = '';
  caixaState.leftovers = {};
  caixaState.differenceReasons = {};
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
