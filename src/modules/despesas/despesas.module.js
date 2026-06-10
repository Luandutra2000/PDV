import { formatCurrency } from '../../utils/currency.js';
import {
  buildFinancialCrm,
  createFinancialTransaction,
  getFinancialCategories,
  getFinancialSummary,
  getFinancialTransactions,
  getPayables,
  markFinancialTransactionPaid,
  seedFinancialCategories
} from '../../services/financial.service.js';
import { showNotification } from '../../services/notification.service.js';

export function initDespesasModule(container) {
  seedFinancialCategories();
  renderFinanceiro(container);
  bindFinanceiroEvents(container);
}

export function renderFinanceiro(container) {
  container.innerHTML = renderFinanceiroMarkup(getFinanceiroState());
}

export function getFinanceiroState() {
  return {
    summary: getFinancialSummary({ period: 'today' }),
    categories: getFinancialCategories(),
    transactions: getFinancialTransactions(),
    payables: getPayables(),
    crm: buildFinancialCrm(),
    modal: null
  };
}

export function renderFinanceiroMarkup({ summary, categories, transactions, payables, crm, modal = null }) {
  const activeTransactions = transactions.filter((transaction) => transaction.status !== 'canceled');

  return `
    <section class="module-screen finance-screen" data-financeiro-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Financeiro</h1>
          <p class="module-subtitle">Entradas, saidas, boletos, contas a pagar e mini CRM financeiro.</p>
        </div>
        <div class="header-actions">
          <button class="button button--success" type="button" data-finance-action="open-income">+ Entrada</button>
          <button class="button button--danger" type="button" data-finance-action="open-expense">- Saida</button>
          <button class="button" type="button" data-finance-action="open-bill">+ Boleto</button>
        </div>
      </header>

      <div class="summary-grid money-summary-grid">
        ${renderSummaryCard('Entradas', summary.entriesTotal, 'money-positive')}
        ${renderSummaryCard('Saidas', summary.outputsTotal, 'money-negative')}
        ${renderSummaryCard('Saldo', summary.balance, '')}
        ${renderCountCard('Contas a pagar', summary.payablesCount, 'money-primary')}
        ${renderCountCard('Contas pagas', summary.paidBillsCount, 'money-positive')}
        ${renderCountCard('Vencidas', summary.overdueCount, 'money-negative')}
      </div>

      <div class="history-grid finance-grid">
        ${renderFinancialTable(activeTransactions, categories)}
        ${renderPayablesPanel(payables)}
      </div>

      ${renderFinancialCrm(crm, categories)}
      ${modal ? renderFinancialModal(modal, categories) : ''}
    </section>
  `;
}

function bindFinanceiroEvents(container) {
  container.addEventListener('click', (event) => {
    const action = event.target.closest('[data-finance-action]')?.dataset.financeAction;

    if (action === 'open-income') {
      renderFinanceiroWithModal(container, { type: 'income' });
      return;
    }

    if (action === 'open-expense') {
      renderFinanceiroWithModal(container, { type: 'expense' });
      return;
    }

    if (action === 'open-bill') {
      renderFinanceiroWithModal(container, { type: 'bill' });
      return;
    }

    if (action === 'close-modal') {
      renderFinanceiro(container);
      return;
    }

    if (action === 'toggle-info') {
      const row = event.target.closest('[data-finance-row]');
      row?.classList.toggle('is-expanded');
      return;
    }

    const payableButton = event.target.closest('[data-payable-id]');

    if (payableButton) {
      try {
        markFinancialTransactionPaid(payableButton.dataset.payableId, {
          paymentMethod: 'boleto',
          paidAt: new Date().toISOString()
        });
        showNotification({ title: 'Conta paga', message: 'Conta marcada como paga.', type: 'success' });
        renderFinanceiro(container);
      } catch (error) {
        showNotification({ title: 'Nao foi possivel pagar', message: error.message, type: 'danger' });
      }
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-finance-form]')) {
      return;
    }

    event.preventDefault();
    const data = new FormData(event.target);
    const formType = data.get('formType');
    const description = String(data.get('description') || '').trim();

    if (!description) {
      showNotification({ title: 'Descricao obrigatoria', message: 'Informe o motivo do lancamento.', type: 'danger' });
      return;
    }

    try {
      createFinancialTransaction({
        type: formType === 'income' ? 'income' : 'expense',
        description,
        amount: data.get('amount'),
        categoryId: data.get('categoryId'),
        paymentMethod: formType === 'bill' ? 'boleto' : 'dinheiro',
        status: formType === 'bill' ? data.get('status') : 'paid',
        transactionDate: data.get('transactionDate') || new Date().toISOString().slice(0, 10),
        dueDate: data.get('dueDate') || '',
        notes: data.get('notes') || '',
        origin: 'finance',
        movesCashSession: data.get('movesCashSession') === 'on'
      });
      showNotification({ title: 'Lancamento salvo', message: 'Financeiro atualizado.', type: 'success' });
      renderFinanceiro(container);
    } catch (error) {
      showNotification({ title: 'Nao foi possivel salvar', message: error.message, type: 'danger' });
    }
  });
}

function renderFinanceiroWithModal(container, modal) {
  container.innerHTML = renderFinanceiroMarkup({ ...getFinanceiroState(), modal });
}

function renderSummaryCard(label, value, stateClass) {
  return `<article class="summary-card"><span>${label}</span><strong class="${stateClass}">${formatCurrency(value)}</strong></article>`;
}

function renderCountCard(label, value, stateClass) {
  return `<article class="summary-card"><span>${label}</span><strong class="${stateClass}">${value}</strong></article>`;
}

function renderFinancialTable(transactions, categories) {
  return `
    <section class="manager-section">
      <div class="manager-section__header">
        <strong>Movimentacoes financeiras</strong>
        <span>SUPABASE</span>
      </div>
      <div class="header-actions" style="padding: 12px;">
        <button class="button button--ghost button--small" type="button">Hoje</button>
        <button class="button button--ghost button--small" type="button">Todos os tipos</button>
        <button class="button button--ghost button--small" type="button">Categoria</button>
        <button class="button button--ghost button--small" type="button">Status</button>
      </div>
      <div class="product-table">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Descricao</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.length ? transactions.map((transaction) => renderFinancialRow(transaction, categories)).join('') : `
              <tr><td colspan="7">Nenhuma movimentacao financeira encontrada.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderFinancialRow(transaction, categories) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const isIncome = transaction.type === 'income';

  return `
    <tr data-finance-row="${transaction.id}">
      <td>${formatDate(transaction.transactionDate || transaction.createdAt)}</td>
      <td>
        <strong>${transaction.description}</strong>
        <div class="finance-row-details">
          <small>Observacao: ${transaction.notes || 'Sem observacao'}</small><br>
          <small>Origem: ${transaction.origin === 'cashier' ? 'Frente de Caixa' : 'Financeiro'}</small><br>
          <small>Vencimento: ${formatDate(transaction.dueDate)}</small>
        </div>
      </td>
      <td><strong class="${isIncome ? 'money-positive' : 'money-negative'}">${isIncome ? 'Entrada' : 'Saida'}</strong></td>
      <td>${category?.name || transaction.categoryId || 'Sem categoria'}</td>
      <td><strong class="${isIncome ? 'money-positive' : 'money-negative'}">${isIncome ? '+' : '-'} ${formatCurrency(transaction.amount)}</strong></td>
      <td>${formatStatus(transaction.status)}</td>
      <td>
        <div class="row-actions">
          <button class="button button--ghost button--small" type="button" data-finance-action="toggle-info">Mais info</button>
          ${transaction.status === 'pending' || transaction.status === 'overdue' ? `<button class="button button--small" type="button" data-payable-id="${transaction.id}">Pagar</button>` : '<button class="button button--ghost button--small" type="button">Editar</button>'}
        </div>
      </td>
    </tr>
  `;
}

function renderPayablesPanel(payables) {
  const items = [...payables.overdue, ...payables.upcoming, ...payables.pending]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);

  return `
    <section class="manager-section">
      <div class="manager-section__header"><strong>Contas a pagar</strong></div>
      <div class="manager-list">
        ${items.length ? items.map(renderPayableCard).join('') : '<div class="empty-products">Nenhuma conta a pagar.</div>'}
      </div>
    </section>
  `;
}

function renderPayableCard(transaction) {
  const statusClass = transaction.status === 'overdue' ? 'is-canceled' : '';

  return `
    <article class="manager-row ${statusClass}">
      <div>
        <strong>${transaction.description}</strong>
        <span class="${transaction.status === 'overdue' ? 'money-negative' : 'money-primary'}">${formatStatus(transaction.status)}</span>
        <span>Data: ${formatDate(transaction.transactionDate || transaction.createdAt)}</span>
        <span>Vencimento: ${formatDate(transaction.dueDate)}</span>
        <span>Descricao: ${transaction.notes || transaction.description}</span>
      </div>
      <div class="money-row__right">
        <strong class="money-negative">${formatCurrency(transaction.amount)}</strong>
        <button class="button button--success button--small" type="button" data-payable-id="${transaction.id}">Marcar pago</button>
      </div>
    </article>
  `;
}

function renderFinancialCrm(crm, categories) {
  return `
    <section class="manager-section money-conference">
      <div class="manager-section__header">
        <strong>Mini CRM financeiro</strong>
        <span>Categorias, pagamentos e evolucao</span>
      </div>
      <div class="summary-grid">
        ${renderCrmCard('Saidas por categoria', crm.outputsByCategory, categories, 'money-negative')}
        ${renderCrmCard('Entradas por categoria', crm.entriesByCategory, categories, 'money-positive')}
        ${renderCrmCard('Total pendente por categoria', crm.pendingByCategory, categories, 'money-primary')}
        ${renderCrmCard('Gastos por forma de pagamento', crm.spendingByPaymentMethod, [], 'money-negative')}
      </div>
    </section>
  `;
}

function renderCrmCard(title, totals, categories, stateClass) {
  const entries = Object.entries(totals || {}).sort((left, right) => right[1] - left[1]).slice(0, 5);

  return `
    <article class="summary-card">
      <span>${title}</span>
      ${entries.length ? entries.map(([id, value]) => `
        <div class="money-row">
          <strong>${categories.find((category) => category.id === id)?.name || id}</strong>
          <strong class="${stateClass}">${formatCurrency(value)}</strong>
        </div>
      `).join('') : '<small>Sem dados no periodo.</small>'}
    </article>
  `;
}

function renderFinancialModal(modal, categories) {
  const isBill = modal.type === 'bill';
  const isIncome = modal.type === 'income';
  const title = isBill ? 'Registrar boleto / conta' : `Registrar ${isIncome ? 'entrada' : 'saida'}`;
  const filteredCategories = categories.filter((category) => (
    isBill
      ? category.type === 'expense' || category.type === 'both'
      : category.type === (isIncome ? 'income' : 'expense') || category.type === 'both'
  ));

  return `
    <div class="modal-backdrop is-open">
      <div class="modal ${isBill ? '' : 'modal--small'}" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>${title}</h2>
          <button class="icon-button" type="button" data-finance-action="close-modal">X</button>
        </header>
        <form class="product-form" data-finance-form>
          <input type="hidden" name="formType" value="${modal.type}">
          ${isBill ? renderBillFields(filteredCategories) : renderQuickFields(modal.type, filteredCategories)}
        </form>
      </div>
    </div>
  `;
}

function renderQuickFields(type, categories) {
  return `
    <label class="stacked-label">
      Valor
      <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
    </label>
    <label class="stacked-label">
      Categoria
      <select class="field" name="categoryId" required>${renderCategoryOptions(categories)}</select>
    </label>
    <label class="stacked-label">
      Descricao obrigatoria
      <input class="field" name="description" placeholder="${type === 'income' ? 'Ex: Reforco para troco do caixa' : 'Ex: Retirada para pagar fornecedor'}" required>
    </label>
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-finance-action="close-modal">Cancelar</button>
      <button class="button ${type === 'income' ? 'button--success' : 'button--danger'}" type="submit">Salvar ${type === 'income' ? 'entrada' : 'saida'} no caixa</button>
    </div>
  `;
}

function renderBillFields(categories) {
  return `
    <label class="stacked-label">
      Descricao obrigatoria
      <input class="field" name="description" placeholder="Ex: Boleto fornecedor" required>
    </label>
    <div class="closing-form-grid closing-form-grid--compact">
      <label class="stacked-label">
        Valor
        <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
      </label>
      <label class="stacked-label">
        Vencimento
        <input class="field" name="dueDate" type="date" required>
      </label>
      <label class="stacked-label">
        Categoria
        <select class="field" name="categoryId" required>${renderCategoryOptions(categories)}</select>
      </label>
      <label class="stacked-label">
        Status
        <select class="field" name="status" required>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
        </select>
      </label>
    </div>
    <label class="permission-check">
      <input type="checkbox" name="movesCashSession">
      <span>Movimentar caixa aberto quando marcar como pago</span>
    </label>
    <label class="stacked-label">
      Observacao
      <textarea class="field" name="notes" rows="3"></textarea>
    </label>
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-finance-action="close-modal">Cancelar</button>
      <button class="button" type="submit">Salvar conta a pagar</button>
    </div>
  `;
}

function renderCategoryOptions(categories) {
  return categories.map((category) => `<option value="${category.id}">${category.name}</option>`).join('');
}

function formatStatus(status) {
  const labels = {
    paid: 'Pago',
    pending: 'Pendente',
    overdue: 'Vencida',
    canceled: 'Cancelada'
  };

  return labels[status] || status || 'Pendente';
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString('pt-BR');
}
