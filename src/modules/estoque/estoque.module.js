import { getCategories, getProductById, getShowcaseCategories, getShowcaseProducts } from '../../services/product.service.js';
import {
  cancelStockLaunch,
  clearShowcase,
  createStockLaunch,
  deleteStockComparisonRow,
  getProductionSalesComparison,
  getStockLaunches,
  getStockSummary,
  updateStockLaunch
} from '../../services/estoque.service.js';
import { showNotification } from '../../services/notification.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { on } from '../../services/event-bus.service.js';
import { UI_EVENTS } from '../../database/schema.js';

const estoqueState = {
  period: 'today',
  categoryIds: [],
  productIds: [],
  customStart: '',
  customEnd: '',
  editingId: null
};

const boundContainers = new WeakSet();
const realtimeBoundContainers = new WeakSet();

export function initEstoqueModule(container) {
  renderEstoque(container);

  if (!boundContainers.has(container)) {
    bindEstoqueEvents(container);
    boundContainers.add(container);
  }

  if (!realtimeBoundContainers.has(container)) {
    bindEstoqueRealtime(container);
    realtimeBoundContainers.add(container);
  }
}

function renderEstoque(container) {
  const filters = getFilters();
  const summary = getStockSummary(filters);
  const launches = getStockLaunches(filters);

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
        ${renderSummaryCard('Valor estimado na vitrine', summary.estimatedProductionValue, true)}
        ${renderSummaryCard('Unidades na vitrine', summary.producedUnits)}
        ${renderSummaryCard('Produtos diferentes', summary.uniqueProducts)}
        ${renderSummaryCard('Vendido em comandas', summary.salesValue, true)}
        ${renderSummaryCard('Qtd. vendida', summary.soldUnits)}
        ${renderSummaryCard('Diferenca valor', summary.valueDifference, true)}
        ${renderSummaryCard('Sobra estimada', summary.quantityBalance)}
      </div>

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
          <div class="comparison-counters-wrap">
            ${renderComparisonCounters(filters)}
            ${getProductionSalesComparison(filters).length ? '<button class="button button--danger button--small" type="button" data-action="clear-showcase">Limpar vitrine</button>' : ''}
          </div>
        </header>
        <div class="comparison-table">
          ${renderComparison(filters)}
        </div>
      </section>
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

    const button = event.target.closest('[data-action], [data-clear-filter]');

    if (!button) {
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
      return;
    }

    if (button.dataset.action === 'clear-showcase') {
      const confirmed = globalThis.confirm?.(`Limpar toda a vitrine ${getPeriodLabel()}? Isso cancela os lancamentos do periodo e sincroniza no banco.`) ?? true;

      if (!confirmed) {
        return;
      }

      const result = clearShowcase(getFilters());
      showNotification({
        title: 'Vitrine limpa',
        message: `${result.canceledLaunches} lancamento(s) cancelado(s) em ${result.clearedProducts} produto(s).`,
        type: 'danger'
      });
      renderEstoque(container);
    }
  });
}

function bindEstoqueRealtime(container) {
  on(UI_EVENTS.mobileFeedChanged, () => {
    if (container.querySelector('[data-estoque-screen]')) {
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

function renderStockForm() {
  const launch = estoqueState.editingId
    ? getStockLaunches({ period: 'all' }).find((item) => item.id === estoqueState.editingId)
    : null;
  const selectedProduct = launch ? getProductById(launch.produtoId) : null;
  const categoryName = launch ? launch.categoriaNome : selectedProduct ? getCategoryName(selectedProduct.categoryId) : 'Categoria automatica';
  const unitValue = launch ? launch.valorUnitario : selectedProduct ? selectedProduct.price : '';

  return `
    <label>
      Produto
      <select class="field" name="produtoId" required ${launch ? 'disabled' : ''}>
        <option value="">Selecione um produto</option>
        ${getLaunchableProducts(launch).map((product) => `
          <option value="${product.id}" ${launch?.produtoId === product.id ? 'selected' : ''}>
            ${product.name}
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
      <button class="button" type="submit">${launch ? 'Salvar edicao' : 'Lancar no estoque'}</button>
    </div>
  `;
}

function renderLaunchRows(launches) {
  if (!launches.length) {
    return '<div class="empty-products product-empty-large">NENHUM LANCAMENTO NO PERIODO</div>';
  }

  return launches.map((launch) => `
    <article class="manager-row ${launch.status === 'cancelado' ? 'is-canceled' : ''}">
      <div>
        <strong>${launch.produtoNome}</strong>
        <span>${launch.categoriaNome} - ${launch.quantidade} un. x ${formatCurrency(launch.valorUnitario)} - ${formatDate(launch.dataHora)} - ${launch.usuarioNome}</span>
      </div>
      <div class="row-actions">
        <strong class="stock-entry-total">${formatCurrency(launch.valorTotal)}</strong>
        <button class="button button--ghost" type="button" data-action="edit-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Editar</button>
        <button class="button button--danger" type="button" data-action="cancel-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Cancelar</button>
      </div>
    </article>
  `).join('');
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
            <td><strong>${item.produtoNome}</strong></td>
            <td>${item.categoriaNome}</td>
            <td>${item.quantidadeProduzida}</td>
            <td>${formatCurrency(item.valorProduzido)}</td>
            <td>${item.quantidadeVendida}</td>
            <td>${formatCurrency(item.valorVendido)}</td>
            <td>${item.sobraQuantidade}</td>
            <td>${formatCurrency(item.diferencaValor)}</td>
            <td>${item.percentualVendido}%</td>
            <td>
              <button class="button button--danger button--small" type="button" data-action="delete-comparison-row" data-product-id="${item.produtoId}">
                Apagar
              </button>
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

function renderSummaryCard(label, value, isCurrency = false) {
  return `<article class="summary-card"><span>${label}</span><strong>${isCurrency ? formatCurrency(value) : value}</strong></article>`;
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
            ${item.name}
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

function formatNumberInput(value) {
  return Number(value || 0).toFixed(2);
}
