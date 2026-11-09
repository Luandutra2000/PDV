import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';
import { icon } from './icons.js?v=20260807-06';

export function renderCashKpis(resumo = {}) {
  return [
    renderKpi('Caixa atual', resumo.caixaAtual),
    renderKpi('Vitrine estimada', resumo.vitrineEstimada),
    renderKpi('Total vendido', resumo.totalVendido),
    renderKpi('Entradas', resumo.entradas, 'is-plus'),
    renderKpi('Saídas', resumo.saidas, 'is-minus')
  ].join('');
}

function renderKpi(label, value, tone = '') {
  return `
    <div class="ui-kpi${tone ? ` ${tone}` : ''}">
      <small>${label}</small>
      <b>${formatCurrency(Number(value || 0))}</b>
    </div>
  `;
}

// Pendencias de envio ao servidor (queda de conexao, erro): o operador precisa
// saber que as vendas ainda estao so neste aparelho.
export function renderSyncPending(pending = 0) {
  const count = Number(pending) || 0;
  if (!count) return '';
  return `<span class="ui-status ui-status--pending" role="status" title="Mantenha o aparelho ligado e conectado; o envio e repetido automaticamente.">${count === 1 ? '1 envio pendente' : `${count} envios pendentes`}</span>`;
}

export function renderCashSessionStatus(status = {}, { pendingSync = 0 } = {}) {
  const pending = renderSyncPending(pendingSync);
  if (status.open) {
    return `
      ${pending}
      <span class="ui-status ui-status--open"><i></i>Caixa aberto</span>
      <button class="ui-btn" type="button" data-action="go-to-cash-closing">Fechar caixa</button>
    `;
  }

  return `
    ${pending}
    <span class="ui-status ui-status--closed"><i></i>Caixa fechado</span>
    <button class="ui-btn ui-btn--ok" type="button" data-action="open-cash-session">Abrir caixa</button>
  `;
}

export function renderUserMenu(currentUser, themeLabel) {
  const name = String(currentUser?.name || '').trim();
  const initial = escapeHtml(Array.from(name)[0]?.toLocaleUpperCase('pt-BR') || '?');

  return `
    <details class="ui-user">
      <summary class="ui-user__summary">
        <span class="ui-avatar">${initial}</span>
        <span class="ui-user__name">${escapeHtml(name)}</span>
      </summary>
      <div class="ui-user__menu">
        <button type="button" data-action="toggle-theme">${escapeHtml(themeLabel)}</button>
        <button type="button" data-action="refresh">Atualizar</button>
        <button type="button" class="is-danger" data-action="logout">${icon('logout')}Sair</button>
      </div>
    </details>
  `;
}
