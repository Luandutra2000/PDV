import { getCurrentUser, getUsers } from '../../services/auth.service.js?v=20260804-03';
import { getCategories, getProductById, getShowcaseCategories, getShowcaseProducts } from '../../services/product.service.js?v=20260804-03';
import {
  cancelStockLaunch,
  createStockLaunch,
  deleteStockComparisonRow,
  getProductionSalesComparison,
  getStockLaunches,
  getStockSummary,
  updateStockLaunch
} from '../../services/estoque.service.js?v=20260804-03';
import { showNotification } from '../../services/notification.service.js?v=20260804-03';
import { hydrateOnlineOperationalData } from '../../services/online-data.service.js?v=20260804-03';
import { on } from '../../services/event-bus.service.js?v=20260804-03';
import {
  getActiveOutOfStockSales,
  getShowcaseMovements,
  getShowcaseStock,
  getShowcaseStockByProductId
} from '../../services/showcase-stock.service.js?v=20260804-03';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-03';
import { getClosedComandas, getTransactions } from '../../services/transaction.service.js?v=20260804-03';
import { formatCurrency } from '../../utils/currency.js?v=20260804-03';
import { hasPermission } from '../../services/permission.service.js?v=20260804-03';
import { escapeHtml } from '../../utils/dom.js?v=20260804-03';

const estoqueState = {
  period: 'today',
  categoryIds: [],
  productIds: [],
  customStart: '',
  customEnd: '',
  editingId: null,
  movementHistoryExpanded: false
};

const boundContainers = new WeakSet();

export function initEstoqueModule(container) {
  renderEstoque(container);
  hydrateOnlineOperationalData({ financial: true, showcase: true }).then(() => renderEstoque(container));

  if (!boundContainers.has(container)) {
    bindEstoqueEvents(container);
    on(UI_EVENTS.showcaseDataChanged, () => {
      if (container.querySelector('[data-estoque-screen]')) {
        renderEstoque(container);
      }
    });
    boundContainers.add(container);
  }
}

function renderEstoque(container) {
  const filters = getFilters();
  const summary = getStockSummary(filters);
  const launches = getStockLaunches(filters);
  const liveSummary = getShowcaseLiveSummary(filters);

  container.innerHTML = `
    <section class="module-screen products-module" data-estoque-screen>
      <header class="module-header estoque-header">
        <div>
          <h1 class="pdv-title">Lancar Estoque</h1>
          <p class="module-subtitle">Registre o que foi produzido e enviado para a vitrine. Isso nao mexe no caixa.</p>
        </div>
        <div class="header-actions estoque-filters">
          <select class="field compact-select" data-stock-period aria-label="Periodo">
            ${renderPeriodOptions()}
          </select>
          ${renderFilterDropdown('Categorias', 'category', getShowcaseCategories(), estoqueState.categoryIds)}
          ${renderFilterDropdown('Produtos', 'product', getShowcaseProducts(), estoqueState.productIds)}
        </div>
      </header>

      ${estoqueState.period === 'custom' ? `
        <div class="custom-period-row">
          <input class="field" type="date" data-custom-start value="${estoqueState.customStart}" aria-label="Data inicial">
          <input class="field" type="date" data-custom-end value="${estoqueState.customEnd}" aria-label="Data final">
        </div>
      ` : ''}

      <div class="summary-grid stock-summary-grid">
        ${renderSummaryCard('Estoque atual', liveSummary.availableUnits)}
        ${renderSummaryCard('Vitrine estimada', liveSummary.estimatedValue, true)}
        ${renderSummaryCard('Produzido hoje', liveSummary.producedUnits)}
        ${renderSummaryCard('Vendido hoje', liveSummary.soldUnits)}
        ${renderSummaryCard('Vendido sem estoque', liveSummary.outOfStockUnits)}
        ${renderSummaryCard('Produtos zerados', liveSummary.zeroProducts)}
        ${renderSummaryCard('Produtos diferentes', summary.uniqueProducts)}
        ${renderSummaryCard('Vendido em comandas', summary.salesValue, true)}
        ${renderSummaryCard('Valor produzido', summary.estimatedProductionValue, true)}
        ${renderSummaryCard('Sobra estimada', summary.quantityBalance)}
      </div>

      ${renderLiveShowcase(liveSummary)}

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>${estoqueState.editingId ? 'Editar lancamento' : 'Novo lancamento'}</strong>
        </header>
        <form class="stock-form" data-stock-form>
          ${renderStockForm()}
        </form>
      </section>

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Producao vitrine ${getPeriodLabel()}</strong>
          <span>${launches.length === 1 ? '1 lancamento' : `${launches.length} lancamentos`}</span>
        </header>
        <div class="manager-list">
          ${renderLaunchRows(launches)}
        </div>
      </section>

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Comparativo producao x vendas ${getPeriodLabel()}</strong>
          ${renderComparisonCounters(filters)}
        </header>
        <div class="comparison-table">
          ${renderComparison(filters)}
        </div>
      </section>

      ${renderMovementHistory(liveSummary.movements)}
    </section>
  `;
}

function bindEstoqueEvents(container) {
  container.addEventListener('submit', (event) => {
    if (!event.target.matches('[data-stock-form]')) {
      return;
    }

    event.preventDefault();
    saveStockLaunch(event.target, container);
  });

  container.addEventListener('change', (event) => {
    if (!event.target.closest('[data-estoque-screen]')) {
      return;
    }

    if (event.target.matches('[data-stock-period]')) {
      estoqueState.period = event.target.value;
      renderEstoque(container);
      return;
    }

    if (event.target.matches('[data-custom-start]')) {
      estoqueState.customStart = event.target.value;
      renderEstoque(container);
      return;
    }

    if (event.target.matches('[data-custom-end]')) {
      estoqueState.customEnd = event.target.value;
      renderEstoque(container);
      return;
    }

    if (event.target.matches('[data-filter-check]')) {
      updateFilterSelection(event.target);
      renderEstoque(container);
      return;
    }

    if (event.target.matches('[name="produtoId"]')) {
      updateSelectedProductFields(event.target);
    }
  });

  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-estoque-screen]')) {
      return;
    }

    const button = event.target.closest('[data-action], [data-clear-filter], [data-showcase-movements-more]');

    if (!button) {
      return;
    }

    if (button.matches('[data-showcase-movements-more]')) {
      estoqueState.movementHistoryExpanded = !estoqueState.movementHistoryExpanded;
      renderEstoque(container);
      return;
    }

    if (button.dataset.clearFilter === 'category') {
      estoqueState.categoryIds = [];
      renderEstoque(container);
      return;
    }

    if (button.dataset.clearFilter === 'product') {
      estoqueState.productIds = [];
      renderEstoque(container);
      return;
    }

    if (button.dataset.action === 'edit-launch') {
      estoqueState.editingId = button.dataset.launchId;
      renderEstoque(container);
      return;
    }

    if (button.dataset.action === 'cancel-edit') {
      estoqueState.editingId = null;
      renderEstoque(container);
      return;
    }

    if (button.dataset.action === 'cancel-launch') {
      cancelStockLaunch(button.dataset.launchId);
      showNotification({
        title: 'Lancamento cancelado',
        message: 'A producao saiu da vitrine sem alterar o caixa.',
        type: 'danger'
      });
      renderEstoque(container);
      return;
    }

    if (button.dataset.action === 'delete-comparison-row') {
      const result = deleteStockComparisonRow(button.dataset.productId, getFilters());
      showNotification({
        title: 'Linha apagada do comparativo',
        message: result.canceledLaunches
          ? `${result.canceledLaunches} lancamento(s) da vitrine foram cancelados.`
          : 'A linha foi ocultada do comparativo sem apagar venda do caixa.',
        type: 'danger'
      });
      renderEstoque(container);
    }
  });
}

function updateSelectedProductFields(select) {
  const product = getProductById(select.value);
  const form = select.closest('form');

  form.elements.valorUnitario.value = product ? formatNumberInput(product.price) : '';
  form.querySelector('[data-product-category-name]').textContent = product
    ? getCategoryName(product.categoryId)
    : 'Categoria automatica';
}

function saveStockLaunch(form, container) {
  const formData = new FormData(form);
  const produtoId = String(formData.get('produtoId') || '');
  const quantidade = Number(formData.get('quantidade') || 0);

  try {
    if (estoqueState.editingId) {
      updateStockLaunch(estoqueState.editingId, { quantidade });
      estoqueState.editingId = null;
      showNotification({
        title: 'Lancamento atualizado',
        message: 'Cards, lista e comparativo recalculados.',
        type: 'success'
      });
    } else {
      createStockLaunch({ produtoId, quantidade });
      estoqueState.period = 'today';
      estoqueState.categoryIds = [];
      estoqueState.productIds = [];
      showNotification({
        title: 'Estoque lancado',
        message: 'Produto enviado para a vitrine.',
        type: 'success'
      });
    }

    renderEstoque(container);
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel lancar',
      message: error.message || 'Confira produto e quantidade.',
      type: 'danger'
    });
  }
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
}

function renderStockForm() {
  const launch = estoqueState.editingId
    ? getStockLaunches({ period: 'all' }).find((item) => item.id === estoqueState.editingId)
    : null;
  const selectedProduct = launch ? getProductById(launch.produtoId) : null;
  const categoryName = launch ? launch.categoriaNome : selectedProduct ? getCategoryName(selectedProduct.categoryId) : 'Categoria automatica';
  const unitValue = launch ? launch.valorUnitario : selectedProduct ? selectedProduct.price : '';
  const canSubmit = launch ? canCurrentUser('showcase.edit') : canCurrentUser('showcase.launch');

  return `
    <label>
      Produto
      <select class="field" name="produtoId" required ${launch ? 'disabled' : ''}>
        <option value="">Selecione um produto</option>
        ${getLaunchableProducts(launch).map((product) => `
          <option value="${escapeHtml(product.id)}" ${launch?.produtoId === product.id ? 'selected' : ''}>
            ${escapeHtml(product.name)}
          </option>
        `).join('')}
      </select>
      ${launch ? `<input type="hidden" name="produtoId" value="${launch.produtoId}">` : ''}
    </label>
    <label>
      Categoria
      <div class="readonly-field" data-product-category-name>${categoryName}</div>
    </label>
    <label>
      Quantidade
      <input class="field" name="quantidade" type="number" min="1" step="1" placeholder="0" required value="${launch ? launch.quantidade : ''}">
    </label>
    <label>
      Valor unitario
      <input class="field" name="valorUnitario" type="number" min="0" step="0.01" readonly value="${unitValue === '' ? '' : formatNumberInput(unitValue)}">
    </label>
    <div class="form-actions stock-form__actions">
      ${launch ? '<button class="button button--ghost" type="button" data-action="cancel-edit">Cancelar</button>' : ''}
      ${canSubmit ? `<button class="button" type="submit">${launch ? 'Salvar edicao' : 'Lancar no estoque'}</button>` : ''}
    </div>
  `;
}

function renderLaunchRows(launches) {
  if (!launches.length) {
    return '<div class="empty-products product-empty-large">NENHUM LANCAMENTO NO PERIODO</div>';
  }

  const canEditLaunch = canCurrentUser('showcase.edit');

  return launches.map((launch) => `
    <article class="manager-row ${launch.status === 'cancelado' ? 'is-canceled' : ''}">
      <div>
        <strong>${escapeHtml(launch.produtoNome)}</strong>
        <span>${escapeHtml(launch.categoriaNome)} - ${launch.quantidade} un. x ${formatCurrency(launch.valorUnitario)} - ${formatDate(launch.dataHora)} - ${escapeHtml(resolveStockLaunchUserName(launch))}</span>
      </div>
      <div class="row-actions">
        <strong class="stock-entry-total">${formatCurrency(launch.valorTotal)}</strong>
        ${canEditLaunch ? `<button class="button button--ghost" type="button" data-action="edit-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Editar</button>` : ''}
        ${canEditLaunch ? `<button class="button button--danger" type="button" data-action="cancel-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Cancelar</button>` : ''}
      </div>
    </article>
  `).join('');
}

function renderLiveShowcase(liveSummary) {
  if (!liveSummary.stockRows.length) {
    return `
      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Estoque atual da vitrine</strong>
          <span>Nenhum produto com saldo</span>
        </header>
        <div class="empty-products product-empty-large">SEM ESTOQUE REGISTRADO NA VITRINE</div>
      </section>
    `;
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Estoque atual da vitrine</strong>
        <span>${liveSummary.zeroProducts ? `${liveSummary.zeroProducts} produto(s) zerado(s)` : 'Todos com saldo'}</span>
      </header>
      <div class="live-stock-list">
        ${liveSummary.stockRows.map((item) => `
          <article class="live-stock-row ${item.quantityAvailable <= 0 ? 'live-stock-row--empty' : ''}">
            <div>
              <strong>${escapeHtml(item.productName)}</strong>
              <span>${escapeHtml(item.categoryName)}</span>
            </div>
            <div>
              <strong>${item.quantityAvailable}</strong>
              <span>${item.quantityAvailable <= 0 ? 'Sem estoque' : 'Disponivel'}</span>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function getLaunchableProducts(launch = null) {
  const products = getShowcaseProducts();

  if (!launch || products.some((product) => product.id === launch.produtoId)) {
    return products;
  }

  const currentProduct = getProductById(launch.produtoId);
  return currentProduct ? [currentProduct, ...products] : products;
}

function renderComparison(filters) {
  const comparison = getProductionSalesComparison(filters);
  const canWriteOff = canCurrentUser('stock.writeoff');

  if (!comparison.length) {
    return '<div class="empty-products product-empty-large">SEM DADOS PARA COMPARAR</div>';
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Produto</th>
          <th>Categoria</th>
          <th>Produzido</th>
          <th>Valor produzido</th>
          <th>Vendido</th>
          <th>Valor vendido</th>
          <th>Sobra</th>
          <th>Diferenca</th>
          <th>% vendido</th>
          <th>Acoes</th>
        </tr>
      </thead>
      <tbody>
        ${comparison.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.produtoNome)}</strong></td>
            <td>${escapeHtml(item.categoriaNome)}</td>
            <td>${item.quantidadeProduzida}</td>
            <td>${formatCurrency(item.valorProduzido)}</td>
            <td>${item.quantidadeVendida}</td>
            <td>${formatCurrency(item.valorVendido)}</td>
            <td>${item.sobraQuantidade}</td>
            <td>${formatCurrency(item.diferencaValor)}</td>
            <td>${item.percentualVendido}%</td>
            <td>
              ${canWriteOff ? `<button class="button button--danger button--small" type="button" data-action="delete-comparison-row" data-product-id="${item.produtoId}">
                Apagar
              </button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderComparisonCounters(filters) {
  const comparison = getProductionSalesComparison(filters);
  const vitrine = comparison.reduce((total, item) => total + item.quantidadeProduzida, 0);
  const vendidos = comparison.reduce((total, item) => total + item.quantidadeVendida, 0);
  const sobras = comparison.reduce((total, item) => total + item.sobraQuantidade, 0);

  return `
    <div class="comparison-counters" aria-label="Resumo do comparativo">
      <span>Vitrine: <strong>${vitrine}</strong></span>
      <span>Vendidos: <strong>${vendidos}</strong></span>
      <span>Sobras: <strong>${sobras}</strong></span>
    </div>
  `;
}

function renderMovementHistory(movements) {
  const visibleLimit = estoqueState.movementHistoryExpanded ? 30 : 8;
  const visibleMovements = movements.slice(0, visibleLimit);

  if (!movements.length) {
    return `
      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Historico da vitrine ${getPeriodLabel()}</strong>
          <span>0 movimentos</span>
        </header>
        <div class="empty-products product-empty-large">SEM MOVIMENTACAO NO PERIODO</div>
      </section>
    `;
  }

  return `
    <section class="manager-section">
      <header class="manager-section__header">
        <strong>Historico da vitrine ${getPeriodLabel()}</strong>
        <span>${movements.length} movimento(s)</span>
      </header>
      <div class="comparison-table">
        <table class="showcase-movement-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Tipo</th>
              <th>Quantidade</th>
              <th>Anterior</th>
              <th>Novo</th>
              <th>Venda/comanda</th>
              <th>Usuario</th>
              <th>Horario</th>
            </tr>
          </thead>
          <tbody>
            ${visibleMovements.map((movement) => `
              <tr>
                <td><strong>${escapeHtml(movement.productName)}</strong></td>
                <td>${escapeHtml(formatMovementType(movement.movementType))}</td>
                <td>${movement.quantity}</td>
                <td>${movement.previousQuantity}</td>
                <td>${movement.newQuantity}</td>
                <td>${escapeHtml(resolveShowcaseMovementCommandReference(movement))}</td>
                <td>${escapeHtml(resolveShowcaseMovementUserName(movement.userId))}</td>
                <td>${formatDate(movement.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${movements.length > 8 ? `
        <div class="table-footer-actions">
          <button class="button button--ghost button--small" type="button" data-showcase-movements-more>
            ${estoqueState.movementHistoryExpanded ? 'Ver menos' : `Ver mais ${Math.min(movements.length - 8, 22)} movimento(s)`}
          </button>
        </div>
      ` : ''}
    </section>
  `;
}

function renderSummaryCard(label, value, isCurrency = false) {
  return `<article class="summary-card"><span>${label}</span><strong>${isCurrency ? formatCurrency(value) : value}</strong></article>`;
}

function getShowcaseLiveSummary(filters) {
  const productIds = new Set([
    ...getShowcaseProducts().map((product) => product.id),
    ...getShowcaseStock().map((item) => item.productId)
  ]);
  const stockRows = [...productIds]
    .map((productId) => {
      const product = getProductById(productId);
      const stock = getShowcaseStockByProductId(productId);

      return {
        productId,
        productName: product?.name || 'Produto removido',
        categoryName: product ? getCategoryName(product.categoryId) : 'Sem categoria',
        quantityAvailable: Math.max(Number(stock.quantityAvailable || 0), 0),
        estimatedValue: Math.max(Number(stock.quantityAvailable || 0), 0) * Number(product?.price || 0),
        updatedAt: stock.updatedAt
      };
    })
    .sort((left, right) => {
      if (left.quantityAvailable <= 0 && right.quantityAvailable > 0) {
        return -1;
      }

      if (left.quantityAvailable > 0 && right.quantityAvailable <= 0) {
        return 1;
      }

      return left.productName.localeCompare(right.productName, 'pt-BR');
    });
  const movements = getShowcaseMovements()
    .filter((movement) => isInSelectedPeriod(movement.createdAt, filters.period || 'today', filters))
    .map((movement) => {
      const product = getProductById(movement.productId);

      return {
        ...movement,
        productName: product?.name || 'Produto removido'
      };
    })
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const activeOutOfStock = getActiveOutOfStockSales()
    .filter((item) => isInSelectedPeriod(item.createdAt, filters.period || 'today', filters));

  return {
    stockRows,
    movements,
    availableUnits: stockRows.reduce((total, item) => total + item.quantityAvailable, 0),
    estimatedValue: stockRows.reduce((total, item) => total + item.estimatedValue, 0),
    zeroProducts: stockRows.filter((item) => item.quantityAvailable <= 0).length,
    producedUnits: movements
      .filter((movement) => movement.movementType === 'entrada_producao' && movement.status !== 'estornada')
      .reduce((total, movement) => total + Number(movement.quantity || 0), 0),
    soldUnits: movements
      .filter((movement) => movement.movementType === 'saida_venda' && movement.status !== 'estornada')
      .reduce((total, movement) => total + Number(movement.quantity || 0), 0),
    outOfStockUnits: activeOutOfStock.reduce((total, item) => total + Number(item.quantity || 0), 0)
  };
}

function formatMovementType(type) {
  const labels = {
    entrada_producao: 'Entrada de producao',
    saida_venda: 'Baixa por venda',
    ajuste_manual: 'Ajuste manual',
    venda_sem_estoque: 'Venda sem estoque',
    estorno_venda: 'Estorno de venda',
    estorno_sem_estoque: 'Estorno sem estoque'
  };

  return labels[type] || type;
}

export function resolveShowcaseMovementUserName(userId) {
  if (!userId) {
    return '-';
  }

  const user = getUsers().find((item) => item.id === userId);
  return user?.name || userId;
}

export function resolveStockLaunchUserName(launch = {}) {
  const explicitName = String(launch.usuarioNome || '').trim();

  if (explicitName && explicitName !== 'undefined') {
    return explicitName;
  }

  return resolveShowcaseMovementUserName(launch.usuarioId || launch.createdBy || '');
}

export function resolveShowcaseMovementCommandReference(movement = {}) {
  const commandId = movement.commandId || '';
  const saleId = movement.saleId || '';
  const command = commandId
    ? getClosedComandas().find((item) => item.id === commandId)
    : null;
  const sale = saleId
    ? getTransactions().find((item) => item.id === saleId)
    : null;
  const commandNumber = command?.number || sale?.comandaNumber;

  if (commandNumber) {
    return `Comanda ${formatComandaNumber(commandNumber)}`;
  }

  return commandId || saleId || '-';
}

function renderPeriodOptions() {
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['month', 'Este mes'],
    ['year', 'Este ano'],
    ['all', 'Todo periodo'],
    ['custom', 'Periodo personalizado']
  ];

  return options.map(([value, label]) => `<option value="${value}" ${estoqueState.period === value ? 'selected' : ''}>${label}</option>`).join('');
}

function getPeriodLabel() {
  if (estoqueState.period === 'today') {
    return 'hoje';
  }

  if (estoqueState.period === 'yesterday') {
    return 'ontem';
  }

  if (estoqueState.period === 'month') {
    return 'este mes';
  }

  if (estoqueState.period === 'year') {
    return 'este ano';
  }

  if (estoqueState.period === 'custom') {
    return 'no periodo selecionado';
  }

  return 'todo periodo';
}

function renderFilterDropdown(label, type, items, selectedIds) {
  const selectedText = getFilterLabel(label, items, selectedIds);

  return `
    <details class="filter-dropdown">
      <summary>${selectedText}</summary>
      <div class="filter-menu">
        <div class="filter-menu__header">
          <strong>${label}</strong>
          <button type="button" data-clear-filter="${type}">Limpar</button>
        </div>
        ${items.map((item) => `
          <label class="filter-option">
            <input
              type="checkbox"
              value="${item.id}"
              data-filter-check
              data-filter-type="${type}"
              ${selectedIds.includes(item.id) ? 'checked' : ''}
            >
            ${escapeHtml(item.name)}
          </label>
        `).join('')}
      </div>
    </details>
  `;
}

function getFilterLabel(label, items, selectedIds) {
  if (!selectedIds.length) {
    return `Todos ${label.toLowerCase()}`;
  }

  if (selectedIds.length === 1) {
    return items.find((item) => item.id === selectedIds[0])?.name || `1 ${label.toLowerCase()}`;
  }

  return `${selectedIds.length} selecionados`;
}

function updateFilterSelection(input) {
  const target = input.dataset.filterType === 'category' ? estoqueState.categoryIds : estoqueState.productIds;

  if (input.checked && !target.includes(input.value)) {
    target.push(input.value);
  }

  if (!input.checked) {
    const index = target.indexOf(input.value);
    if (index >= 0) {
      target.splice(index, 1);
    }
  }
}

function getFilters() {
  return {
    period: estoqueState.period,
    categoryIds: estoqueState.categoryIds,
    productIds: estoqueState.productIds,
    customStart: estoqueState.customStart,
    customEnd: estoqueState.customEnd
  };
}

function getCategoryName(categoryId) {
  return getCategories().find((category) => category.id === categoryId)?.name || 'Sem categoria';
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

function formatComandaNumber(number) {
  return String(number || 0).padStart(4, '0');
}

function isInSelectedPeriod(value, period, filters = {}) {
  if (!value || period === 'all') {
    return true;
  }

  const date = new Date(value);
  const now = new Date();

  if (period === 'custom') {
    const start = filters.customStart ? new Date(`${filters.customStart}T00:00:00`) : null;
    const end = filters.customEnd ? new Date(`${filters.customEnd}T23:59:59`) : null;

    return (!start || date >= start) && (!end || date <= end);
  }

  if (period === 'month') {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }

  if (period === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    return date.toDateString() === yesterday.toDateString();
  }

  if (period === 'year') {
    return date.getFullYear() === now.getFullYear();
  }

  return date.toDateString() === now.toDateString();
}

function formatNumberInput(value) {
  return Number(value || 0).toFixed(2);
}
