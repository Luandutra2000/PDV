import {
  clearTransactionHistory,
  cancelClosedComanda,
  cancelTransaction,
  getClosedComandas,
  getDailyMoneySummary,
  getTransactions,
  registerCashMovement
} from '../../services/transaction.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { showNotification } from '../../services/notification.service.js';

const dashboardState = {
  modal: null,
  pendingCancelComandaId: null
};
const boundContainers = new WeakSet();

export function initDashboardModule(container) {
  dashboardState.modal = null;
  dashboardState.pendingCancelComandaId = null;
  renderDashboard(container);

  if (!boundContainers.has(container)) {
    bindDashboardEvents(container);
    boundContainers.add(container);
  }
}

function renderDashboard(container) {
  const moneySummary = getDailyMoneySummary();

  container.innerHTML = `
    <section class="module-screen products-module" data-dashboard-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Historico de Transacoes</h1>
          <p class="module-subtitle">Entradas, saidas, vendas e historico das comandas finalizadas.</p>
        </div>
        <div class="header-actions">
          <select class="field compact-select"><option>Hoje</option></select>
          <button class="button button--success" type="button" data-action="open-entry">+ Entrada</button>
          <button class="button button--danger" type="button" data-action="open-output">- Saida</button>
        </div>
      </header>

      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Total vendido', moneySummary.salesTotal)}
        ${renderSummaryCard('Dinheiro esperado', moneySummary.expectedCash)}
        ${renderSummaryCard('Pix', moneySummary.paymentTotals.pix)}
        ${renderSummaryCard('Debito', moneySummary.paymentTotals.debito)}
        ${renderSummaryCard('Credito', moneySummary.paymentTotals.credito)}
        ${renderSummaryCard('Entradas', moneySummary.entriesTotal)}
        ${renderSummaryCard('Saidas', moneySummary.outputsTotal)}
        ${renderSummaryCard('Saldo liquido', moneySummary.netTotal)}
        <article class="summary-card"><span>Comandas canceladas</span><strong>${moneySummary.canceledComandas}</strong></article>
      </div>

      <div class="history-grid">
        <section class="manager-section">
          <header class="manager-section__header">
            <strong>Historico de comandas</strong>
            <button class="button button--ghost" type="button" data-action="clear-history">Limpar historico</button>
          </header>
          <div class="manager-list history-list">
            ${renderClosedComandas()}
          </div>
        </section>

        <section class="manager-section">
          <header class="manager-section__header">
            <strong>Movimento do dinheiro</strong>
          </header>
          <div class="manager-list history-list">
            ${renderTransactions()}
          </div>
        </section>
      </div>

      ${dashboardState.modal === 'entrada' || dashboardState.modal === 'saida' ? renderCashMovementModal(dashboardState.modal) : ''}
      ${dashboardState.modal === 'cancel-comanda' ? renderCancelComandaModal() : ''}
    </section>
  `;
}

function bindDashboardEvents(container) {
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-dashboard-screen]')) {
      return;
    }

    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    if (button.dataset.action === 'open-entry') {
      dashboardState.modal = 'entrada';
      renderDashboard(container);
    }

    if (button.dataset.action === 'open-output') {
      dashboardState.modal = 'saida';
      renderDashboard(container);
    }

    if (button.dataset.action === 'close-modal') {
      dashboardState.modal = null;
      dashboardState.pendingCancelComandaId = null;
      renderDashboard(container);
    }

    if (button.dataset.action === 'clear-history') {
      clearTransactionHistory();
      showNotification({
        title: 'Historico limpo',
        message: 'Comandas e movimentos foram removidos.',
        type: 'danger'
      });
      renderDashboard(container);
    }

    if (button.dataset.action === 'cancel-comanda') {
      dashboardState.modal = 'cancel-comanda';
      dashboardState.pendingCancelComandaId = button.dataset.comandaId;
      renderDashboard(container);
    }

    if (button.dataset.action === 'confirm-cancel-comanda') {
      cancelClosedComanda(dashboardState.pendingCancelComandaId);
      showNotification({
        title: 'Comanda cancelada',
        message: 'A comanda ficou registrada como cancelada.',
        type: 'danger'
      });
      dashboardState.modal = null;
      dashboardState.pendingCancelComandaId = null;
      renderDashboard(container);
    }

    if (button.dataset.action === 'cancel-transaction') {
      cancelTransaction(button.dataset.transactionId);
      showNotification({
        title: 'Movimentacao cancelada',
        message: 'O lancamento foi mantido no historico em vermelho.',
        type: 'danger'
      });
      renderDashboard(container);
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest('[data-dashboard-screen]')) {
      return;
    }

    if (!event.target.matches('[data-cash-form]')) {
      return;
    }

    event.preventDefault();
    const data = new FormData(event.target);
    registerCashMovement({
      type: data.get('type'),
      amount: data.get('amount'),
      description: data.get('description')
    });
    showNotification({
      title: data.get('type') === 'entrada' ? 'Entrada registrada' : 'Saida registrada',
      message: `${formatCurrency(data.get('amount'))} lancado no historico.`,
      type: data.get('type') === 'entrada' ? 'success' : 'danger'
    });
    dashboardState.modal = null;
    renderDashboard(container);
  });
}

function renderSummaryCard(label, value) {
  return `<article class="summary-card"><span>${label}</span><strong>${formatCurrency(value)}</strong></article>`;
}

function renderClosedComandas() {
  const comandas = getClosedComandas();

  if (!comandas.length) {
    return '<div class="empty-products product-empty-large">NENHUMA COMANDA FINALIZADA</div>';
  }

  return comandas.map((comanda) => `
    <article class="history-comanda ${comanda.status === 'cancelada' ? 'is-canceled' : ''}">
      <header class="history-comanda__header">
        <div>
          <strong>Comanda ${formatComandaNumber(comanda.number)}</strong>
          <span>${formatDate(comanda.closedAt)}${comanda.status === 'cancelada' ? ' - Cancelada' : ''}</span>
        </div>
        <button class="button button--danger" type="button" data-action="cancel-comanda" data-comanda-id="${comanda.id}" ${comanda.status === 'cancelada' ? 'disabled' : ''}>
          Cancelar comanda
        </button>
      </header>
      <div class="history-comanda__items">
        ${comanda.items.map((item) => `
          <div>
            <span>${item.name}</span>
            <strong>${formatCurrency(item.total)}</strong>
          </div>
        `).join('')}
      </div>
      <footer class="history-comanda__footer">
        <span>${getPaymentLabel(comanda.paymentMethod)}</span>
        <strong>Total: ${formatCurrency(comanda.total)}</strong>
        <span>Troco: ${formatCurrency(comanda.change || 0)}</span>
      </footer>
    </article>
  `).join('');
}

function renderTransactions() {
  const transactions = getTransactions();

  if (!transactions.length) {
    return '<div class="empty-products product-empty-large">NENHUM MOVIMENTO REGISTRADO</div>';
  }

  return transactions.map((transaction) => `
    <article class="money-row ${transaction.status === 'cancelada' ? 'is-canceled' : ''}">
      <div>
        <strong>${getMoneyTitle(transaction)}</strong>
        <span>${transaction.status === 'cancelada' ? `Cancelada - ${getTransactionDetail(transaction)}` : getTransactionDetail(transaction)}</span>
      </div>
      <div class="money-row__right">
        <span>${formatDate(transaction.createdAt)}</span>
        <strong class="${transaction.status === 'cancelada' || transaction.type === 'saida' ? 'money-negative' : 'money-positive'}">
          ${transaction.type === 'saida' ? '-' : '+'} ${formatCurrency(transaction.total || transaction.amount)}
        </strong>
        <button class="button button--ghost" type="button" data-action="cancel-transaction" data-transaction-id="${transaction.id}" ${transaction.status === 'cancelada' ? 'disabled' : ''}>
          Cancelar
        </button>
      </div>
    </article>
  `).join('');
}

function renderCashMovementModal(type) {
  const title = type === 'entrada' ? 'Registrar entrada' : 'Registrar saida';

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>${title}</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <form class="product-form" data-cash-form>
          <input type="hidden" name="type" value="${type}">
          <label class="stacked-label">
            Valor
            <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
          </label>
          <label class="stacked-label">
            Descricao
            <input class="field" name="description" placeholder="Ex: Sangria, reforco de caixa">
          </label>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
            <button class="button" type="submit">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderCancelComandaModal() {
  const comanda = getClosedComandas().find((item) => item.id === dashboardState.pendingCancelComandaId);

  if (!comanda) {
    return '';
  }

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Cancelar comanda ${formatComandaNumber(comanda.number)}</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <div class="product-form">
          <p class="modal-text">
            Deseja cancelar esta comanda? Ela ficara registrada como cancelada e o valor sera removido dos totais.
          </p>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="close-modal">Voltar</button>
            <button class="button button--danger" type="button" data-action="confirm-cancel-comanda">Cancelar comanda</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getTransactionLabel(type) {
  const labels = {
    venda: 'Venda',
    entrada: 'Entrada de dinheiro',
    saida: 'Saida de dinheiro'
  };

  return labels[type] || type;
}

function getMoneyTitle(transaction) {
  if (transaction.type === 'venda') {
    return `Venda comanda ${formatComandaNumber(transaction.comandaNumber)} - ${getPaymentLabel(transaction.paymentMethod)}`;
  }

  return getTransactionLabel(transaction.type);
}

function getTransactionDetail(transaction) {
  if (transaction.type === 'venda') {
    if (transaction.description) {
      return transaction.description;
    }

    const itemCount = transaction.items?.reduce((total, item) => total + (Number(item.quantity) || 0), 0);
    if (itemCount) {
      return `${itemCount} item(ns)`;
    }

    return 'Venda registrada';
  }

  return transaction.description || 'Sem descricao';
}

function formatComandaNumber(number) {
  return String(number || 0).padStart(4, '0');
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

function getPaymentLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    debito: 'Debito',
    credito: 'Credito',
    pix: 'Pix'
  };

  return labels[method] || method;
}
