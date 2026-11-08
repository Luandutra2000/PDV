import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
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
} from '../../services/financial.service.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { hasPermission } from '../../services/permission.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';

const DEFAULT_FILTERS = {
  period: 'today',
  customStart: '',
  customEnd: '',
  type: 'all',
  historyKind: 'all',
  categoryId: 'all',
  status: 'all'
};

// O seletor Todos / Entradas / Saidas / Boletos grava nos mesmos filtros de sempre
// (type e historyKind); os valores guardados nao mudam.
const KIND_FILTERS = {
  all: { type: 'all', historyKind: 'all' },
  income: { type: 'income', historyKind: 'all' },
  expense: { type: 'expense', historyKind: 'all' },
  bill: { type: 'all', historyKind: 'bill' }
};

const KIND_LABELS = [
  ['all', 'Todos'],
  ['income', 'Entradas'],
  ['expense', 'Saídas'],
  ['bill', 'Boletos']
];

const PERIOD_LABELS = [
  ['today', 'Hoje'],
  ['yesterday', 'Ontem'],
  ['month', 'Mês'],
  ['custom', 'Período']
];

const PERIOD_CAPTIONS = {
  today: 'hoje',
  yesterday: 'ontem',
  month: 'este mês',
  custom: 'período escolhido'
};

const PAYMENT_METHOD_LABELS = {
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  pix: 'Pix',
  credito: 'Crédito',
  debito: 'Débito',
  cartao: 'Cartão',
  transferencia: 'Transferência'
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
    <section class="ui-screen fn" data-financeiro-screen>
      <header class="ui-head fn-head">
        <div class="fn-head__title">
          <h1 class="fn-title">Financeiro</h1>
          <p class="fn-sub">Entradas, saídas, boletos e contas a pagar.</p>
        </div>
        <div class="ui-head__actions">
          ${permissions.canCreateIncome ? '<button class="ui-btn" type="button" data-finance-action="open-income">+ Entrada</button>' : ''}
          ${permissions.canCreateExpense ? '<button class="ui-btn ui-btn--loss" type="button" data-finance-action="open-expense">− Saída</button>' : ''}
          ${permissions.canCreateExpense ? '<button class="ui-btn ui-btn--primary" type="button" data-finance-action="open-bill">+ Boleto</button>' : ''}
        </div>
      </header>

      <div class="ui-stats fn-stats">
        ${renderStat('Entradas', formatCurrency(summary.entriesTotal), 'is-plus')}
        ${renderStat('Saídas', formatCurrency(summary.outputsTotal), 'is-minus')}
        ${renderStat('Saldo', formatCurrency(summary.balance), Number(summary.balance) < 0 ? 'is-minus' : '')}
        ${renderStat('Contas a pagar', summary.payablesCount, '')}
        ${renderStat('Vencidas', summary.overdueCount, Number(summary.overdueCount) > 0 ? 'is-minus' : '')}
        ${renderStat('Contas pagas', summary.paidBillsCount, '')}
      </div>

      <div class="ui-cols">
        ${renderFinancialTable(activeTransactions, categories, normalizedFilters, permissions)}
        <div class="fn-side">
          ${renderPayablesPanel(payables, permissions)}
          ${renderOutputsPanel(crm, categories)}
        </div>
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
      const button = event.target.closest('[data-finance-action]');
      button?.setAttribute?.('aria-expanded', String(Boolean(row?.classList.contains('is-expanded'))));
      return;
    }

    if (action === 'edit') {
      const transaction = getFinancialTransactions({ period: 'all' }).find((item) => item.id === event.target.closest('[data-finance-action]')?.dataset.transactionId);

      if (!transaction) {
        showNotification({ title: 'Não foi possível editar', message: 'Lançamento financeiro não encontrado.', type: 'danger' });
        return;
      }

      renderFinanceiroWithModal(container, {
        type: getModalTypeFromTransaction(transaction),
        transaction
      });
      return;
    }

    const kindButton = event.target.closest('[data-finance-kind]');

    if (kindButton) {
      const kindFilters = KIND_FILTERS[kindButton.dataset.financeKind];

      if (kindFilters) {
        financeiroFilters = { ...financeiroFilters, ...kindFilters };
        renderFinanceiro(container);
      }
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
        showNotification({ title: 'Não foi possível pagar', message: error.message, type: 'danger' });
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
      showNotification({ title: 'Descrição obrigatória', message: 'Informe o motivo do lançamento.', type: 'danger' });
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
          throw new Error('Lançamento financeiro não encontrado.');
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

      showNotification({ title: transactionId ? 'Lançamento atualizado' : 'Lançamento salvo', message: 'Financeiro atualizado.', type: 'success' });
      renderFinanceiro(container);
    } catch (error) {
      showNotification({ title: 'Não foi possível salvar', message: error.message, type: 'danger' });
    }
  });
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
}

function renderFinanceiroWithModal(container, modal) {
  container.innerHTML = renderFinanceiroMarkup({ ...getFinanceiroState(), modal });
}

function renderStat(label, value, stateClass) {
  return `<article class="ui-stat${stateClass ? ` ${stateClass}` : ''}"><small>${label}</small><b>${value}</b></article>`;
}

function getActiveKind(filters) {
  return KIND_LABELS.map(([kind]) => kind).find((kind) => (
    filters.type === KIND_FILTERS[kind].type && filters.historyKind === KIND_FILTERS[kind].historyKind
  )) || '';
}

function renderFinancialTable(transactions, categories, filters, permissions) {
  const activeKind = getActiveKind(filters);

  return `
    <section class="ui-panel fn-main" data-finance-movements>
      <div class="fn-panel-head">
        <h2 class="ui-head">Movimentações <span>${PERIOD_CAPTIONS[filters.period] || ''}</span></h2>
        <div class="ui-seg" data-finance-kinds role="group" aria-label="Tipo de movimentação">
          ${KIND_LABELS.map(([kind, label]) => `<button type="button" class="${activeKind === kind ? 'is-on' : ''}" data-finance-kind="${kind}" aria-pressed="${activeKind === kind}">${label}</button>`).join('')}
        </div>
      </div>
      <div class="fn-filters">
        <div class="ui-seg" role="group" aria-label="Período">
          ${PERIOD_LABELS.map(([period, label]) => renderPeriodFilterButton(period, label, filters)).join('')}
        </div>
        ${filters.period === 'custom' ? `
          <input class="ui-input" type="date" name="customStart" value="${escapeHtml(filters.customStart || '')}" aria-label="Data inicial" data-finance-custom-date>
          <input class="ui-input" type="date" name="customEnd" value="${escapeHtml(filters.customEnd || '')}" aria-label="Data final" data-finance-custom-date>
        ` : ''}
        ${renderHistoryKindFilter(filters)}
        ${renderCategoryFilter(categories, filters)}
        ${renderStatusFilter(filters)}
      </div>
      <div class="fn-scroll">
        <table class="ui-table fn-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th class="r">Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.length ? transactions.map((transaction) => renderFinancialRow(transaction, categories, permissions)).join('') : `
              <tr><td class="fn-empty" colspan="7">Nenhuma movimentação financeira encontrada.</td></tr>
            `}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPeriodFilterButton(period, label, filters) {
  const isActive = filters.period === period;
  return `<button type="button" class="${isActive ? 'is-on' : ''}" data-finance-period="${period}" aria-pressed="${isActive}">${label}</button>`;
}

function renderHistoryKindFilter(filters) {
  return `
    <select class="ui-input" name="historyKind" aria-label="Origem" data-finance-filter="historyKind">
      <option value="all"${isSelected(filters.historyKind, 'all')}>Todas as origens</option>
      <option value="cash"${isSelected(filters.historyKind, 'cash')}>Mov. de caixa</option>
      <option value="bill"${isSelected(filters.historyKind, 'bill')}>Boletos</option>
    </select>
  `;
}

function renderCategoryFilter(categories, filters) {
  return `
    <select class="ui-input" name="categoryId" aria-label="Categoria" data-finance-filter="categoryId">
      <option value="all"${isSelected(filters.categoryId, 'all')}>Todas as categorias</option>
      ${categories.map((category) => `<option value="${escapeHtml(category.id)}"${isSelected(filters.categoryId, category.id)}>${escapeHtml(category.name)}</option>`).join('')}
    </select>
  `;
}

function renderStatusFilter(filters) {
  return `
    <select class="ui-input" name="status" aria-label="Status" data-finance-filter="status">
      <option value="all"${isSelected(filters.status, 'all')}>Todos os status</option>
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
    <tr data-finance-row="${escapeHtml(transaction.id)}">
      <td class="fn-muted">${formatDate(transaction.transactionDate || transaction.createdAt)}</td>
      <td class="fn-desc">
        <b>${escapeHtml(transaction.description || 'Sem descrição')}</b>
        <div class="finance-row-details fn-details">
          <small>Observação: ${escapeHtml(transaction.notes || 'Sem observação')}</small>
          <small>Origem: ${transaction.origin === 'cashier' ? 'Frente de caixa' : 'Financeiro'}</small>
          <small>Vencimento: ${formatDate(transaction.dueDate)}</small>
        </div>
      </td>
      <td>${getFinancialTypeLabel(transaction)}</td>
      <td class="fn-muted">${escapeHtml(category?.name || prettifyId(transaction.categoryId) || 'Sem categoria')}</td>
      <td class="r"><b class="fn-amount ${isIncome ? 'is-plus' : 'is-minus'}">${isIncome ? '+' : '−'} ${formatCurrency(transaction.amount)}</b></td>
      <td>${renderStatusPill(transaction.status)}</td>
      <td>
        <div class="fn-actions">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-finance-action="toggle-info" aria-expanded="false">Mais info</button>
          ${transaction.status === 'pending' || transaction.status === 'overdue'
            ? (permissions.canPayBill ? `<button class="ui-btn ui-btn--sm" type="button" data-payable-id="${escapeHtml(transaction.id)}">Pagar</button>` : '')
            : (permissions.canEditEntries ? `<button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-finance-action="edit" data-transaction-id="${escapeHtml(transaction.id)}">Editar</button>` : '')}
        </div>
      </td>
    </tr>
  `;
}

function getFinancialTypeLabel(transaction) {
  if (transaction.type === 'income') {
    return 'Entrada';
  }

  return getFinancialHistoryKind(transaction) === 'bill' ? 'Boleto' : 'Saída';
}

function getFinancialHistoryKind(transaction) {
  return transaction.paymentMethod === 'boleto' || Boolean(transaction.dueDate) ? 'bill' : 'cash';
}

function renderStatusPill(status) {
  const pillClass = {
    paid: ' ui-pill--ok',
    pending: ' ui-pill--warn',
    overdue: ' ui-pill--danger'
  }[status] || '';

  return `<span class="ui-pill${pillClass}">${formatStatus(status)}</span>`;
}

function getPayableItems(payables) {
  const unique = [...(payables.overdue || []), ...(payables.upcoming || []), ...(payables.pending || [])]
    .filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id) === index);
  const byDueDate = (left, right) => String(left.dueDate || '9999-12-31').localeCompare(String(right.dueDate || '9999-12-31'));

  // Vencidas primeiro, depois as pendentes por data de vencimento.
  return [
    ...unique.filter((item) => item.status === 'overdue').sort(byDueDate),
    ...unique.filter((item) => item.status !== 'overdue').sort(byDueDate)
  ];
}

function renderPayablesPanel(payables, permissions) {
  const items = getPayableItems(payables);
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  return `
    <section class="ui-panel fn-payables" data-finance-payables>
      <h2 class="ui-head">Contas a pagar ${items.length ? `<span>${items.length} ${items.length === 1 ? 'conta' : 'contas'} · ${formatCurrency(total)}</span>` : ''}</h2>
      <div class="fn-bills">
        ${items.length ? items.map((item) => renderPayableCard(item, permissions)).join('') : '<p class="fn-empty">Nenhuma conta a pagar.</p>'}
      </div>
    </section>
  `;
}

function renderPayableCard(transaction, permissions) {
  const isOverdue = transaction.status === 'overdue';
  const dueText = transaction.dueDate
    ? `${isOverdue ? 'Venceu' : 'Vence'} em ${formatDate(transaction.dueDate)}`
    : 'Sem vencimento';
  const note = transaction.notes && transaction.notes !== transaction.description ? transaction.notes : '';

  return `
    <article class="fn-bill${isOverdue ? ' is-overdue' : ''}" data-finance-bill="${escapeHtml(transaction.id)}">
      <span class="fn-dot ${isOverdue ? 'is-overdue' : 'is-pending'}" aria-hidden="true"></span>
      <div class="fn-bill__main">
        <b>${escapeHtml(transaction.description)}</b>
        <small>${dueText}</small>
        ${note ? `<small>${escapeHtml(note)}</small>` : ''}
      </div>
      <div class="fn-bill__right">
        <b class="fn-amount${isOverdue ? ' is-minus' : ''}">${formatCurrency(transaction.amount)}</b>
        ${permissions.canPayBill ? `<button class="ui-btn ui-btn--ok ui-btn--sm" type="button" data-payable-id="${escapeHtml(transaction.id)}">Marcar pago</button>` : ''}
      </div>
    </article>
  `;
}

function renderOutputsPanel(crm, categories) {
  return `
    <section class="ui-panel fn-outputs" data-finance-outputs>
      <h2 class="ui-head">Saídas por categoria</h2>
      ${renderBars(crm.outputsByCategory, (id) => getCategoryName(categories, id), 'var(--red)')}
    </section>
  `;
}

function renderFinancialCrm(crm, categories) {
  return `
    <section class="fn-crm" data-finance-crm>
      <h2 class="ui-head fn-crm__title">Mini CRM financeiro <span>Categorias e formas de pagamento</span></h2>
      <div class="fn-crm__grid">
        ${renderCrmCard('Entradas por categoria', crm.entriesByCategory, (id) => getCategoryName(categories, id), 'var(--green)')}
        ${renderCrmCard('Total pendente por categoria', crm.pendingByCategory, (id) => getCategoryName(categories, id), 'var(--accent)')}
        ${renderCrmCard('Gastos por forma de pagamento', crm.spendingByPaymentMethod, getPaymentMethodName, 'var(--red)')}
      </div>
    </section>
  `;
}

function renderCrmCard(title, totals, getLabel, color) {
  return `
    <section class="ui-panel">
      <h3 class="ui-head">${title}</h3>
      ${renderBars(totals, getLabel, color)}
    </section>
  `;
}

function renderBars(totals, getLabel, color) {
  const entries = Object.entries(totals || {}).sort((left, right) => right[1] - left[1]).slice(0, 5);

  if (!entries.length) {
    return '<p class="fn-empty">Sem dados no período.</p>';
  }

  const largest = Math.max(...entries.map(([, value]) => Number(value) || 0), 0);

  return `
    <div class="ui-bars">
      ${entries.map(([id, value]) => `
        <div class="ui-bar-row">
          <span>${escapeHtml(getLabel(id))}</span>
          <div class="track"><i style="width:${largest > 0 ? Math.round(((Number(value) || 0) / largest) * 100) : 0}%;--c:${color}"></i></div>
          <b>${formatCurrency(value)}</b>
        </div>
      `).join('')}
    </div>
  `;
}

function getCategoryName(categories, id) {
  return categories.find((category) => category.id === id)?.name || prettifyId(id);
}

function getPaymentMethodName(id) {
  return PAYMENT_METHOD_LABELS[id] || prettifyId(id);
}

// Categoria ou forma de pagamento sem cadastro: mostra o codigo legivel, sem alterar o valor guardado.
function prettifyId(id) {
  const text = String(id || '').replace(/[-_]+/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function renderFinancialModal(modal, categories) {
  const isBill = modal.type === 'bill';
  const isIncome = modal.type === 'income';
  const isEditing = Boolean(modal.transaction);
  const title = isEditing ? 'Editar lançamento' : (isBill ? 'Registrar boleto / conta' : `Registrar ${isIncome ? 'entrada' : 'saída'}`);
  const filteredCategories = categories.filter((category) => (
    isBill
      ? category.type === 'expense' || category.type === 'both'
      : category.type === (isIncome ? 'income' : 'expense') || category.type === 'both'
  ));

  return `
    <div class="modal-backdrop is-open">
      <div class="modal ${isBill ? '' : 'modal--small'}" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="modal__header">
          <h2>${title}</h2>
          <button class="icon-button" type="button" data-finance-action="close-modal" title="Fechar" aria-label="Fechar">X</button>
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
      Descrição obrigatória
      <input class="field" name="description" value="${escapeHtml(transaction.description || '')}" placeholder="${type === 'income' ? 'Ex: Reforço para troco do caixa' : 'Ex: Retirada para pagar fornecedor'}" required>
    </label>
    <input type="hidden" name="transactionDate" value="${transaction.transactionDate || ''}">
    <input type="hidden" name="paymentMethod" value="${transaction.paymentMethod || (type === 'income' ? 'dinheiro' : 'dinheiro')}">
    <input type="hidden" name="status" value="${transaction.status || 'paid'}">
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-finance-action="close-modal">Cancelar</button>
      <button class="button ${type === 'income' ? 'button--success' : 'button--danger'}" type="submit">Salvar ${type === 'income' ? 'entrada' : 'saída'} no caixa</button>
    </div>
  `;
}

function renderBillFields(categories, transaction = {}) {
  return `
    <label class="stacked-label">
      Descrição obrigatória
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
      Observação
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
