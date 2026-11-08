import { getCurrentUser, getUsers } from '../../services/auth.service.js?v=20260804-06';
import { getCategories, getProductById, getShowcaseCategories, getShowcaseProducts } from '../../services/product.service.js?v=20260804-06';
import {
  cancelStockLaunch,
  createStockLaunch,
  deleteStockComparisonRow,
  getProductionSalesComparison,
  getStockLaunches,
  getStockSummary,
  updateStockLaunch
} from '../../services/estoque.service.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { hydrateOnlineOperationalData } from '../../services/online-data.service.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import {
  getActiveOutOfStockSales,
  getShowcaseMovements,
  getShowcaseStock,
  getShowcaseStockByProductId
} from '../../services/showcase-stock.service.js?v=20260804-06';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { getClosedComandas, getTransactions } from '../../services/transaction.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { hasPermission } from '../../services/permission.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-07';

const estoqueState = {
  period: 'today',
  categoryIds: [],
  productIds: [],
  customStart: '',
  customEnd: '',
  editingId: null,
  movementHistoryExpanded: false
};

// Ate esta quantidade a vitrine mostra "N restantes" (igual a frente de caixa).
const LOW_STOCK_LIMIT = 3;

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
  const periodLabel = getPeriodLabel();

  container.innerHTML = `
    <section class="ui-screen vt" data-estoque-screen>
      <header class="ui-head vt-head">
        <div class="vt-head__title">
          <h1 class="vt-title">Vitrine</h1>
          <p class="vt-sub">Registre o que foi produzido e enviado para a vitrine. Isso não mexe no caixa.</p>
        </div>
        <div class="vt-filters">
          <select class="ui-input vt-period" data-stock-period aria-label="Período">
            ${renderPeriodOptions()}
          </select>
          ${renderFilterDropdown('Produtos', 'product', getShowcaseProducts(), estoqueState.productIds)}
        </div>
      </header>

      ${estoqueState.period === 'custom' ? `
        <div class="vt-custom">
          <input class="ui-input" type="date" data-custom-start value="${escapeHtml(estoqueState.customStart)}" aria-label="Data inicial">
          <input class="ui-input" type="date" data-custom-end value="${escapeHtml(estoqueState.customEnd)}" aria-label="Data final">
        </div>
      ` : ''}

      ${renderStatsRow('Resumo da vitrine', [
        ['Estoque atual', `${liveSummary.availableUnits} un.`],
        ['Vitrine estimada', formatCurrency(liveSummary.estimatedValue)],
        ['Produzido hoje', `${liveSummary.producedUnits} un.`],
        ['Vendido hoje', `${liveSummary.soldUnits} un.`],
        ['Sobra estimada', `${summary.quantityBalance} un.`],
        ['Zerados', `${liveSummary.zeroProducts} ${liveSummary.zeroProducts === 1 ? 'produto' : 'produtos'}`, liveSummary.zeroProducts > 0 ? 'is-minus' : '']
      ])}

      ${renderStatsRow('Outros números do período', [
        ['Vendido sem estoque', `${liveSummary.outOfStockUnits} un.`],
        ['Produtos diferentes', String(summary.uniqueProducts)],
        ['Vendido em comandas', formatCurrency(summary.salesValue)],
        ['Valor produzido', formatCurrency(summary.estimatedProductionValue)]
      ])}

      <div class="ui-cols vt-cols">
        ${renderLiveShowcase(liveSummary)}

        <aside class="ui-panel vt-side">
          <h2 class="ui-head">${estoqueState.editingId ? 'Editar lançamento' : 'Novo lançamento'}</h2>
          <form class="vt-form" data-stock-form>
            ${renderStockForm()}
          </form>
          <h2 class="ui-head vt-side__sub">Produção e vendas ${periodLabel}</h2>
          ${renderProductionBars(liveSummary, summary)}
        </aside>
      </div>

      <section class="ui-panel">
        <h2 class="ui-head">
          Lançamentos ${periodLabel}
          <span>${launches.length === 1 ? '1 lançamento' : `${launches.length} lançamentos`}</span>
        </h2>
        ${renderLaunchRows(launches)}
      </section>

      <section class="ui-panel">
        <h2 class="ui-head">
          Comparativo produção x vendas ${periodLabel}
          ${renderComparisonCounters(filters)}
        </h2>
        ${renderComparison(filters)}
      </section>

      ${renderMovementHistory(liveSummary.movements)}
    </section>
  `;
}

function renderStatsRow(label, cards) {
  return `
    <section class="ui-stats vt-stats" style="--n:${cards.length}" aria-label="${escapeHtml(label)}">
      ${cards.map(([title, value, tone]) => `
        <div class="ui-stat">
          <small>${escapeHtml(title)}</small>
          <b${tone ? ` class="${tone}"` : ''}>${escapeHtml(value)}</b>
        </div>
      `).join('')}
    </section>
  `;
}

function renderProductionBars(liveSummary, summary) {
  const rows = [
    ['Produzido', Number(liveSummary.producedUnits) || 0, 'var(--ink)'],
    ['Vendido', Number(liveSummary.soldUnits) || 0, 'var(--accent)'],
    ['Sobra', Math.max(Number(summary.quantityBalance) || 0, 0), 'var(--muted)']
  ];
  const largest = Math.max(...rows.map(([, value]) => value), 0);

  return `
    <div class="ui-bars">
      ${rows.map(([label, value, color]) => `
        <div class="ui-bar-row">
          <span>${label}</span>
          <div class="track"><i style="width:${largest > 0 ? Math.round((value / largest) * 100) : 0}%;--c:${color}"></i></div>
          <b>${value} un.</b>
        </div>
      `).join('')}
    </div>
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
        title: 'Lançamento cancelado',
        message: 'A produção saiu da vitrine sem alterar o caixa.',
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
          ? `${result.canceledLaunches} lançamento(s) da vitrine foram cancelados.`
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
    : 'Categoria automática';
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
        title: 'Lançamento atualizado',
        message: 'Cards, lista e comparativo recalculados.',
        type: 'success'
      });
    } else {
      createStockLaunch({ produtoId, quantidade });
      estoqueState.period = 'today';
      estoqueState.categoryIds = [];
      estoqueState.productIds = [];
      showNotification({
        title: 'Estoque lançado',
        message: 'Produto enviado para a vitrine.',
        type: 'success'
      });
    }

    renderEstoque(container);
  } catch (error) {
    showNotification({
      title: 'Não foi possível lançar',
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
  const categoryName = launch ? launch.categoriaNome : selectedProduct ? getCategoryName(selectedProduct.categoryId) : 'Categoria automática';
  const unitValue = launch ? launch.valorUnitario : selectedProduct ? selectedProduct.price : '';
  const canSubmit = launch ? canCurrentUser('showcase.edit') : canCurrentUser('showcase.launch');

  return `
    <div class="ui-field">
      <label for="vt-produto">Produto</label>
      <select class="ui-input" id="vt-produto" name="produtoId" required ${launch ? 'disabled' : ''}>
        <option value="">Selecione um produto</option>
        ${getLaunchableProducts(launch).map((product) => `
          <option value="${escapeHtml(product.id)}" ${launch?.produtoId === product.id ? 'selected' : ''}>
            ${escapeHtml(product.name)}
          </option>
        `).join('')}
      </select>
      ${launch ? `<input type="hidden" name="produtoId" value="${escapeHtml(launch.produtoId)}">` : ''}
    </div>
    <div class="ui-field">
      <label id="vt-categoria-label">Categoria</label>
      <div class="ui-input vt-readonly" aria-labelledby="vt-categoria-label" data-product-category-name>${escapeHtml(categoryName)}</div>
    </div>
    <div class="vt-form__row">
      <div class="ui-field">
        <label for="vt-quantidade">Quantidade</label>
        <input class="ui-input" id="vt-quantidade" name="quantidade" type="number" min="1" step="1" placeholder="0" required value="${launch ? launch.quantidade : ''}">
      </div>
      <div class="ui-field">
        <label for="vt-valor">Valor unitário</label>
        <input class="ui-input" id="vt-valor" name="valorUnitario" type="number" min="0" step="0.01" readonly value="${unitValue === '' ? '' : formatNumberInput(unitValue)}">
      </div>
    </div>
    <div class="vt-form__actions">
      ${launch ? '<button class="ui-btn ui-btn--ghost" type="button" data-action="cancel-edit">Cancelar</button>' : ''}
      ${canSubmit ? `<button class="ui-btn ui-btn--primary vt-submit" type="submit">${launch ? 'Salvar edição' : 'Lançar na vitrine'}</button>` : ''}
    </div>
  `;
}

function renderLaunchRows(launches) {
  if (!launches.length) {
    return '<p class="vt-empty">Nenhum lançamento no período.</p>';
  }

  const canEditLaunch = canCurrentUser('showcase.edit');

  return `
    <div class="vt-scroll">
      <table class="ui-table vt-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th class="r">Quantidade</th>
            <th class="r">Valor unitário</th>
            <th class="r">Total</th>
            <th>Data</th>
            <th>Usuário</th>
            <th>Status</th>
            ${canEditLaunch ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${launches.map((launch) => `
            <tr class="${launch.status === 'cancelado' ? 'is-canceled' : ''}">
              <td><b>${escapeHtml(launch.produtoNome)}</b></td>
              <td>${escapeHtml(launch.categoriaNome)}</td>
              <td class="r">${launch.quantidade} un.</td>
              <td class="r">${formatCurrency(launch.valorUnitario)}</td>
              <td class="r"><b class="stock-entry-total vt-total">${formatCurrency(launch.valorTotal)}</b></td>
              <td>${formatDate(launch.dataHora)}</td>
              <td>${escapeHtml(resolveStockLaunchUserName(launch))}</td>
              <td>${launch.status === 'cancelado' ? '<span class="ui-pill">Cancelado</span>' : '<span class="ui-pill ui-pill--ok">Lançado</span>'}</td>
              ${canEditLaunch ? `
                <td>
                  <div class="vt-actions">
                    <button class="ui-btn ui-btn--sm" type="button" data-action="edit-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Editar</button>
                    <button class="ui-btn ui-btn--loss ui-btn--sm" type="button" data-action="cancel-launch" data-launch-id="${launch.id}" ${launch.status === 'cancelado' ? 'disabled' : ''}>Cancelar</button>
                  </div>
                </td>
              ` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderStockStatus(quantity) {
  if (quantity <= 0) {
    return '<span class="ui-pill ui-pill--danger">Esgotado</span>';
  }

  if (quantity <= LOW_STOCK_LIMIT) {
    return `<span class="ui-pill ui-pill--warn">${quantity} ${quantity === 1 ? 'restante' : 'restantes'}</span>`;
  }

  return `<b class="vt-qty">${quantity} un.</b>`;
}

function renderLiveShowcase(liveSummary) {
  const rows = liveSummary.stockRows.filter((item) => (
    !estoqueState.categoryIds.length || estoqueState.categoryIds.includes(item.categoryId)
  ));
  const count = rows.length === 1 ? '1 produto' : `${rows.length} produtos`;
  let body;

  if (!liveSummary.stockRows.length) {
    body = '<p class="vt-empty">Sem estoque registrado na vitrine.</p>';
  } else if (!rows.length) {
    body = '<p class="vt-empty">Nenhum produto nas categorias escolhidas.</p>';
  } else {
    body = `
      <div class="vt-list">
        ${rows.map((item) => `
          <article class="vt-row${item.quantityAvailable <= 0 ? ' is-out' : ''}">
            <span class="ui-stripe" style="--c: ${escapeHtml(item.colorVar)}"></span>
            <div class="vt-row__main">
              <b>${escapeHtml(item.productName)}</b>
              <small>${escapeHtml(item.categoryName)}</small>
            </div>
            ${renderStockStatus(item.quantityAvailable)}
          </article>
        `).join('')}
      </div>
    `;
  }

  return `
    <section class="ui-panel vt-main">
      <div class="ui-head vt-panel-head">
        <h2 class="vt-panel-title">Estoque da vitrine</h2>
        <span>${count}</span>
        <div class="ui-head__actions">
          ${renderFilterDropdown('Categorias', 'category', getShowcaseCategories(), estoqueState.categoryIds)}
        </div>
      </div>
      ${body}
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
    return '<p class="vt-empty">Sem dados para comparar.</p>';
  }

  return `
    <div class="vt-scroll">
      <table class="ui-table vt-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th class="r">Produzido</th>
            <th class="r">Valor produzido</th>
            <th class="r">Vendido</th>
            <th class="r">Valor vendido</th>
            <th class="r">Sobra</th>
            <th class="r">Diferença</th>
            <th class="r">% vendido</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${comparison.map((item) => `
            <tr>
              <td><b>${escapeHtml(item.produtoNome)}</b></td>
              <td>${escapeHtml(item.categoriaNome)}</td>
              <td class="r">${item.quantidadeProduzida}</td>
              <td class="r">${formatCurrency(item.valorProduzido)}</td>
              <td class="r">${item.quantidadeVendida}</td>
              <td class="r">${formatCurrency(item.valorVendido)}</td>
              <td class="r">${item.sobraQuantidade}</td>
              <td class="r">${formatCurrency(item.diferencaValor)}</td>
              <td class="r">${item.percentualVendido}%</td>
              <td>
                ${canWriteOff ? `<button class="ui-btn ui-btn--loss ui-btn--sm" type="button" data-action="delete-comparison-row" data-product-id="${item.produtoId}">Apagar</button>` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderComparisonCounters(filters) {
  const comparison = getProductionSalesComparison(filters);
  const vitrine = comparison.reduce((total, item) => total + item.quantidadeProduzida, 0);
  const vendidos = comparison.reduce((total, item) => total + item.quantidadeVendida, 0);
  const sobras = comparison.reduce((total, item) => total + item.sobraQuantidade, 0);

  return `
    <div class="ui-head__actions vt-counters" aria-label="Resumo do comparativo">
      <span>Vitrine: <b>${vitrine}</b></span>
      <span>Vendidos: <b>${vendidos}</b></span>
      <span>Sobras: <b>${sobras}</b></span>
    </div>
  `;
}

function renderMovementHistory(movements) {
  const visibleLimit = estoqueState.movementHistoryExpanded ? 30 : 8;
  const visibleMovements = movements.slice(0, visibleLimit);

  if (!movements.length) {
    return `
      <section class="ui-panel">
        <h2 class="ui-head">
          Histórico da vitrine ${getPeriodLabel()}
          <span>0 movimentos</span>
        </h2>
        <p class="vt-empty">Sem movimentação no período.</p>
      </section>
    `;
  }

  return `
    <section class="ui-panel">
      <h2 class="ui-head">
        Histórico da vitrine ${getPeriodLabel()}
        <span>${movements.length === 1 ? '1 movimento' : `${movements.length} movimentos`}</span>
      </h2>
      <div class="vt-scroll">
        <table class="ui-table vt-table showcase-movement-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Tipo</th>
              <th class="r">Quantidade</th>
              <th class="r">Anterior</th>
              <th class="r">Novo</th>
              <th>Venda/comanda</th>
              <th>Usuário</th>
              <th>Horário</th>
            </tr>
          </thead>
          <tbody>
            ${visibleMovements.map((movement) => `
              <tr>
                <td><b>${escapeHtml(movement.productName)}</b></td>
                <td>${escapeHtml(formatMovementType(movement.movementType))}</td>
                <td class="r">${movement.quantity}</td>
                <td class="r">${movement.previousQuantity}</td>
                <td class="r">${movement.newQuantity}</td>
                <td>${escapeHtml(resolveShowcaseMovementCommandReference(movement))}</td>
                <td>${escapeHtml(resolveShowcaseMovementUserName(movement.userId))}</td>
                <td>${formatDate(movement.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
      ${movements.length > 8 ? `
        <div class="vt-more">
          <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-showcase-movements-more>
            ${estoqueState.movementHistoryExpanded ? 'Ver menos' : `Ver mais ${Math.min(movements.length - 8, 22)} movimento(s)`}
          </button>
        </div>
      ` : ''}
    </section>
  `;
}

function getShowcaseLiveSummary(filters) {
  const productIds = new Set([
    ...getShowcaseProducts().map((product) => product.id),
    ...getShowcaseStock().map((item) => item.productId)
  ]);
  const categories = getCategories();
  const stockRows = [...productIds]
    .map((productId) => {
      const product = getProductById(productId);
      const stock = getShowcaseStockByProductId(productId);
      const category = product ? categories.find((item) => item.id === product.categoryId) : null;

      return {
        productId,
        productName: product?.name || 'Produto removido',
        categoryId: product?.categoryId || '',
        categoryName: product ? getCategoryName(product.categoryId) : 'Sem categoria',
        // Cor calculada com a lista completa, a mesma das outras telas.
        colorVar: category ? getCategoryColorVar(category, categories) : 'var(--muted)',
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
    entrada_producao: 'Entrada de produção',
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
    ['month', 'Este mês'],
    ['year', 'Este ano'],
    ['all', 'Todo período'],
    ['custom', 'Período personalizado']
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
    return 'este mês';
  }

  if (estoqueState.period === 'year') {
    return 'este ano';
  }

  if (estoqueState.period === 'custom') {
    return 'no período selecionado';
  }

  return 'todo período';
}

function renderFilterDropdown(label, type, items, selectedIds) {
  const selectedText = getFilterLabel(label, items, selectedIds);

  return `
    <details class="vt-filter">
      <summary>${escapeHtml(selectedText)}</summary>
      <div class="vt-filter__menu">
        <div class="vt-filter__top">
          <b>${label}</b>
          <button type="button" data-clear-filter="${type}">Limpar</button>
        </div>
        ${items.map((item) => `
          <label class="vt-filter__option">
            <input
              type="checkbox"
              value="${escapeHtml(item.id)}"
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
    return label === 'Categorias' ? 'Todas as categorias' : `Todos os ${label.toLowerCase()}`;
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
