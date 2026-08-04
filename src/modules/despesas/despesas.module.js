import { formatCurrency } from '../../utils/currency.js?v=20260804-04';
import {
  buildFinancialCrm,
  createFinancialTransaction,
  getFinancialCategories,
  getFinancialSummary,
  getFinancialTransactions,
  getPayables,
  markFinancialTransactionPaid,
  seedFinancialCategories,
  upsertFinancialTransaction
} from '../../services/financial.service.js?v=20260804-04';
import { showNotification } from '../../services/notification.service.js?v=20260804-04';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-04';
import { hasPermission } from '../../services/permission.service.js?v=20260804-04';
import { escapeHtml } from '../../utils/dom.js?v=20260804-04';

const DEFAULT_FILTERS = {
  period: 'today',
  customStart: '',
  customEnd: '',
  type: 'all',
  historyKind: 'all',
  categoryId: 'all',
  status: 'all'
};

let financeiroFilters = { ...DEFAULT_FILTERS };
const boundFinanceiroContainers = new WeakSet();

export function initDespesasModule(container) {
  seedFinancialCategories();
  renderFinanceiro(container);

  if (!boundFinanceiroContainers.has(container)) {
    bindFinanceiroEvents(container);
    boundFinanceiroContainers.add(container);
  }
}

export function renderFinanceiro(container) {
  container.innerHTML = renderFinanceiroMarkup(getFinanceiroState());
}

export function getFinanceiroState() {
  const periodFilters = {
    period: financeiroFilters.period,
    customStart: financeiroFilters.customStart,
    customEnd: financeiroFilters.customEnd
  };

  return {
    summary: getFinancialSummary(periodFilters),
    categories: getFinancialCategories(),
    transactions: getFinancialTransactions(periodFilters),
    payables: getPayables(),
    crm: buildFinancialCrm(periodFilters),
    filters: financeiroFilters,
    modal: null
  };
}

export function renderFinanceiroMarkup({ summary, categories, transactions, payables, crm, filters = DEFAULT_FILTERS, modal = null }) {
  const normalizedFilters = { ...DEFAULT_FILTERS, ...filters };
  const permissions = {
    canCreateIncome: canCurrentUser('financial.income.create'),
    canCreateExpense: canCurrentUser('financial.expense.create'),
    canPayBill: canCurrentUser('financial.bill.pay'),
    canEditEntries: canCurrentUser('financial.entries.edit')
  };
  const activeTransactions = applyTableFilters(
    transactions.filter((transaction) => transaction.status !== 'canceled'),
    normalizedFilters
  );

  return `
    <section class="module-screen finance-screen" data-financeiro-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Financeiro</h1>
          <p class="module-subtitle">Entradas, saidas, boletos, contas a pagar e mini CRM financeiro.</p>
        </div>
        <div class="header-actions">
          ${permissions.canCreateIncome ? '<button class="button button--success" type="button" data-finance-action="open-income">+ Entrada</button>' : ''}
          ${permissions.canCreateExpense ? '<button class="button button--danger" type="button" data-finance-action="open-expense">- Saida</button>' : ''}
          ${permissions.canCreateExpense ? '<button class="button" type="button" data-finance-action="open-bill">+ Boleto</button>' : ''}
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
        ${renderFinancialTable(activeTransactions, categories, normalizedFilters, permissions)}
        ${renderPayablesPanel(payables, permissions)}
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

    if (action === 'edit') {
      const transaction = getFinancialTransactions({ period: 'all' }).find((item) => item.id === event.target.closest('[data-finance-action]')?.dataset.transactionId);

      if (!transaction) {
        showNotification({ title: 'Nao foi possivel editar', message: 'Lancamento financeiro nao encontrado.', type: 'danger' });
        return;
      }

      renderFinanceiroWithModal(container, {
        type: getModalTypeFromTransaction(transaction),
        transaction
      });
      return;
    }

    const periodButton = event.target.closest('[data-finance-period]');

    if (periodButton) {
      financeiroFilters = {
        ...financeiroFilters,
        period: periodButton.dataset.financePeriod
      };
      renderFinanceiro(container);
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

  container.addEventListener('change', (event) => {
    if (event.target.matches('[data-finance-filter]')) {
      financeiroFilters = {
        ...financeiroFilters,
        [event.target.name]: event.target.value
      };
      renderFinanceiro(container);
      return;
    }

    if (event.target.matches('[data-finance-custom-date]')) {
      financeiroFilters = {
        ...financeiroFilters,
        period: 'custom',
        [event.target.name]: event.target.value
      };
      renderFinanceiro(container);
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-finance-form]')) {
      return;
    }

    event.preventDefault();
    const data = new FormData(event.target);
    const formType = data.get('formType');
    const transactionId = String(data.get('transactionId') || '').trim();
    const description = String(data.get('description') || '').trim();

    if (!description) {
      showNotification({ title: 'Descricao obrigatoria', message: 'Informe o motivo do lancamento.', type: 'danger' });
      return;
    }

    try {
      const payload = {
        type: formType === 'income' ? 'income' : 'expense',
        description,
        amount: Number(data.get('amount')) || 0,
        categoryId: data.get('categoryId'),
        paymentMethod: formType === 'bill' ? 'boleto' : 'dinheiro',
        status: formType === 'bill' ? data.get('status') : 'paid',
        transactionDate: data.get('transactionDate') || new Date().toISOString().slice(0, 10),
        dueDate: data.get('dueDate') || '',
        notes: data.get('notes') || '',
        origin: 'finance',
        movesCashSession: data.get('movesCashSession') === 'on'
      };

      if (transactionId) {
        const currentTransaction = getFinancialTransactions({ period: 'all' }).find((item) => item.id === transactionId);

        if (!currentTransaction) {
          throw new Error('Lancamento financeiro nao encontrado.');
        }

        upsertFinancialTransaction({
          ...currentTransaction,
          ...payload,
          id: transactionId,
          paymentMethod: data.get('paymentMethod') || payload.paymentMethod,
          updatedAt: new Date().toISOString()
        });
      } else {
        createFinancialTransaction(payload);
      }

      showNotification({ title: transactionId ? 'Lancamento atualizado' : 'Lancamento salvo', message: 'Financeiro atualizado.', type: 'success' });
      renderFinanceiro(container);
    } catch (error) {
      showNotification({ title: 'Nao foi possivel salvar', message: error.message, type: 'danger' });
    }
  });
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
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

function renderFinancialTable(transactions, categories, filters, permissions) {
  return `
    <section class="manager-section">
      <div class="manager-section__header">
        <strong>Movimentacoes financeiras</strong>
        <span>SUPABASE</span>
      </div>
      <div class="header-actions" style="padding: 12px;">
        ${renderPeriodFilterButton('today', 'Hoje', filters)}
        ${renderPeriodFilterButton('yesterday', 'Ontem', filters)}
        ${renderPeriodFilterButton('month', 'Mes', filters)}
        ${renderPeriodFilterButton('custom', 'Periodo', filters)}
        ${filters.period === 'custom' ? `
          <input class="field" style="max-width: 150px;" type="date" name="customStart" value="${filters.customStart || ''}" data-finance-custom-date>
          <input class="field" style="max-width: 150px;" type="date" name="customEnd" value="${filters.customEnd || ''}" data-finance-custom-date>
        ` : ''}
        ${renderTypeFilter(filters)}
        ${renderHistoryKindFilter(filters)}
        ${renderCategoryFilter(categories, filters)}
        ${renderStatusFilter(filters)}
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
            ${transactions.length ? transactions.map((transaction) => renderFinancialRow(transaction, categories, permissions)).join('') : `
              <tr><td colspan="7">Nenhuma movimentacao financeira encontrada.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPeriodFilterButton(period, label, filters) {
  const activeClass = filters.period === period ? ' button--active' : '';
  return `<button class="button button--ghost button--small${activeClass}" type="button" data-finance-period="${period}">${label}</button>`;
}

function renderTypeFilter(filters) {
  return `
    <select class="field" style="width: auto; min-width: 118px; min-height: 34px; padding: 0 12px; font-size: 13px; font-weight: 800;" name="type" data-finance-filter="type">
      <option value="all"${isSelected(filters.type, 'all')}>Todos os tipos</option>
      <option value="income"${isSelected(filters.type, 'income')}>Entrada</option>
      <option value="expense"${isSelected(filters.type, 'expense')}>Saida</option>
    </select>
  `;
}

function renderHistoryKindFilter(filters) {
  return `
    <select class="field" style="width: auto; min-width: 138px; min-height: 34px; padding: 0 12px; font-size: 13px; font-weight: 800;" name="historyKind" data-finance-filter="historyKind">
      <option value="all"${isSelected(filters.historyKind, 'all')}>Historico</option>
      <option value="cash"${isSelected(filters.historyKind, 'cash')}>Mov. caixa</option>
      <option value="bill"${isSelected(filters.historyKind, 'bill')}>Boletos</option>
    </select>
  `;
}

function renderCategoryFilter(categories, filters) {
  return `
    <select class="field" style="width: auto; min-width: 118px; min-height: 34px; padding: 0 12px; font-size: 13px; font-weight: 800;" name="categoryId" data-finance-filter="categoryId">
      <option value="all"${isSelected(filters.categoryId, 'all')}>Categoria</option>
      ${categories.map((category) => `<option value="${escapeHtml(category.id)}"${isSelected(filters.categoryId, category.id)}>${escapeHtml(category.name)}</option>`).join('')}
    </select>
  `;
}

function renderStatusFilter(filters) {
  return `
    <select class="field" style="width: auto; min-width: 118px; min-height: 34px; padding: 0 12px; font-size: 13px; font-weight: 800;" name="status" data-finance-filter="status">
      <option value="all"${isSelected(filters.status, 'all')}>Status</option>
      <option value="paid"${isSelected(filters.status, 'paid')}>Pago</option>
      <option value="pending"${isSelected(filters.status, 'pending')}>Pendente</option>
      <option value="overdue"${isSelected(filters.status, 'overdue')}>Vencida</option>
    </select>
  `;
}

function applyTableFilters(transactions, filters) {
  return transactions.filter((transaction) => {
    const typeMatches = filters.type === 'all' || transaction.type === filters.type;
    const historyKindMatches = filters.historyKind === 'all'
      || filters.historyKind === getFinancialHistoryKind(transaction);
    const categoryMatches = filters.categoryId === 'all' || transaction.categoryId === filters.categoryId;
    const statusMatches = filters.status === 'all' || transaction.status === filters.status;
    return typeMatches && historyKindMatches && categoryMatches && statusMatches;
  });
}

function isSelected(value, expected) {
  return value === expected ? ' selected' : '';
}

function renderFinancialRow(transaction, categories, permissions) {
  const category = categories.find((item) => item.id === transaction.categoryId);
  const isIncome = transaction.type === 'income';

  return `
    <tr data-finance-row="${transaction.id}">
      <td>${formatDate(transaction.transactionDate || transaction.createdAt)}</td>
      <td>
        <strong>${escapeHtml(getFinancialHistoryTitle(transaction))}</strong>
        <div class="finance-row-details">
          <small>Observacao: ${escapeHtml(getFinancialHistoryObservation(transaction))}</small><br>
          <small>Origem: ${transaction.origin === 'cashier' ? 'Frente de Caixa' : 'Financeiro'}</small><br>
          <small>Vencimento: ${formatDate(transaction.dueDate)}</small>
        </div>
      </td>
      <td><strong class="${isIncome ? 'money-positive' : 'money-negative'}">${isIncome ? 'Entrada' : 'Saida'}</strong></td>
      <td>${escapeHtml(category?.name || transaction.categoryId || 'Sem categoria')}</td>
      <td><strong class="${isIncome ? 'money-positive' : 'money-negative'}">${isIncome ? '+' : '-'} ${formatCurrency(transaction.amount)}</strong></td>
      <td>${formatStatus(transaction.status)}</td>
      <td>
        <div class="row-actions">
          <button class="button button--ghost button--small" type="button" data-finance-action="toggle-info">Mais info</button>
          ${transaction.status === 'pending' || transaction.status === 'overdue'
            ? (permissions.canPayBill ? `<button class="button button--small" type="button" data-payable-id="${transaction.id}">Pagar</button>` : '')
            : (permissions.canEditEntries ? `<button class="button button--ghost button--small" type="button" data-finance-action="edit" data-transaction-id="${transaction.id}">Editar</button>` : '')}
        </div>
      </td>
    </tr>
  `;
}

function getFinancialHistoryTitle(transaction) {
  return getFinancialHistoryKind(transaction) === 'bill' ? 'Boleto' : 'Movimentação de Caixa';
}

function getFinancialHistoryObservation(transaction) {
  return transaction.description || transaction.notes || 'Sem observacao';
}

function getFinancialHistoryKind(transaction) {
  return transaction.paymentMethod === 'boleto' || Boolean(transaction.dueDate) ? 'bill' : 'cash';
}

function renderPayablesPanel(payables, permissions) {
  const items = [...payables.overdue, ...payables.upcoming, ...payables.pending]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);

  return `
    <section class="manager-section">
      <div class="manager-section__header"><strong>Contas a pagar</strong></div>
      <div class="manager-list">
        ${items.length ? items.map((item) => renderPayableCard(item, permissions)).join('') : '<div class="empty-products">Nenhuma conta a pagar.</div>'}
      </div>
    </section>
  `;
}

function renderPayableCard(transaction, permissions) {
  const statusClass = transaction.status === 'overdue' ? 'is-canceled' : '';

  return `
    <article class="manager-row ${statusClass}">
      <div>
        <strong>${escapeHtml(transaction.description)}</strong>
        <span class="${transaction.status === 'overdue' ? 'money-negative' : 'money-primary'}">${formatStatus(transaction.status)}</span>
        <span>Data: ${formatDate(transaction.transactionDate || transaction.createdAt)}</span>
        <span>Vencimento: ${formatDate(transaction.dueDate)}</span>
        <span>Descricao: ${escapeHtml(transaction.notes || transaction.description)}</span>
      </div>
      <div class="money-row__right">
        <strong class="money-negative">${formatCurrency(transaction.amount)}</strong>
        ${permissions.canPayBill ? `<button class="button button--success button--small" type="button" data-payable-id="${transaction.id}">Marcar pago</button>` : ''}
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
          <strong>${escapeHtml(categories.find((category) => category.id === id)?.name || id)}</strong>
          <strong class="${stateClass}">${formatCurrency(value)}</strong>
        </div>
      `).join('') : '<small>Sem dados no periodo.</small>'}
    </article>
  `;
}

function renderFinancialModal(modal, categories) {
  const isBill = modal.type === 'bill';
  const isIncome = modal.type === 'income';
  const isEditing = Boolean(modal.transaction);
  const title = isEditing ? 'Editar lancamento' : (isBill ? 'Registrar boleto / conta' : `Registrar ${isIncome ? 'entrada' : 'saida'}`);
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
          ${modal.transaction ? `<input type="hidden" name="transactionId" value="${escapeHtml(modal.transaction.id)}">` : ''}
          ${isBill ? renderBillFields(filteredCategories, modal.transaction) : renderQuickFields(modal.type, filteredCategories, modal.transaction)}
        </form>
      </div>
    </div>
  `;
}

function renderQuickFields(type, categories, transaction = {}) {
  return `
    <label class="stacked-label">
      Valor
      <input class="field" name="amount" type="number" min="0.01" step="0.01" value="${transaction.amount || ''}" required>
    </label>
    <label class="stacked-label">
      Categoria
      <select class="field" name="categoryId" required>${renderCategoryOptions(categories, transaction.categoryId)}</select>
    </label>
    <label class="stacked-label">
      Descricao obrigatoria
      <input class="field" name="description" value="${escapeHtml(transaction.description || '')}" placeholder="${type === 'income' ? 'Ex: Reforco para troco do caixa' : 'Ex: Retirada para pagar fornecedor'}" required>
    </label>
    <input type="hidden" name="transactionDate" value="${transaction.transactionDate || ''}">
    <input type="hidden" name="paymentMethod" value="${transaction.paymentMethod || (type === 'income' ? 'dinheiro' : 'dinheiro')}">
    <input type="hidden" name="status" value="${transaction.status || 'paid'}">
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-finance-action="close-modal">Cancelar</button>
      <button class="button ${type === 'income' ? 'button--success' : 'button--danger'}" type="submit">Salvar ${type === 'income' ? 'entrada' : 'saida'} no caixa</button>
    </div>
  `;
}

function renderBillFields(categories, transaction = {}) {
  return `
    <label class="stacked-label">
      Descricao obrigatoria
      <input class="field" name="description" value="${escapeHtml(transaction.description || '')}" placeholder="Ex: Boleto fornecedor" required>
    </label>
    <div class="closing-form-grid closing-form-grid--compact">
      <label class="stacked-label">
        Valor
        <input class="field" name="amount" type="number" min="0.01" step="0.01" value="${transaction.amount || ''}" required>
      </label>
      <label class="stacked-label">
        Vencimento
        <input class="field" name="dueDate" type="date" value="${transaction.dueDate || ''}" required>
      </label>
      <label class="stacked-label">
        Categoria
        <select class="field" name="categoryId" required>${renderCategoryOptions(categories, transaction.categoryId)}</select>
      </label>
      <label class="stacked-label">
        Status
        <select class="field" name="status" required>
          <option value="pending" ${transaction.status === 'pending' ? 'selected' : ''}>Pendente</option>
          <option value="paid" ${transaction.status === 'paid' ? 'selected' : ''}>Pago</option>
        </select>
      </label>
    </div>
    <input type="hidden" name="transactionDate" value="${transaction.transactionDate || ''}">
    <input type="hidden" name="paymentMethod" value="${transaction.paymentMethod || 'boleto'}">
    <label class="permission-check">
      <input type="checkbox" name="movesCashSession" ${transaction.movesCashSession ? 'checked' : ''}>
      <span>Movimentar caixa aberto quando marcar como pago</span>
    </label>
    <label class="stacked-label">
      Observacao
      <textarea class="field" name="notes" rows="3">${escapeHtml(transaction.notes || '')}</textarea>
    </label>
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-finance-action="close-modal">Cancelar</button>
      <button class="button" type="submit">Salvar conta a pagar</button>
    </div>
  `;
}

function renderCategoryOptions(categories, selectedId = '') {
  return categories.map((category) => `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('');
}

function getModalTypeFromTransaction(transaction) {
  if (transaction.type === 'income') {
    return 'income';
  }

  return transaction.paymentMethod === 'boleto' || transaction.dueDate ? 'bill' : 'expense';
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
