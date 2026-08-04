import {
  getCatalogSyncStatus,
  getCategories,
  getProducts,
  loadCategories,
  loadProducts,
  removeCategory,
  removeProduct,
  saveCategory,
  saveProduct,
  syncCatalogNow
} from '../../services/product.service.js?v=20260804-02';
import { UI_EVENTS } from '../../database/schema.js?v=20260804-02';
import { on } from '../../services/event-bus.service.js?v=20260804-02';
import { formatCurrency } from '../../utils/currency.js?v=20260804-02';
import { showNotification } from '../../services/notification.service.js?v=20260804-02';
import { getBestSellingProducts } from '../../services/transaction.service.js?v=20260804-02';
import { getActiveOutOfStockSales, getShowcaseStockByProductId } from '../../services/showcase-stock.service.js?v=20260804-02';
import { adjustShowcaseStockOnline } from '../../services/showcase-sync.service.js?v=20260804-02';
import { getCurrentUser } from '../../services/auth.service.js?v=20260804-02';
import { hasPermission } from '../../services/permission.service.js?v=20260804-02';
import { escapeHtml } from '../../utils/dom.js?v=20260804-02';
import { recordAudit } from '../../services/audit.service.js?v=20260804-02';

const productState = {
  modal: null,
  editingProductId: null,
  editingCategoryId: null,
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
  productState.loading = true;
  productState.error = '';
  renderProdutosScreen(container);
  loadProductCatalog(container);

  if (!boundContainers.has(container)) {
    bindProdutosEvents(container);
    on(UI_EVENTS.productCatalogChanged, () => renderProdutosScreen(container));
    on(UI_EVENTS.productSyncStatusChanged, (status) => {
      productState.syncStatus = status;
      renderProdutosScreen(container);
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
      label: 'Sem preco',
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
      count: metrics.activeProducts.filter((product) => Number(product.stock) <= 0).length,
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

  container.innerHTML = `
    <section class="module-screen products-module products-dashboard">
      <header class="products-hero">
        <div>
          <span class="products-hero__eyebrow">Catalogo</span>
          <h1 class="pdv-title">Produtos</h1>
          <p class="module-subtitle">Gerencie categorias, produtos, precos e exibicao na vitrine.</p>
        </div>
        <div class="header-actions">
          ${canManageCategories ? '<button class="button button--ghost" type="button" data-action="new-category">+ Nova categoria</button>' : ''}
          ${canManageProducts ? '<button class="button" type="button" data-action="new-product">+ Novo produto</button>' : ''}
        </div>
      </header>

      ${renderSyncStatus()}
      ${productState.loading ? '<div class="empty-products">Carregando produtos e categorias...</div>' : ''}
      ${productState.error ? `<div class="form-error">${productState.error}</div>` : ''}
      ${renderProductSummaryCards(metrics)}
      ${renderProductAlerts(metrics)}

      <section class="manager-section products-section">
        <header class="products-section__header">
          <strong>Categorias / Abas</strong>
          <span>${metrics.categories.length} categorias organizam as abas do caixa e da vitrine.</span>
        </header>
        <div class="category-card-grid">
          ${renderCategoryRows()}
        </div>
      </section>

      <section class="manager-section products-section">
        <header class="products-section__header">
          <strong>Produtos cadastrados</strong>
          <span>${getFilteredProducts().length} produtos encontrados pelos filtros atuais.</span>
        </header>
        ${renderProductFilters()}
        <div class="product-card-grid">
          ${renderProductRows()}
        </div>
      </section>

      <section class="manager-section products-section product-crm-section">
        <header class="products-section__header">
          <strong>Mais vendidos</strong>
          <span>${renderBestSellerSummary()}</span>
        </header>
        ${renderBestSellerFilters()}
        ${renderBestSellers()}
      </section>

      ${productState.modal === 'product' ? renderProductModal() : ''}
      ${productState.modal === 'category' ? renderCategoryModal() : ''}
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
    productState.error = error.message || 'Nao foi possivel carregar produtos e categorias.';
  } finally {
    productState.loading = false;
    renderProdutosScreen(container);
  }
}

function renderSyncStatus() {
  const status = productState.syncStatus || getCatalogSyncStatus();
  const labels = {
    idle: 'Preparando sincronizacao',
    local: 'Modo local',
    synced: 'Sincronizado',
    syncing: 'Sincronizando...',
    cache: 'Usando cache',
    pending: `${status.pending || 0} alteracao(oes) pendente(s)`,
    error: 'Erro ao sincronizar'
  };

  return `
    <div class="sync-status" data-sync-state="${status.state}">
      <span>${labels[status.state] || 'Sincronizacao'}</span>
      ${status.pending ? '<button class="button button--ghost" type="button" data-action="sync-catalog">Sincronizar</button>' : ''}
    </div>
  `;
}

function bindProdutosEvents(container) {
  container.addEventListener('input', (event) => {
    if (event.target.matches('[data-products-filter]')) {
      productState.query = event.target.value;
      renderProdutosScreen(container);
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
        await loadProductCatalog(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }

    if (event.target.matches('[data-category-form]')) {
      event.preventDefault();
      try {
        await saveCategoryFromForm(event.target);
        await loadProductCatalog(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }
  });

  container.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');

    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.action;

    if (action === 'new-product') openProductModal(container);
    if (action === 'edit-product') openProductModal(container, actionButton.dataset.productId);
    if (action === 'delete-product') {
      try {
        await removeProduct(actionButton.dataset.productId);
        await loadProductCatalog(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }

    if (action === 'new-category') openCategoryModal(container);
    if (action === 'edit-category') openCategoryModal(container, actionButton.dataset.categoryId);
    if (action === 'delete-category') {
      try {
        await removeCategory(actionButton.dataset.categoryId);
        await loadProductCatalog(container);
      } catch (error) {
        handleProductActionError(error);
      }
    }

    if (action === 'sync-catalog') {
      await syncCatalogNow();
      await loadProductCatalog(container);
    }

    if (action === 'close-modal') {
      closeModal();
      renderProdutosScreen(container);
    }

  });
}

function openProductModal(container, productId = null) {
  productState.modal = 'product';
  productState.editingProductId = productId;
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

async function saveProductFromForm(form) {
  const formData = new FormData(form);
  const selectedCategory = formData.get('categoryId');
  const newCategoryName = String(formData.get('newCategoryName') || '').trim();
  const currentProduct = productState.editingProductId
    ? getProducts().find((product) => product.id === productState.editingProductId)
    : null;

  if (selectedCategory === '__new__' && !newCategoryName) {
    showNotification({
      title: 'Categoria obrigatoria',
      message: 'Informe o nome da nova aba.',
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
    active: currentProduct?.active !== false
  };

  if (productState.editingProductId) {
    productData.id = productState.editingProductId;
  }

  const previousShowcaseStock = productState.editingProductId
    ? Number(getShowcaseStockByProductId(productState.editingProductId).quantityAvailable || 0)
    : 0;
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
      title: 'Categoria obrigatoria',
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
    title: 'Acao nao permitida',
    message: error.message || 'Nao foi possivel concluir a acao.',
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
      detail: 'Abas do catalogo'
    },
    {
      label: 'Produtos ativos',
      value: metrics.activeProducts.length,
      detail: 'Liberados para venda'
    },
    {
      label: 'Produtos que aparecem na vitrine',
      value: metrics.showcaseProducts.length,
      detail: 'Visiveis ao cliente'
    },
    {
      label: 'Produto mais vendido',
      value: metrics.topProduct?.name || 'Sem vendas',
      detail: metrics.topProduct ? `${metrics.topProduct.quantity} vendidos` : 'Sem ranking no periodo'
    }
  ];

  return `
    <section class="product-summary-grid" aria-label="Resumo de produtos">
      ${summaryCards.map((card) => `
        <article class="product-summary-card">
          <span>${card.label}</span>
          <strong>${card.value}</strong>
          <small>${card.detail}</small>
        </article>
      `).join('')}
    </section>
  `;
}

function renderProductAlerts(metrics = getProductDashboardMetrics()) {
  const alerts = getProductAlerts(metrics);

  if (!alerts.length) {
    return '';
  }

  return `
    <section class="product-alert-grid" aria-label="Alertas de produtos">
      ${alerts.map((alert) => `
        <article class="product-alert product-alert--${alert.tone}" data-alert-key="${alert.key}">
          <strong>${alert.count}</strong>
          <span>${alert.label}</span>
        </article>
      `).join('')}
    </section>
  `;
}

function renderProductFilters() {
  return `
    <div class="products-filter-row">
      <input class="field" type="search" placeholder="Filtrar produto..." value="${productState.query}" data-products-filter>
      <select class="field" data-category-filter>
        <option value="todos" ${productState.categoryFilter === 'todos' ? 'selected' : ''}>Todas as abas</option>
        ${getVisibleCategories().map((category) => `
          <option value="${escapeHtml(category.id)}" ${productState.categoryFilter === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
        `).join('')}
      </select>
      <select class="field" data-status-filter>
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
    <div class="products-filter-row">
      <select class="field" data-best-seller-period-filter>
        ${renderBestSellerPeriodOptions()}
      </select>
      <select class="field" data-best-seller-category-filter>
        <option value="todos" ${productState.bestSellerCategoryFilter === 'todos' ? 'selected' : ''}>Todas as abas</option>
        ${getVisibleCategories().map((category) => `
          <option value="${escapeHtml(category.id)}" ${productState.bestSellerCategoryFilter === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>
        `).join('')}
      </select>
    </div>
    ${productState.bestSellerPeriod === 'custom' ? `
      <div class="products-filter-row">
        <input class="field" type="date" value="${productState.bestSellerCustomStart}" data-best-seller-custom-start aria-label="Data inicial">
        <input class="field" type="date" value="${productState.bestSellerCustomEnd}" data-best-seller-custom-end aria-label="Data final">
      </div>
    ` : ''}
  `;
}

function renderCategoryRows() {
  const categories = getVisibleCategories();
  const canManageCategories = canCurrentUser('categories.manage');

  if (!categories.length) {
    return '<div class="empty-products">Nenhuma categoria cadastrada no banco.</div>';
  }

  return categories.map((category) => {
    const productCount = getProducts().filter((product) => product.categoryId === category.id).length;
    const activeClass = productState.categoryFilter === category.id ? ' is-active' : '';
    const showcaseStatus = category.showInShowcase ? 'Aparece na vitrine' : 'Nao aparece na vitrine';

    return `
      <article class="category-manager-card${activeClass}">
        <div class="category-manager-card__content">
          <strong>${escapeHtml(category.name)}</strong>
          <span>${productCount} produtos</span>
          <span>${showcaseStatus}</span>
        </div>
        ${canManageCategories ? `<div class="row-actions">
          <button class="button button--ghost button--small" type="button" data-action="edit-category" data-category-id="${category.id}">Editar</button>
          <button class="button button--danger button--small" type="button" data-action="delete-category" data-category-id="${category.id}">Apagar</button>
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function renderProductRows() {
  const products = getFilteredProducts();
  const categoriesById = getCategoriesById();
  const canManageProducts = canCurrentUser('products.manage');

  if (!products.length) {
    return '<div class="empty-products">Nenhum produto encontrado com os filtros atuais.</div>';
  }

  return products.map((product) => {
    const category = categoriesById.get(product.categoryId);
    const isActive = product.active !== false;
    const inShowcase = isProductInShowcase(product, categoriesById);

    return `
      <article class="product-manager-card">
        <div class="product-manager-card__content">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(category ? category.name : 'Sem categoria')} - ${formatCurrency(product.price)} - Estoque: ${product.stock}</span>
          <div class="product-manager-card__badges">
            <span class="product-manager-card__badge ${isActive ? 'is-active' : 'is-inactive'}">${isActive ? 'Ativo' : 'Inativo'}</span>
            <span class="product-manager-card__badge ${inShowcase ? 'is-showcase' : 'is-out-showcase'}">${inShowcase ? 'Na vitrine' : 'Fora da vitrine'}</span>
          </div>
        </div>
        ${canManageProducts ? `<div class="row-actions">
          <button class="button button--ghost button--small" type="button" data-action="edit-product" data-product-id="${product.id}">Editar</button>
          <button class="button button--danger button--small" type="button" data-action="delete-product" data-product-id="${product.id}">Apagar</button>
        </div>` : ''}
      </article>
    `;
  }).join('');
}

function renderProductModal() {
  const product = productState.editingProductId
    ? getProducts().find((item) => item.id === productState.editingProductId)
    : null;
  const title = product ? 'Editar Produto' : 'Novo Produto';
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
            Tipo / Aba
            <select class="field" name="categoryId" data-product-category-select required>
              ${canManageCategories ? `<option value="__new__" ${selectedCategory === '__new__' ? 'selected' : ''}>+ Criar nova aba</option>` : ''}
              ${getCategoryOptions(selectedCategory)}
            </select>
          </label>

          <div data-new-category ${canManageCategories && selectedCategory === '__new__' ? '' : 'hidden'}>
            <label class="stacked-label">
              Nova aba
              <input class="field" name="newCategoryName" placeholder="Ex.: Combos">
            </label>
          </div>

          <label class="stacked-label">
            Preco de venda
            <input class="field" name="price" type="number" min="0" step="0.01" required placeholder="0,00" value="${product ? product.price : ''}">
          </label>

          <label class="stacked-label">
            Estoque atual
            <input class="field" name="stock" type="number" min="0" step="1" required placeholder="0" value="${product ? product.stock : 0}">
            <small>Informe 0 para zerar ou uma quantidade menor para retirar unidades.</small>
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
  const title = category ? 'Editar Categoria' : 'Nova Categoria';
  const submitLabel = category ? 'Atualizar Categoria' : 'Salvar Categoria';

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <header class="modal__header">
          <h2 id="category-modal-title">${title}</h2>
          <button class="icon-button" type="button" data-action="close-modal" title="Fechar">X</button>
        </header>

        <form class="product-form" data-category-form>
          <label class="stacked-label">
            Nome da categoria
            <input class="field" name="name" required placeholder="Ex: Salgados" value="${escapeHtml(category ? category.name : '')}">
          </label>
          <label class="checkbox-field category-visibility-toggle">
            <input type="checkbox" name="showInShowcase" ${category?.showInShowcase !== false ? 'checked' : ''}>
            Aparecer para lancar na Vitrine
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
    return '<div class="empty-products product-empty-large">Nenhuma venda no periodo.</div>';
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
    <div class="product-crm-grid">
      ${renderBestSellerRanking('Mais vendidos', mostSold)}
      ${renderBestSellerRanking('Menos vendidos', leastSold)}
    </div>
  `;
}

function renderBestSellerRanking(title, rows) {
  const maxQuantity = Math.max(...rows.map((item) => item.quantity), 1);

  return `
    <section class="product-ranking-panel">
      <header>
        <h3>${title}</h3>
        <span>${rows.length} produtos</span>
      </header>
      <div class="product-ranking-list">
        ${rows.map((item, index) => {
        const percent = Math.max((item.quantity / maxQuantity) * 100, 8);
        return `
          <article class="product-ranking-row">
            <div class="product-ranking-row__info">
              <strong>${index + 1}. ${escapeHtml(item.name)}</strong>
              <span>${item.quantity} vendidos - ${formatCurrency(item.revenue)}</span>
            </div>
            <div class="best-seller-bar" aria-label="${escapeHtml(item.name)}: ${item.quantity}">
              <span style="width: ${percent}%"></span>
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
    ['month', 'Este mes'],
    ['year', 'Este ano'],
    ['all', 'Todo periodo'],
    ['custom', 'Personalizado']
  ];

  return options.map(([value, label]) => `
    <option value="${value}" ${productState.bestSellerPeriod === value ? 'selected' : ''}>${label}</option>
  `).join('');
}
