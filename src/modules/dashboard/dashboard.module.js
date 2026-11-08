import {
  clearTransactionHistory,
  cancelClosedComanda,
  cancelTransaction,
  getClosedComandas,
  getMoneySummary,
  getTransactions
} from '../../services/transaction.service.js?v=20260804-06';
import { renderCashActionButtons, renderCashMovementModal, submitCashMovementForm } from '../../components/cash-actions.component.js?v=20260807-08';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { hydrateOnlineOperationalData } from '../../services/online-data.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';

const dashboardState = {
  modal: null,
  pendingCancelComandaId: null,
  period: 'today'
};
const boundContainers = new WeakSet();

export function initDashboardModule(container) {
  dashboardState.modal = null;
  dashboardState.pendingCancelComandaId = null;
  renderDashboard(container);
  hydrateOnlineOperationalData({ financial: true, showcase: false }).then(() => renderDashboard(container));

  if (!boundContainers.has(container)) {
    bindDashboardEvents(container);
    boundContainers.add(container);
  }
}

function renderDashboard(container) {
  const moneySummary = getMoneySummary({ period: dashboardState.period });
  const comandas = getFilteredClosedComandas();
  const movements = getFilteredTransactions();

  container.innerHTML = `
    <section class="ui-screen hs" data-dashboard-screen>
      <header class="ui-head hs-head">
        <div class="hs-head__title">
          <h1 class="hs-title">Histórico de transações</h1>
          <p class="hs-sub">Comandas finalizadas, entradas, saídas e o movimento do dinheiro.</p>
        </div>
        ${renderPeriodFilters()}
      </header>

      ${renderStats(moneySummary)}

      <div class="ui-cols hs-cols">
        <section class="ui-panel hs-main">
          <h2 class="ui-head">
            Comandas
            <span>${comandas.length} ${comandas.length === 1 ? 'comanda' : 'comandas'} no período</span>
            <button class="ui-btn ui-btn--ghost ui-btn--sm hs-clear" type="button" data-action="clear-history">Limpar histórico</button>
          </h2>
          ${renderClosedComandas(comandas)}
        </section>

        <section class="ui-panel hs-side">
          <h2 class="ui-head">Movimento do dinheiro</h2>
          ${renderTransactions(movements)}
          <div class="hs-side__foot">
            ${renderCashActionButtons(getCurrentUser(), { includeWriteOff: false })}
          </div>
        </section>
      </div>

      <div class="hs-modal" data-dashboard-modal>${renderDashboardModal()}</div>
    </section>
  `;
}

function renderDashboardModal() {
  if (dashboardState.modal === 'entrada' || dashboardState.modal === 'saida') {
    return renderCashMovementModal(dashboardState.modal);
  }

  if (dashboardState.modal === 'cancel-comanda') {
    return renderCancelComandaModal();
  }

  return '';
}

function bindDashboardEvents(container) {
  container.addEventListener('click', async (event) => {
    if (!event.target.closest('[data-dashboard-screen]')) {
      return;
    }

    const periodButton = event.target.closest('[data-dashboard-period]');

    if (periodButton) {
      dashboardState.period = periodButton.dataset.dashboardPeriod;
      renderDashboard(container);
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
      const periodLabel = getPeriodLabel(dashboardState.period);
      const confirmed = window.confirm(`Limpar histórico de ${periodLabel}? Isso também apaga esse período no Supabase.`);

      if (!confirmed) {
        return;
      }

      try {
        await clearTransactionHistory({ period: dashboardState.period });
        showNotification({
          title: 'Histórico limpo',
          message: `Comandas e movimentos de ${periodLabel} foram removidos.`,
          type: 'danger'
        });
        renderDashboard(container);
      } catch (error) {
        showNotification({
          title: 'Não foi possível limpar',
          message: error.message || 'Tente novamente em instantes.',
          type: 'danger'
        });
      }
    }

    if (button.dataset.action === 'cancel-comanda') {
      dashboardState.modal = 'cancel-comanda';
      dashboardState.pendingCancelComandaId = button.dataset.comandaId;
      renderDashboard(container);
    }

    if (button.dataset.action === 'confirm-cancel-comanda') {
      const reason = container.querySelector('[data-cancel-comanda-reason]')?.value || '';

      try {
        cancelClosedComanda(dashboardState.pendingCancelComandaId, { reason });
        showNotification({
          title: 'Comanda cancelada',
          message: 'A comanda ficou registrada como cancelada.',
          type: 'danger'
        });
        dashboardState.modal = null;
        dashboardState.pendingCancelComandaId = null;
        renderDashboard(container);
      } catch (error) {
        showNotification({
          title: 'Não foi possível cancelar',
          message: error.message || 'Informe o motivo do cancelamento.',
          type: 'danger'
        });
      }
    }

    if (button.dataset.action === 'cancel-transaction') {
      const reason = window.prompt('Informe o motivo do cancelamento:') || '';

      if (!reason.trim()) {
        showNotification({
          title: 'Motivo obrigatório',
          message: 'Informe o motivo para cancelar a movimentação.',
          type: 'danger'
        });
        return;
      }

      try {
        cancelTransaction(button.dataset.transactionId, { reason });
        showNotification({
          title: 'Movimentação cancelada',
          message: 'O lançamento foi mantido no histórico em vermelho.',
          type: 'danger'
        });
        renderDashboard(container);
      } catch (error) {
        showNotification({
          title: 'Não foi possível cancelar',
          message: error.message || 'Confira sua permissão e tente novamente.',
          type: 'danger'
        });
      }
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest?.('[data-dashboard-screen]')) {
      return;
    }

    if (!event.target.matches('[data-cash-form]')) {
      return;
    }

    event.preventDefault();
    submitCashMovementForm(new FormData(event.target)).then((saved) => {
      if (saved) {
        dashboardState.modal = null;
        renderDashboard(container);
      }
    });
  });
}

function renderPeriodFilters() {
  return `
    <div class="ui-seg hs-period" role="group" aria-label="Período">
      ${getPeriodOptions().map(([value, label]) => `
        <button${dashboardState.period === value ? ' class="is-on" aria-pressed="true"' : ' aria-pressed="false"'} type="button" data-dashboard-period="${value}">${label}</button>
      `).join('')}
    </div>
  `;
}

function renderStats(moneySummary) {
  const canceled = getFilteredClosedComandas().filter((comanda) => comanda.status === 'cancelada');
  const canceledTotal = canceled.reduce((total, comanda) => total + (Number(comanda.total) || 0), 0);
  let canceledDetail = '';

  if (canceled.length === 1) {
    canceledDetail = `Comanda ${formatComandaNumber(canceled[0].number)}, ${formatCurrency(canceledTotal)}`;
  } else if (canceled.length > 1) {
    canceledDetail = `${formatCurrency(canceledTotal)} no total`;
  }

  const cards = [
    ['Dinheiro', formatCurrency(moneySummary.paymentTotals.dinheiro), ''],
    ['Pix', formatCurrency(moneySummary.paymentTotals.pix), ''],
    ['Débito', formatCurrency(moneySummary.paymentTotals.debito), ''],
    ['Crédito', formatCurrency(moneySummary.paymentTotals.credito), ''],
    ['Comandas canceladas', String(moneySummary.canceledComandas), canceledDetail]
  ];

  return `
    <section class="ui-stats hs-stats" style="--n:${cards.length}" aria-label="Resumo do período">
      ${cards.map(([label, value, detail]) => `
        <div class="ui-stat">
          <small>${label}</small>
          <b>${value}</b>
          ${detail ? `<em>${escapeHtml(detail)}</em>` : ''}
        </div>
      `).join('')}
    </section>
  `;
}

export function formatHistoryItemQuantity(item) {
  const quantity = Number(item?.quantity);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return '1x';
  }

  return `${quantity}x`;
}

function renderClosedComandas(comandas) {
  if (!comandas.length) {
    return '<p class="hs-empty">Nenhuma comanda finalizada neste período.</p>';
  }

  return `
    <div class="hs-scroll">
      <table class="ui-table hs-table">
        <thead>
          <tr>
            <th>Hora</th>
            <th>Comanda</th>
            <th>Itens</th>
            <th>Pagamento</th>
            <th class="r">Valor</th>
            <th>Status</th>
            <th><span class="hs-sr">Ações</span></th>
          </tr>
        </thead>
        <tbody>
          ${comandas.map(renderComandaRow).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderComandaRow(comanda) {
  const canceled = comanda.status === 'cancelada';
  const itemsLabel = (comanda.items || [])
    .map((item) => `${formatHistoryItemQuantity(item)} ${escapeHtml(item.name)}`)
    .join(', ');
  const change = Number(comanda.change) || 0;

  return `
    <tr class="${canceled ? 'is-canceled' : ''}">
      <td class="hs-muted">${formatWhen(comanda.closedAt)}</td>
      <td><b>${formatComandaNumber(comanda.number)}</b></td>
      <td class="hs-items" title="${itemsLabel}">${itemsLabel}</td>
      <td>${escapeHtml(getPaymentLabel(comanda.paymentMethod))}${change > 0 ? `<small class="hs-muted"> troco ${formatCurrency(change)}</small>` : ''}</td>
      <td class="r"><b class="hs-value">${formatCurrency(comanda.total)}</b></td>
      <td><span class="ui-pill ${canceled ? 'ui-pill--danger' : 'ui-pill--ok'}">${canceled ? 'Cancelada' : 'Finalizada'}</span></td>
      <td class="r">
        <button class="ui-btn ui-btn--loss ui-btn--sm" type="button" data-action="cancel-comanda" data-comanda-id="${escapeHtml(comanda.id)}" ${canceled ? 'disabled' : ''}>Cancelar</button>
      </td>
    </tr>
  `;
}

function renderTransactions(movements) {
  if (!movements.length) {
    return '<p class="hs-empty">Nenhum movimento registrado neste período.</p>';
  }

  return `
    <div class="hs-moves">
      ${movements.map((transaction) => {
        const canceled = transaction.status === 'cancelada';
        const isLoss = getMoveTone(transaction) === 'loss';
        const isOutput = transaction.type === 'saida' || transaction.type === 'sangria';
        const amount = formatCurrency(transaction.total || transaction.amount);
        const detail = getTransactionDetail(transaction);

        return `
          <article class="hs-move ${canceled ? 'is-canceled' : ''}">
            <span class="hs-dot hs-dot--${getMoveTone(transaction)}" aria-hidden="true"></span>
            <div class="hs-move__main">
              <b>${escapeHtml(getMoneyTitle(transaction))}</b>
              <small>${formatWhen(transaction.createdAt)}, ${escapeHtml(canceled ? `cancelada - ${detail}` : detail)}</small>
            </div>
            <div class="hs-move__right">
              <b class="${isLoss ? 'hs-muted' : (canceled || isOutput ? 'hs-minus' : 'hs-plus')}">${isLoss ? amount : `${isOutput ? '−' : '+'} ${amount}`}</b>
              <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-action="cancel-transaction" data-transaction-id="${escapeHtml(transaction.id)}" ${canceled ? 'disabled' : ''}>Cancelar</button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

// Ponto colorido: verde entra dinheiro, vermelho sai, ambar e perda.
function getMoveTone(transaction) {
  if (['perda', 'baixa', 'consumo'].includes(transaction.type)) {
    return 'loss';
  }

  return transaction.type === 'saida' || transaction.type === 'sangria' ? 'out' : 'in';
}

function getFilteredTransactions() {
  return getTransactions().filter((transaction) => isInSelectedPeriod(transaction.createdAt));
}

function getFilteredClosedComandas() {
  return getClosedComandas().filter((comanda) => isInSelectedPeriod(comanda.closedAt));
}

function getPeriodOptions() {
  return [
    ['hour', 'Hora atual'],
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['month', 'Este mês'],
    ['year', 'Este ano'],
    ['all', 'Todo período']
  ];
}

function getPeriodLabel(period) {
  const labels = {
    hour: 'hora atual',
    today: 'hoje',
    yesterday: 'ontem',
    month: 'este mês',
    year: 'este ano',
    all: 'todo o período'
  };

  return labels[period] || 'período selecionado';
}

function isInSelectedPeriod(value) {
  if (!value || dashboardState.period === 'all') {
    return true;
  }

  const date = new Date(value);
  const now = new Date();

  if (dashboardState.period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  if (dashboardState.period === 'hour') {
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate()
      && date.getHours() === now.getHours();
  }

  if (dashboardState.period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (dashboardState.period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
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
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">X</button>
        </header>
        <div class="product-form">
          <p class="modal-text">
            Deseja cancelar esta comanda? Ela ficará registrada como cancelada e o valor será removido dos totais.
          </p>
          <label class="stacked-label">
            Motivo do cancelamento
            <input class="field" data-cancel-comanda-reason placeholder="Ex: Cliente desistiu" required>
          </label>
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
    saida: 'Saída de dinheiro',
    sangria: 'Sangria',
    perda: 'Perda'
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

    return 'venda registrada';
  }

  return transaction.description || 'sem descrição';
}

function formatComandaNumber(number) {
  return String(number || 0).padStart(4, '0');
}

// Hoje e hora atual mostram so a hora; os outros periodos mostram dia e hora.
function formatWhen(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  if (dashboardState.period === 'today' || dashboardState.period === 'hour') {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getPaymentLabel(method) {
  const labels = {
    dinheiro: 'Dinheiro',
    debito: 'Débito',
    credito: 'Crédito',
    pix: 'Pix'
  };

  return labels[method] || method;
}
