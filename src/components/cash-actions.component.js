import { registerCashMovement } from '../services/transaction.service.js?v=20260804-06';
import { formatCurrency } from '../utils/currency.js?v=20260804-06';
import { escapeHtml } from '../utils/dom.js?v=20260804-06';
import { showNotification } from '../services/notification.service.js?v=20260804-06';
import { createShowcaseWriteOff, getTodayShowcaseProducts } from '../services/estoque.service.js?v=20260804-06';
import { getFinancialCategories } from '../services/financial.service.js?v=20260804-06';
import { hasPermission } from '../services/permission.service.js?v=20260804-06';

const ENTRY_CATEGORIES = ['Reforco de caixa', 'Pagamento de cliente', 'Dinheiro extra', 'Ajuste manual', 'Outros'];
const OUTPUT_CATEGORIES = ['Compra de material', 'Compra de ingredientes', 'Pagamento de fornecedor', 'Despesa operacional', 'Retirada do dono', 'Troco', 'Manutencao', 'Outros'];

export function renderCashActionButtons(currentUser, { includeQuickClosing = false, includeWriteOff = true } = {}) {
  const buttons = [];

  if (hasPermission(currentUser, 'cash.movement')) {
    buttons.push('<button class="ui-btn" type="button" data-action="open-entry">+ Entrada</button>');
  }

  if (hasPermission(currentUser, 'cash.withdrawal')) {
    buttons.push('<button class="ui-btn ui-btn--loss" type="button" data-action="open-output">− Saída</button>');
  }

  if (includeQuickClosing && hasPermission(currentUser, 'cash.close')) {
    buttons.push('<button class="ui-btn" type="button" data-action="open-quick-closing">Fechamento rápido</button>');
  }

  if (includeWriteOff && hasPermission(currentUser, 'stock.writeoff')) {
    buttons.push('<button class="ui-btn ui-btn--loss" type="button" data-action="open-write-off">Perda / Consumo</button>');
  }

  return buttons.join('\n');
}

export function renderWriteOffModal() {
  const showcaseProducts = getTodayShowcaseProducts();

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Perda / Consumo</h2>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">X</button>
        </header>
        ${showcaseProducts.length ? `
          <form class="product-form" data-write-off-form>
            <label class="stacked-label">
              Produto da vitrine
              <select class="field" name="productId" required>
                ${showcaseProducts.map((product) => `
                  <option value="${escapeHtml(product.id)}">${escapeHtml(product.name)} - ${formatCurrency(product.price)}</option>
                `).join('')}
              </select>
            </label>
            <label class="stacked-label">
              Quantidade
              <input class="field" name="quantity" type="number" min="1" step="1" required>
            </label>
            <label class="stacked-label">
              Motivo
              <select class="field" name="reason" required>
                <option value="quebra">Quebra</option>
                <option value="consumo-interno">Consumo interno</option>
                <option value="cortesia">Cortesia</option>
                <option value="vencido">Vencido</option>
                <option value="erro-lancamento">Erro de lançamento</option>
                <option value="outro">Outro</option>
              </select>
            </label>
            <label class="stacked-label">
              Observação
              <input class="field" name="note" placeholder="Opcional">
            </label>
            <div class="form-actions">
              <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
              <button class="button button--danger" type="submit">Registrar baixa</button>
            </div>
          </form>
        ` : `
          <div class="product-form">
            <p class="modal-text">Nenhum produto foi lançado na vitrine hoje. Lance estoque antes de registrar perda ou consumo.</p>
            <div class="form-actions">
              <button class="button" type="button" data-action="close-modal">Entendi</button>
            </div>
          </div>
        `}
      </div>
    </div>
  `;
}

export function renderCashMovementModal(type) {
  const title = type === 'entrada' ? 'Registrar entrada' : 'Registrar saída';
  const financeType = type === 'entrada' ? 'income' : 'expense';
  const fallbackCategories = type === 'entrada' ? ENTRY_CATEGORIES : OUTPUT_CATEGORIES;
  const categories = getFinancialCategories({ type: financeType })
    .map((category) => ({ id: category.id, name: category.name }))
    .concat(fallbackCategories.map((category) => ({ id: category, name: category })))
    .filter((category, index, list) => list.findIndex((item) => item.id === category.id) === index);

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>${title}</h2>
          <button class="icon-button" type="button" data-action="close-modal" aria-label="Fechar">X</button>
        </header>
        <form class="product-form" data-cash-form>
          <input type="hidden" name="type" value="${type}">
          <label class="stacked-label">
            Valor
            <input class="field" name="amount" type="number" min="0.01" step="0.01" required>
          </label>
          <label class="stacked-label">
            Categoria
            <select class="field" name="category" required>
              ${categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('')}
            </select>
          </label>
          <label class="stacked-label">
            Descrição obrigatória
            <input class="field" name="description" placeholder="Ex: Sangria, reforço de caixa" required>
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

// Devolve true quando o movimento foi registrado (o chamador fecha o modal e redesenha)
// e false quando a validacao ou o servico recusou (o aviso ja foi mostrado).
export async function submitCashMovementForm(formData) {
  const description = String(formData.get('description') || '').trim();

  if (!description) {
    showNotification({
      title: 'Descrição obrigatória',
      message: 'Informe o motivo do movimento de dinheiro.',
      type: 'danger'
    });
    return false;
  }

  try {
    registerCashMovement({
      type: formData.get('type'),
      amount: formData.get('amount'),
      category: formData.get('category'),
      description,
      userName: 'Operador local'
    });
    showNotification({
      title: formData.get('type') === 'entrada' ? 'Entrada registrada' : 'Saída registrada',
      message: `${formatCurrency(formData.get('amount'))} lançado no histórico.`,
      type: formData.get('type') === 'entrada' ? 'success' : 'danger'
    });
    return true;
  } catch (error) {
    showNotification({
      title: 'Não foi possível registrar',
      message: error.message || 'Confira os dados do movimento.',
      type: 'danger'
    });
    return false;
  }
}

// Mesmo contrato de retorno de submitCashMovementForm.
export async function submitWriteOffForm(formData) {
  try {
    createShowcaseWriteOff({
      productId: formData.get('productId'),
      quantity: formData.get('quantity'),
      reason: formData.get('reason'),
      note: formData.get('note')
    });
    showNotification({
      title: 'Baixa registrada',
      message: 'Perda ou consumo entrou na conferência da vitrine.',
      type: 'success'
    });
    return true;
  } catch (error) {
    showNotification({
      title: 'Não foi possível registrar',
      message: error.message || 'Confira produto, quantidade e motivo.',
      type: 'danger'
    });
    return false;
  }
}
