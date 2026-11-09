import {
  getCatalogSyncStatus,
  clearCatalogSyncQueue,
  getCategories,
  getProducts,
  loadCategories,
  loadProducts,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
  syncCatalogNow
} from '../../services/product.service.js?v=20260804-06';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-06';
import { on } from '../../services/event-bus.service.js?v=20260804-06';
import { formatCurrency } from '../../utils/currency.js?v=20260804-06';
import { showNotification } from '../../services/notification.service.js?v=20260804-06';
import { getBestSellingProducts } from '../../services/transaction.service.js?v=20260804-06';
import { getActiveOutOfStockSales, getShowcaseStockByProductId } from '../../services/showcase-stock.service.js?v=20260804-06';
import { adjustShowcaseStockOnline } from '../../services/showcase-sync.service.js?v=20260804-06';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-06';
import { hasPermission } from '../../services/permission.service.js?v=20260804-06';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { recordAudit } from '../../services/audit.service.js?v=20260804-06';
import { getCategoryColorVar } from '../../utils/category-colors.js?v=20260807-21';

const productState = {
  modal: null,
  editingProductId: null,
  editingCategoryId: null,
  deletingProductId: null,
  deletingCategoryId: null,
  query: '',
  categoryFilter: 'todos',
  statusFilter: 'todos',
  bestSellerPeriod: 'today',
  bestSellerCustomStart: '',
  bestSellerCustomEnd: '',
  bestSellerCategoryFilter: 'todos',
  loading: false,
  error: '',
  syncStatus: { state: 'idle', pending: 0 }
};
const boundContainers = new WeakSet();

export function initProdutosModule(container) {
  productState.modal = null;
  productState.editingProductId = null;
  productState.editingCategoryId = null;
  productState.deletingProductId = null;
  productState.deletingCategoryId = null;
  productState.loading = true;
  productState.error = '';
  renderProdutosScreen(container);
  loadProductCatalog(container);

  if (!boundContainers.has(container)) {
    bindProdutosEvents(container);
    // O container de trabalho e compartilhado por todas as telas: so redesenha
    // se Produtos ainda for a tela aberta (senao cobriria a Frente de caixa).
    on(UI_EVENTS.productCatalogChanged, () => renderIfProdutosActive(container));
    on(UI_EVENTS.showcaseStockChanged, () => renderIfProdutosActive(container));
    on(UI_EVENTS.productSyncStatusChanged, (status) => {
      productState.syncStatus = status;
      renderIfProdutosActive(container);
    });
    boundContainers.add(container);
  }
}

function getCategoriesById() {
  return new Map(getVisibleCategories().map((category) => [category.id, category]));
}

function isProductInShowcase(product, categoriesById = getCategoriesById()) {
  const category = categoriesById.get(product.categoryId);
  return Boolean(product.active && category?.showInShowcase);
}

function getProductDashboardMetrics() {
  const products = getProducts();
  const categories = getVisibleCategories();
  const categoriesById = getCategoriesById();
  const activeProducts = products.filter((product) => product.active !== false);
  const showcaseProducts = products.filter((product) => isProductInShowcase(product, categoriesById));
  const selectedRanking = getFilteredBestSellers();
  const todayRanking = getBestSellingProducts({ period: 'today' });

  return {
    products,
    categories,
    categoriesById,
    activeProducts,
    showcaseProducts,
    topProduct: selectedRanking[0] || null,
    todayRanking
  };
}

function getProductAlerts(metrics = getProductDashboardMetrics()) {
  const alerts = [
    {
      key: 'without-price',
      count: metrics.products.filter((product) => Number(product.price) <= 0).length,
      label: 'Sem preço',
      tone: 'danger'
    },
    {
      key: 'out-showcase',
      count: metrics.activeProducts.filter((product) => !isProductInShowcase(product, metrics.categoriesById)).length,
      label: 'Fora da vitrine',
      tone: 'warning'
    },
    {
      key: 'zero-stock',
      count: metrics.activeProducts.filter((product) => getShowcaseStockByProductId(product.id).quantityAvailable <= 0).length,
      label: 'Estoque zerado',
      tone: 'danger'
    },
    {
      key: 'inactive',
      count: metrics.products.filter((product) => product.active === false).length,
      label: 'Inativos',
      tone: 'muted'
    },
    {
      key: 'without-category',
      count: metrics.products.filter((product) => !metrics.categoriesById.has(product.categoryId)).length,
      label: 'Sem categoria',
      tone: 'warning'
    },
    {
      key: 'today-best',
      count: metrics.todayRanking.length,
      label: 'Vendidos hoje',
      tone: 'success'
    },
    {
      key: 'sold-without-stock',
      count: getActiveOutOfStockSales().reduce((total, sale) => total + (Number(sale.quantity) || 0), 0),
      label: 'Vendidos sem estoque',
      tone: 'danger'
    },
    {
      key: 'showcase',
      count: metrics.showcaseProducts.length,
      label: 'Na vitrine',
      tone: 'info'
    }
  ];

  return alerts.filter((alert) => alert.count > 0);
}

function renderProdutosScreen(container) {
  const metrics = getProductDashboardMetrics();
  const canManageProducts = canCurrentUser('products.manage');
  const canManageCategories = canCurrentUser('categories.manage');

  const filteredCount = getFilteredProducts().length;

  container.innerHTML = `
    <section class="ui-screen pd" data-produtos-screen>
      <header class="ui-head pd-head">
        <div class="pd-head__title">
          <h1 class="pd-title">Produtos</h1>
          <p class="pd-sub">Categorias, produtos, preços e o que aparece na vitrine.</p>
        </div>
        <div class="ui-head__actions">
          ${canManageCategories ? '<button class="ui-btn" type="button" data-action="new-category">Nova categoria</button>' : ''}
          ${canManageProducts ? '<button class="ui-btn ui-btn--primary" type="button" data-action="new-product">Novo produto</button>' : ''}
        </div>
      </header>

      ${renderSyncStatus()}
      ${productState.loading ? '<p class="pd-empty">Carregando produtos e categorias...</p>' : ''}
      ${productState.error ? `<div class="form-error pd-error">${escapeHtml(productState.error)}</div>` : ''}
      ${renderProductSummaryCards(metrics)}
      ${renderProductAlerts(metrics)}

      <section class="ui-panel">
        <h2 class="ui-head">
          Categorias
          <span>${metrics.categories.length} ${metrics.categories.length === 1 ? 'categoria organiza' : 'categorias organizam'} as abas do caixa e da vitrine</span>
        </h2>
        <div class="pd-cats">
          ${renderCategoryRows()}
        </div>
      </section>

      <section class="ui-panel">
        <div class="ui-head pd-panel-head">
          <h2 class="pd-panel-title">Produtos cadastrados</h2>
          <span>${filteredCount} ${filteredCount === 1 ? 'produto' : 'produtos'}</span>
          ${renderProductFilters()}
        </div>
        ${renderProductRows()}
      </section>

      <section class="ui-panel">
        <h2 class="ui-head">
          Mais vendidos
          <span>${renderBestSellerSummary()}</span>
        </h2>
        ${renderBestSellerFilters()}
        ${renderBestSellers()}
      </section>

      ${productState.modal === 'product' ? renderProductModal() : ''}
      ${productState.modal === 'category' ? renderCategoryModal() : ''}
      ${productState.deletingProductId || productState.deletingCategoryId ? renderDeleteConfirmation() : ''}
    </section>
  `;
}

async function loadProductCatalog(container) {
  try {
    productState.loading = true;
    productState.error = '';
    renderProdutosScreen(container);
    await Promise.all([loadCategories(), loadProducts()]);
    productState.syncStatus = getCatalogSyncStatus();
  } catch (error) {
    productState.error = error.message || 'Não foi possível carregar produtos e categorias.';
  } finally {
    productState.loading = false;
    renderIfProdutosActive(container);
  }
}

function isProdutosScreenActive(container) {
  if (typeof container?.querySelector === 'function') {
    return Boolean(container.querySelector('[data-produtos-screen]'));
  }
  return String(container?.innerHTML || '').includes('data-produtos-screen');
}

function renderIfProdutosActive(container) {
  if (isProdutosScreenActive(container)) {
    renderProdutosScreen(container);
  }
}

function renderSyncStatus() {
  const status = productState.syncStatus || getCatalogSyncStatus();
  const syncError = getCatalogSyncError(status);
  const labels = {
    idle: 'Preparando sincronização',
    local: 'Modo local',
    synced: 'Sincronizado',
    syncing: 'Sincronizando...',
    cache: 'Usando cache',
    pending: `${status.pending || 0} alteração(ões) pendente(s)`,
    error: 'Erro ao sincronizar'
  };

  return `
    <div class="pd-sync" data-sync-state="${escapeHtml(status.state)}">
      <div class="pd-sync__details">
        <span class="pd-sync__label">${labels[status.state] || 'Sincronização'}</span>
        ${syncError ? `<small class="sync-status__error">${escapeHtml(syncError)}</small>` : ''}
      </div>
      <div class="pd-sync__actions">
        ${status.pending ? '<button class="ui-btn ui-btn--sm" type="button" data-action="sync-catalog">Sincronizar</button>' : ''}
        ${status.pending ? '<button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-action="clear-sync-queue">Limpar fila</button>' : ''}
      </div>
    </div>
  `;
}

function getCatalogSyncError(status = productState.syncStatus || getCatalogSyncStatus()) {
  return status?.products?.error
    || status?.error
    || status?.categories?.error
    || '';
}

function bindProdutosEvents(container) {
  container.addEventListener('input', (event) => {
    if (event.target.matches('[data-products-filter]')) {
      productState.query = event.target.value;
      renderProdutosScreen(container);
      restoreSearchFocus(container);
    }
  });

  container.addEventListener('change', (event) => {
    if (event.target.matches('[data-category-filter]')) {
      productState.categoryFilter = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-status-filter]')) {
      productState.statusFilter = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-best-seller-category-filter]')) {
      productState.bestSellerCategoryFilter = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-best-seller-period-filter]')) {
      productState.bestSellerPeriod = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-best-seller-custom-start]')) {
      productState.bestSellerCustomStart = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-best-seller-custom-end]')) {
      productState.bestSellerCustomEnd = event.target.value;
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-product-category-select]')) {
      const modal = event.target.closest('.modal');
      modal.querySelector('[data-new-category]').hidden = event.target.value !== '__new__';
    }
  });

  container.addEventListener('submit', async (event) => {
    if (event.target.matches('[data-product-form]')) {
      event.preventDefault();
      try {
        await saveProductFromForm(event.target);
        renderCatalogFromLocalState(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }

    if (event.target.matches('[data-category-form]')) {
      event.preventDefault();
      try {
        await saveCategoryFromForm(event.target);
        renderCatalogFromLocalState(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }
  });

  container.addEventListener('click', async (event) => {
    closeRowMenus(container, event.target);
    const actionButton = event.target.closest('[data-action]');

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === 'new-product') openProductModal(container);
    if (action === 'edit-product') openProductModal(container, actionButton.dataset.productId);
    if (action === 'delete-product') {
      openDeleteConfirmation(container, 'product', actionButton.dataset.productId);
      return;
    }

    if (action === 'confirm-delete-product') {
      try {
        await removeProduct(productState.deletingProductId);
        productState.deletingProductId = null;
        renderCatalogFromLocalState(container);
      } catch (error) {
        handleProductActionError(error);
      }
      return;
    }

    if (action === 'new-category') openCategoryModal(container);
    if (action === 'edit-category') openCategoryModal(container, actionButton.dataset.categoryId);
    if (action === 'delete-category') {
      openDeleteConfirmation(container, 'category', actionButton.dataset.categoryId);
      return;
    }

    if (action === 'confirm-delete-category') {
      try {
        await removeCategory(productState.deletingCategoryId);
        productState.deletingCategoryId = null;
        renderCatalogFromLocalState(container);
      } catch (error) {
        handleProductActionError(error);
      }
      return;
    }

    if (action === 'cancel-delete-catalog') {
      productState.deletingProductId = null;
      productState.deletingCategoryId = null;
      renderProdutosScreen(container);
      return;
    }

    if (action === 'sync-catalog') {
      await syncCatalogNow();
      await loadProductCatalog(container);
      const nextStatus = productState.syncStatus || getCatalogSyncStatus();
      const syncError = getCatalogSyncError(nextStatus);

      if (nextStatus.pending) {
        showNotification({
          title: 'Sincronização pendente',
          message: syncError || 'O Supabase recusou a sincronização. Tente novamente.',
          type: 'danger'
        });
      } else {
        showNotification({
          title: 'Catálogo sincronizado',
          message: 'Todas as alterações foram enviadas ao Supabase.',
          type: 'success'
        });
      }
    }

    if (action === 'clear-sync-queue') {
      await clearCatalogSyncQueue();
      await loadProductCatalog(container);
      showNotification('Pendências locais descartadas.', 'success');
    }

    if (action === 'close-modal') {
      closeModal();
      renderProdutosScreen(container);
    }

  });
}

// A tela inteira e redesenhada a cada tecla; devolve o foco (e o cursor) ao campo de busca.
function restoreSearchFocus(container) {
  const search = container.querySelector?.('[data-products-filter]');

  if (!search) {
    return;
  }

  search.focus();
  const end = search.value.length;
  search.setSelectionRange?.(end, end);
}

// Fecha o menu "..." de qualquer linha quando o clique cai fora dele.
function closeRowMenus(container, target) {
  const openMenus = container.querySelectorAll?.('.pd-menu[open]');

  if (!openMenus) {
    return;
  }

  const ownMenu = target?.closest?.('.pd-menu') || null;
  openMenus.forEach((menu) => {
    if (menu !== ownMenu) {
      menu.removeAttribute('open');
    }
  });
}

function openProductModal(container, productId = null) {
  productState.modal = 'product';
  productState.editingProductId = productId;
  renderProdutosScreen(container);
}

function renderCatalogFromLocalState(container) {
  productState.syncStatus = getCatalogSyncStatus();
  renderProdutosScreen(container);
}

function openCategoryModal(container, categoryId = null) {
  productState.modal = 'category';
  productState.editingCategoryId = categoryId;
  renderProdutosScreen(container);
}

function closeModal() {
  productState.modal = null;
  productState.editingProductId = null;
  productState.editingCategoryId = null;
}

function openDeleteConfirmation(container, type, id) {
  const isProduct = type === 'product';
  const item = isProduct
    ? getProducts().find((product) => product.id === id)
    : getCategories().find((category) => category.id === id);

  if (!item) {
    handleProductActionError(new Error('Registro não encontrado. Atualize o catálogo e tente novamente.'));
    return;
  }

  productState.deletingProductId = isProduct ? id : null;
  productState.deletingCategoryId = isProduct ? null : id;
  renderProdutosScreen(container);
}

function renderDeleteConfirmation() {
  const isProduct = Boolean(productState.deletingProductId);
  const item = isProduct
    ? getProducts().find((product) => product.id === productState.deletingProductId)
    : getCategories().find((category) => category.id === productState.deletingCategoryId);

  if (!item) {
    return '';
  }

  const typeLabel = isProduct ? 'produto' : 'categoria';
  const confirmAction = isProduct ? 'confirm-delete-product' : 'confirm-delete-category';

  return `
    <div class="modal-backdrop is-open" data-delete-catalog-modal>
      <div class="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="delete-catalog-title">
        <header class="modal__header">
          <h2 id="delete-catalog-title">Apagar ${typeLabel}</h2>
        </header>
        <div class="modal__body">
          <p>Esta ação não pode ser desfeita. Confirma apagar <strong>${escapeHtml(item.name)}</strong>?</p>
          <div class="form-actions">
            <button class="button button--ghost" type="button" data-action="cancel-delete-catalog">Cancelar</button>
            <button class="button button--danger" type="button" data-action="${confirmAction}">Confirmar exclusão</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function saveProductFromForm(form) {
  const formData = new FormData(form);
  const selectedCategory = formData.get('categoryId');
  const newCategoryName = String(formData.get('newCategoryName') || '').trim();
  const currentProduct = productState.editingProductId
    ? getProducts().find((product) => product.id === productState.editingProductId)
    : null;

  if (selectedCategory === '__new__' && !newCategoryName) {
    showNotification({
      title: 'Categoria obrigatória',
      message: 'Informe o nome da nova categoria.',
      type: 'danger'
    });
    return;
  }

  const categoryId = selectedCategory === '__new__'
    ? (await saveCategory({ name: newCategoryName, showInShowcase: true })).id
    : selectedCategory;
  const productData = {
    ...(currentProduct || {}),
    name: formData.get('name'),
    categoryId,
    price: formData.get('price'),
    cost: currentProduct?.cost || 0,
    stock: Math.max(0, Number(formData.get('stock')) || 0),
    // Checkbox desmarcado nao vai no envio: o campo oculto indica que o controle existe.
    active: formData.has('activeField') ? formData.get('active') === 'on' : currentProduct?.active !== false
  };

  if (productState.editingProductId) {
    productData.id = productState.editingProductId;
  }

  const previousShowcaseStock = productState.editingProductId
    ? Number(getShowcaseStockByProductId(productState.editingProductId).quantityAvailable || 0)
    : 0;
  // Na edicao vale a diferenca digitada sobre o saldo de quando o formulario
  // abriu: uma venda feita em outro aparelho nesse meio-tempo nao e desfeita.
  if (productState.editingProductId && formData.has('stockBase')) {
    const typedDelta = productData.stock - (Number(formData.get('stockBase')) || 0);
    productData.stock = Math.max(0, previousShowcaseStock + typedDelta);
  }
  const savedProduct = await saveProduct(productData);
  const nextStock = Number(savedProduct.stock || 0);

  if (previousShowcaseStock !== nextStock) {
    const user = getCurrentUser();
    await adjustShowcaseStockOnline({
      operationId: `product-stock-${savedProduct.id}-${Date.now()}`,
      productId: savedProduct.id,
      quantityAvailable: nextStock,
      reason: currentProduct ? 'edicao-produto' : 'cadastro-produto',
      note: `Estoque informado no cadastro de produto: ${nextStock}`,
      userId: user?.id || '',
      createdAt: new Date().toISOString()
    });
  }

  if (previousShowcaseStock !== nextStock) {
    recordAudit({
      action: 'product.stock.adjust',
      entityType: 'product',
      entityId: savedProduct.id,
      metadata: {
        module: 'Vitrine/Estoque',
        details: `Ajustou manualmente o estoque de ${previousShowcaseStock} para ${nextStock}`,
        productId: savedProduct.id,
        productName: savedProduct.name,
        previousStock: previousShowcaseStock,
        newStock: nextStock,
        difference: nextStock - previousShowcaseStock
      }
    });
  }

  closeModal();
  showNotification({
    title: currentProduct ? 'Produto atualizado' : 'Produto salvo',
    message: currentProduct
      ? `Produto e estoque atualizados. Estoque atual: ${savedProduct.stock}.`
      : 'Produto registrado com sucesso.',
    type: 'success'
  });
}

async function saveCategoryFromForm(form) {
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const showInShowcase = formData.get('showInShowcase') === 'on';

  if (!name) {
    showNotification({
      title: 'Categoria obrigatória',
      message: 'Informe o nome da categoria.',
      type: 'danger'
    });
    return;
  }

  await saveCategory({
    id: productState.editingCategoryId,
    name,
    showInShowcase
  });
  closeModal();
  showNotification({ title: 'Categoria salva', message: 'Categoria registrada com sucesso.', type: 'success' });
}

function handleProductActionError(error) {
  showNotification({
    title: 'Ação não permitida',
    message: error.message || 'Não foi possível concluir a ação.',
    type: 'danger'
  });
}

function canCurrentUser(permissionId) {
  return hasPermission(getCurrentUser(), permissionId);
}

function renderProductSummaryCards(metrics = getProductDashboardMetrics()) {
  const summaryCards = [
    {
      label: 'Total de produtos',
      value: metrics.products.length,
      detail: 'Cadastrados'
    },
    {
      label: 'Total de categorias',
      value: metrics.categories.length,
      detail: 'Abas do catálogo'
    },
    {
      label: 'Produtos ativos',
      value: metrics.activeProducts.length,
      detail: 'Liberados para venda'
    },
    {
      label: 'Produtos que aparecem na vitrine',
      value: metrics.showcaseProducts.length,
      detail: 'Visíveis ao cliente'
    },
    {
      label: 'Produto mais vendido',
      value: metrics.topProduct?.name || 'Sem vendas',
      detail: metrics.topProduct ? `${metrics.topProduct.quantity} vendidos` : 'Sem ranking no período'
    }
  ];

  return `
    <section class="ui-stats pd-stats" style="--n:${summaryCards.length}" aria-label="Resumo de produtos">
      ${summaryCards.map((card) => `
        <div class="ui-stat">
          <small>${card.label}</small>
          <b>${escapeHtml(card.value)}</b>
          <em>${card.detail}</em>
        </div>
      `).join('')}
    </section>
  `;
}

const ALERT_PILL_CLASS = {
  danger: ' ui-pill--danger',
  warning: ' ui-pill--warn',
  success: ' ui-pill--ok',
  info: '',
  muted: ''
};

function renderProductAlerts(metrics = getProductDashboardMetrics()) {
  const alerts = getProductAlerts(metrics);

  if (!alerts.length) {
    return '';
  }

  return `
    <section class="pd-alerts" aria-label="Alertas de produtos">
      ${alerts.map((alert) => `
        <span class="ui-pill${ALERT_PILL_CLASS[alert.tone] || ''}" data-alert-key="${alert.key}">
          <b>${alert.count}</b>&nbsp;${alert.label}
        </span>
      `).join('')}
    </section>
  `;
}

function renderProductFilters() {
  return `
    <div class="ui-head__actions pd-filters">
      <input class="ui-input" type="search" placeholder="Buscar produto" aria-label="Buscar produto" value="${escapeHtml(productState.query)}" data-products-filter>
      <select class="ui-input" aria-label="Categoria" data-category-filter>
        <option value="todos" ${productState.categoryFilter === 'todos' ? 'selected' : ''}>Todas as categorias</option>
        ${getVisibleCategories().map((category) => `
          <option value="${escapeHtml(category.id)}" ${productState.categoryFilter === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
        `).join('')}
      </select>
      <select class="ui-input" aria-label="Status" data-status-filter>
        <option value="todos" ${productState.statusFilter === 'todos' ? 'selected' : ''}>Todos os status</option>
        <option value="active" ${productState.statusFilter === 'active' ? 'selected' : ''}>Ativos</option>
        <option value="inactive" ${productState.statusFilter === 'inactive' ? 'selected' : ''}>Inativos</option>
        <option value="showcase" ${productState.statusFilter === 'showcase' ? 'selected' : ''}>Na vitrine</option>
        <option value="out-showcase" ${productState.statusFilter === 'out-showcase' ? 'selected' : ''}>Fora da vitrine</option>
      </select>
    </div>
  `;
}

function renderBestSellerFilters() {
  return `
    <div class="pd-filters pd-filters--bs">
      <select class="ui-input" aria-label="Período" data-best-seller-period-filter>
        ${renderBestSellerPeriodOptions()}
      </select>
      <select class="ui-input" aria-label="Categoria" data-best-seller-category-filter>
        <option value="todos" ${productState.bestSellerCategoryFilter === 'todos' ? 'selected' : ''}>Todas as categorias</option>
        ${getVisibleCategories().map((category) => `
          <option value="${escapeHtml(category.id)}" ${productState.bestSellerCategoryFilter === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
        `).join('')}
      </select>
      ${productState.bestSellerPeriod === 'custom' ? `
        <input class="ui-input" type="date" value="${escapeHtml(productState.bestSellerCustomStart)}" data-best-seller-custom-start aria-label="Data inicial">
        <input class="ui-input" type="date" value="${escapeHtml(productState.bestSellerCustomEnd)}" data-best-seller-custom-end aria-label="Data final">
      ` : ''}
    </div>
  `;
}

function renderCategoryRows() {
  const categories = getVisibleCategories();
  const allCategories = getCategories();
  const canManageCategories = canCurrentUser('categories.manage');

  if (!categories.length) {
    return '<p class="pd-empty">Nenhuma categoria cadastrada no banco.</p>';
  }

  return categories.map((category) => {
    const productCount = getProducts().filter((product) => product.categoryId === category.id).length;
    const activeClass = productState.categoryFilter === category.id ? ' is-active' : '';
    const showcaseStatus = category.showInShowcase ? 'Aparece na vitrine' : 'Oculta';

    return `
      <article class="pd-cat${activeClass}" style="--c: ${escapeHtml(getCategoryColorVar(category, allCategories))}">
        <div class="pd-cat__body">
          <b>${escapeHtml(category.name)}</b>
          <span>${productCount} ${productCount === 1 ? 'produto' : 'produtos'}</span>
          <span>${showcaseStatus}</span>
        </div>
        ${canManageCategories ? `<div class="pd-cat__actions">
          <button class="ui-btn ui-btn--sm" type="button" data-action="edit-category" data-category-id="${escapeHtml(category.id)}">Editar</button>
          <button class="ui-btn ui-btn--loss ui-btn--sm" type="button" data-action="delete-category" data-category-id="${escapeHtml(category.id)}">Apagar</button>
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function renderProductRows() {
  const products = getFilteredProducts();
  const categoriesById = getCategoriesById();
  const allCategories = getCategories();
  const canManageProducts = canCurrentUser('products.manage');

  if (!products.length) {
    return '<p class="pd-empty">Nenhum produto encontrado com os filtros atuais.</p>';
  }

  return `
    <div class="pd-scroll">
      <table class="ui-table pd-table">
        <thead>
          <tr>
            <th>Produto</th>
            <th>Categoria</th>
            <th class="r">Preço</th>
            <th class="r">Estoque</th>
            <th>Status</th>
            <th>Vitrine</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const category = categoriesById.get(product.categoryId);
            const isActive = product.active !== false;
            const inShowcase = isProductInShowcase(product, categoriesById);
            const stock = Number(getShowcaseStockByProductId(product.id).quantityAvailable) || 0;
            const colorVar = category ? getCategoryColorVar(category, allCategories) : 'var(--muted)';
            const productId = escapeHtml(product.id);

            return `
              <tr>
                <td><span class="ui-stripe" style="--c: ${escapeHtml(colorVar)}"></span><b>${escapeHtml(product.name)}</b></td>
                <td class="pd-muted">${escapeHtml(category ? category.name : 'Sem categoria')}</td>
                <td class="r"><b>${formatCurrency(product.price)}</b></td>
                <td class="r pd-stock${stock <= 0 ? ' is-minus' : ''}" data-product-stock>${stock}</td>
                <td>${isActive ? '<span class="ui-pill ui-pill--ok">Ativo</span>' : '<span class="ui-pill">Inativo</span>'}</td>
                <td>${inShowcase ? '<span class="ui-pill ui-pill--ok">Aparece</span>' : '<span class="ui-pill">Oculto</span>'}</td>
                <td class="r">${canManageProducts ? `<div class="pd-actions">
                  <button class="ui-btn ui-btn--sm" type="button" data-action="edit-product" data-product-id="${productId}">Editar</button>
                  <details class="pd-menu">
                    <summary class="ui-btn ui-btn--ghost ui-btn--sm" aria-label="Mais ações de ${escapeHtml(product.name)}">&#8943;</summary>
                    <div class="pd-menu__list">
                      <button class="ui-btn ui-btn--loss ui-btn--sm" type="button" data-action="delete-product" data-product-id="${productId}">Apagar</button>
                    </div>
                  </details>
                </div>` : ''}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductModal() {
  const product = productState.editingProductId
    ? getProducts().find((item) => item.id === productState.editingProductId)
    : null;
  const title = product ? 'Editar produto' : 'Novo produto';
  const selectedCategory = product ? product.categoryId : '__new__';
  const canManageCategories = canCurrentUser('categories.manage');

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small product-quick-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <header class="modal__header">
          <h2 id="product-modal-title">${title}</h2>
        </header>

        <form class="product-form" data-product-form>
          <label class="stacked-label">
            Nome do produto
            <input class="field" name="name" required placeholder="Ex.: X-Frango" value="${escapeHtml(product ? product.name : '')}">
          </label>

          <label class="stacked-label">
            Categoria
            <select class="field" name="categoryId" data-product-category-select required>
              ${canManageCategories ? `<option value="__new__" ${selectedCategory === '__new__' ? 'selected' : ''}>+ Criar nova categoria</option>` : ''}
              ${getCategoryOptions(selectedCategory)}
            </select>
          </label>

          <div data-new-category ${canManageCategories && selectedCategory === '__new__' ? '' : 'hidden'}>
            <label class="stacked-label">
              Nova categoria
              <input class="field" name="newCategoryName" placeholder="Ex.: Combos">
            </label>
          </div>

          <label class="stacked-label">
            Preço de venda
            <input class="field" name="price" type="number" min="0" step="0.01" required placeholder="0,00" value="${product ? product.price : ''}">
          </label>

          <label class="stacked-label">
            Estoque atual
            <input class="field" name="stock" type="number" min="0" step="1" required placeholder="0" value="${product ? getShowcaseStockByProductId(product.id).quantityAvailable : 0}">
            <small>Informe 0 para zerar ou uma quantidade menor para retirar unidades.</small>
          </label>
          ${product ? `<input type="hidden" name="stockBase" value="${Number(getShowcaseStockByProductId(product.id).quantityAvailable) || 0}">` : ''}

          <label class="stacked-label product-active-toggle">
            <input type="hidden" name="activeField" value="1">
            <span><input type="checkbox" name="active" ${product?.active === false ? '' : 'checked'}> Ativo (aparece na frente de caixa)</span>
            <small>Desmarque para tirar o produto de venda sem apagar o histórico.</small>
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

function renderCategoryModal() {
  const category = productState.editingCategoryId
    ? getCategories().find((item) => item.id === productState.editingCategoryId)
    : null;
  const title = category ? 'Editar categoria' : 'Nova categoria';
  const submitLabel = category ? 'Atualizar categoria' : 'Salvar categoria';

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <header class="modal__header">
          <h2 id="category-modal-title">${title}</h2>
          <button class="icon-button" type="button" data-action="close-modal" title="Fechar" aria-label="Fechar">X</button>
        </header>

        <form class="product-form" data-category-form>
          <label class="stacked-label">
            Nome da categoria
            <input class="field" name="name" required placeholder="Ex: Salgados" value="${escapeHtml(category ? category.name : '')}">
          </label>
          <label class="checkbox-field category-visibility-toggle">
            <input type="checkbox" name="showInShowcase" ${category?.showInShowcase !== false ? 'checked' : ''}>
            Aparecer para lançar na vitrine
          </label>
          <div class="form-actions">
            <button class="button" type="submit">${submitLabel}</button>
            <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function getCategoryOptions(selectedCategoryId = '') {
  return getVisibleCategories()
    .map((category) => `
      <option value="${category.id}" ${category.id === selectedCategoryId ? 'selected' : ''}>
        ${escapeHtml(category.name)}
      </option>
    `)
    .join('');
}

function getVisibleCategories() {
  return getCategories().filter((category) => category.id !== 'todos');
}

function getFilteredProducts() {
  const normalizedQuery = productState.query.trim().toLowerCase();
  const categoriesById = getCategoriesById();

  return getProducts().filter((product) => {
    const matchesQuery = !normalizedQuery || product.name.toLowerCase().includes(normalizedQuery);
    const matchesCategory = productState.categoryFilter === 'todos' || product.categoryId === productState.categoryFilter;
    const matchesStatus = (
      productState.statusFilter === 'todos'
        || (productState.statusFilter === 'active' && product.active !== false)
        || (productState.statusFilter === 'inactive' && product.active === false)
        || (productState.statusFilter === 'showcase' && isProductInShowcase(product, categoriesById))
        || (productState.statusFilter === 'out-showcase' && !isProductInShowcase(product, categoriesById))
    );

    return matchesQuery && matchesCategory && matchesStatus;
  });
}

function renderBestSellers() {
  const bestSellers = getFilteredBestSellers();

  if (!bestSellers.length) {
    return '<p class="pd-empty">Nenhuma venda no período.</p>';
  }

  const mostSold = bestSellers.slice(0, 6);
  const leastSold = [...bestSellers]
    .sort((a, b) => {
      if (a.quantity !== b.quantity) {
        return a.quantity - b.quantity;
      }

      return a.revenue - b.revenue;
    })
    .slice(0, 6);

  return `
    <div class="pd-rank-grid">
      ${renderBestSellerRanking('Mais vendidos', mostSold)}
      ${renderBestSellerRanking('Menos vendidos', leastSold)}
    </div>
  `;
}

function renderBestSellerRanking(title, rows) {
  const maxQuantity = Math.max(...rows.map((item) => item.quantity), 1);

  return `
    <section class="pd-rank">
      <h3 class="pd-rank__title">${title} <span>${rows.length} ${rows.length === 1 ? 'produto' : 'produtos'}</span></h3>
      <div class="pd-rank__list">
        ${rows.map((item, index) => {
          const percent = Math.max((item.quantity / maxQuantity) * 100, 8);
          return `
            <article class="pd-rank__row">
              <div class="pd-rank__info">
                <b>${index + 1}. ${escapeHtml(item.name)}</b>
                <span>${item.quantity} vendidos - ${formatCurrency(item.revenue)}</span>
              </div>
              <div class="pd-rank__track" aria-label="${escapeHtml(item.name)}: ${item.quantity}">
                <i style="width: ${percent}%"></i>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function getFilteredBestSellers() {
  return getBestSellingProducts({
    categoryId: productState.bestSellerCategoryFilter,
    period: productState.bestSellerPeriod,
    customStart: productState.bestSellerCustomStart,
    customEnd: productState.bestSellerCustomEnd
  });
}

function renderBestSellerSummary() {
  const bestSellers = getFilteredBestSellers();

  if (!bestSellers.length) {
    return 'Sem vendas';
  }

  const totalQuantity = bestSellers.reduce((total, item) => total + item.quantity, 0);
  const totalRevenue = bestSellers.reduce((total, item) => total + item.revenue, 0);

  return `${totalQuantity} vendidos - ${formatCurrency(totalRevenue)}`;
}

function renderBestSellerPeriodOptions() {
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['last7', '7 dias'],
    ['last30', '30 dias'],
    ['month', 'Este mês'],
    ['year', 'Este ano'],
    ['all', 'Todo o período'],
    ['custom', 'Personalizado']
  ];

  return options.map(([value, label]) => `
    <option value="${value}" ${productState.bestSellerPeriod === value ? 'selected' : ''}>${label}</option>
  `).join('');
}
