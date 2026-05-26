import {
  createCategory,
  createCategoryOnline,
  createProduct,
  createProductOnline,
  deleteCategory,
  deleteCategoryOnline,
  deleteProduct,
  deleteProductOnline,
  getCategories,
  getProducts,
  updateCategory,
  updateCategoryOnline,
  updateProduct,
  updateProductOnline
} from '../../services/product.service.js';
import { formatCurrency } from '../../utils/currency.js';
import { showNotification } from '../../services/notification.service.js';
import { getBestSellingProducts } from '../../services/transaction.service.js';
import { isSupabaseEnabled } from '../../services/app-config.service.js';

const productState = {
  modal: null,
  editingProductId: null,
  editingCategoryId: null,
  query: '',
  categoryFilter: 'todos',
  lastProductCategoryId: '',
  bestSellerPeriod: 'today',
  bestSellerCustomStart: '',
  bestSellerCustomEnd: '',
  bestSellerCategoryFilter: 'todos'
};
const boundContainers = new WeakSet();

export function initProdutosModule(container) {
  productState.modal = null;
  productState.editingProductId = null;
  productState.editingCategoryId = null;
  renderProdutosScreen(container);

  if (!boundContainers.has(container)) {
    bindProdutosEvents(container);
    boundContainers.add(container);
  }
}

function renderProdutosScreen(container) {
  container.innerHTML = `
    <section class="module-screen products-module">
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Produtos</h1>
          <p class="module-subtitle">Cadastre produtos e tipos. Cada tipo aparece como aba no caixa.</p>
        </div>
        <div class="header-actions">
          <button class="button button--ghost" type="button" data-action="new-category">+ Nova Categoria</button>
          <button class="button" type="button" data-action="new-product">+ Novo Produto</button>
        </div>
      </header>

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Categorias / Abas</strong>
          <span>${getVisibleCategories().length} categorias</span>
        </header>
        <div class="manager-list">
          ${renderCategoryRows()}
        </div>
      </section>

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Produtos cadastrados</strong>
          <span>${getFilteredProducts().length} produtos</span>
        </header>
        <div class="products-filter-row">
          <input class="field" type="search" placeholder="Filtrar produto..." value="${productState.query}" data-products-filter>
          <select class="field" data-category-filter>
            <option value="todos" ${productState.categoryFilter === 'todos' ? 'selected' : ''}>Todas as abas</option>
            ${getVisibleCategories().map((category) => `
              <option value="${category.id}" ${productState.categoryFilter === category.id ? 'selected' : ''}>${category.name}</option>
            `).join('')}
          </select>
        </div>
        <div class="manager-list">
          ${renderProductRows()}
        </div>
      </section>

      <section class="manager-section">
        <header class="manager-section__header">
          <strong>Mais vendidos</strong>
          <span>${renderBestSellerSummary()}</span>
        </header>
        <div class="products-filter-row">
          <select class="field" data-best-seller-period-filter>
            ${renderBestSellerPeriodOptions()}
          </select>
          <select class="field" data-best-seller-category-filter>
            <option value="todos" ${productState.bestSellerCategoryFilter === 'todos' ? 'selected' : ''}>Todas as abas</option>
            ${getVisibleCategories().map((category) => `
              <option value="${category.id}" ${productState.bestSellerCategoryFilter === category.id ? 'selected' : ''}>${category.name}</option>
            `).join('')}
          </select>
        </div>
        ${productState.bestSellerPeriod === 'custom' ? `
          <div class="products-filter-row">
            <input class="field" type="date" value="${productState.bestSellerCustomStart}" data-best-seller-custom-start aria-label="Data inicial">
            <input class="field" type="date" value="${productState.bestSellerCustomEnd}" data-best-seller-custom-end aria-label="Data final">
          </div>
        ` : ''}
        ${renderBestSellers()}
      </section>

      ${productState.modal === 'product' ? renderProductModal() : ''}
      ${productState.modal === 'category' ? renderCategoryModal() : ''}
    </section>
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
      await saveProductFromForm(event.target);
      renderProdutosScreen(container);
    }

    if (event.target.matches('[data-category-form]')) {
      event.preventDefault();
      await saveCategoryFromForm(event.target);
      renderProdutosScreen(container);
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
      await removeProduct(actionButton.dataset.productId);
      renderProdutosScreen(container);
    }

    if (action === 'new-category') openCategoryModal(container);
    if (action === 'edit-category') openCategoryModal(container, actionButton.dataset.categoryId);
    if (action === 'delete-category') {
      await removeCategory(actionButton.dataset.categoryId);
      renderProdutosScreen(container);
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
  const isEditing = Boolean(productState.editingProductId);

  if (selectedCategory === '__new__' && !newCategoryName) {
    showNotification({
      title: 'Categoria obrigatoria',
      message: 'Informe o nome da nova aba.',
      type: 'danger'
    });
    return;
  }

  try {
    const categoryId = selectedCategory === '__new__'
      ? (await saveCategory(newCategoryName, { showInShowcase: true })).id
      : selectedCategory;
    const productData = {
      name: formData.get('name'),
      categoryId,
      price: formData.get('price'),
      cost: 0,
      stock: 0,
      active: true
    };

    if (isEditing) {
      await saveProduct(productState.editingProductId, productData);
      closeModal();
    } else {
      await saveProduct(null, productData);
      productState.lastProductCategoryId = categoryId;
      productState.modal = 'product';
      productState.editingProductId = null;
      showNotification({
        title: 'Produto salvo',
        message: 'Pode cadastrar o proximo produto.',
        type: 'success'
      });
    }
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel salvar',
      message: error.message || 'Produto nao foi salvo no banco.',
      type: 'danger'
    });
  }
}

async function saveCategoryFromForm(form) {
  const formData = new FormData(form);
  const name = String(formData.get('name') || '').trim();
  const showInShowcase = formData.get('showInShowcase') === 'on';
  const isEditing = Boolean(productState.editingCategoryId);

  if (!name) {
    showNotification({
      title: 'Categoria obrigatoria',
      message: 'Informe o nome da categoria.',
      type: 'danger'
    });
    return;
  }

  try {
    if (isEditing) {
      await saveCategory(name, { id: productState.editingCategoryId, showInShowcase });
      closeModal();
    } else {
      await saveCategory(name, { showInShowcase });
      productState.modal = 'category';
      productState.editingCategoryId = null;
      showNotification({
        title: 'Categoria salva',
        message: 'Pode cadastrar a proxima categoria.',
        type: 'success'
      });
    }
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel salvar',
      message: error.message || 'Categoria nao foi salva no banco.',
      type: 'danger'
    });
  }
}

async function saveProduct(productId, productData) {
  if (!isSupabaseEnabled()) {
    return productId ? updateProduct(productId, productData) : createProduct(productData);
  }

  return productId ? updateProductOnline(productId, productData) : createProductOnline(productData);
}

async function saveCategory(name, options = {}) {
  if (!isSupabaseEnabled()) {
    return options.id
      ? updateCategory(options.id, { name, showInShowcase: options.showInShowcase })
      : createCategory(name, { showInShowcase: options.showInShowcase });
  }

  return options.id
    ? updateCategoryOnline(options.id, { name, showInShowcase: options.showInShowcase })
    : createCategoryOnline(name, { showInShowcase: options.showInShowcase });
}

async function removeProduct(productId) {
  if (isSupabaseEnabled()) {
    await deleteProductOnline(productId);
    return;
  }

  deleteProduct(productId);
}

async function removeCategory(categoryId) {
  if (isSupabaseEnabled()) {
    await deleteCategoryOnline(categoryId);
    return;
  }

  deleteCategory(categoryId);
}

function renderCategoryRows() {
  const categories = getVisibleCategories();

  if (!categories.length) {
    return '<div class="empty-products">Nenhuma categoria cadastrada.</div>';
  }

  return categories.map((category) => {
    const productCount = getProducts().filter((product) => product.categoryId === category.id).length;

    return `
      <article class="manager-row">
        <div>
          <strong>${category.name}</strong>
          <span>${productCount} produtos - ${category.showInShowcase ? 'Aparece na vitrine' : 'Nao aparece na vitrine'}</span>
        </div>
        <div class="row-actions">
          <button class="button button--ghost" type="button" data-action="edit-category" data-category-id="${category.id}">Editar</button>
          <button class="button button--danger" type="button" data-action="delete-category" data-category-id="${category.id}">Apagar</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderProductRows() {
  const products = getFilteredProducts();

  if (!products.length) {
    return '<div class="empty-products">Nenhum produto cadastrado.</div>';
  }

  return products.map((product) => {
    const category = getCategories().find((item) => item.id === product.categoryId);

    return `
      <article class="manager-row">
        <div>
          <strong>${product.name}</strong>
          <span>${category ? category.name : 'Sem categoria'} - ${formatCurrency(product.price)} - Estoque: ${product.stock}</span>
        </div>
        <div class="row-actions">
          <button class="button button--ghost" type="button" data-action="edit-product" data-product-id="${product.id}">Editar</button>
          <button class="button button--danger" type="button" data-action="delete-product" data-product-id="${product.id}">Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderProductModal() {
  const product = productState.editingProductId
    ? getProducts().find((item) => item.id === productState.editingProductId)
    : null;
  const title = product ? 'Editar Produto' : 'Novo Produto';
  const selectedCategory = product ? product.categoryId : productState.lastProductCategoryId || '__new__';

  return `
    <div class="modal-backdrop is-open">
      <div class="modal modal--small product-quick-modal" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
        <header class="modal__header">
          <h2 id="product-modal-title">${title}</h2>
        </header>

        <form class="product-form" data-product-form>
          <label class="stacked-label">
            Nome do produto
            <input class="field" name="name" required placeholder="Ex.: X-Frango" value="${product ? product.name : ''}">
          </label>

          <label class="stacked-label">
            Tipo / Aba
            <select class="field" name="categoryId" data-product-category-select required>
              <option value="__new__" ${selectedCategory === '__new__' ? 'selected' : ''}>+ Criar nova aba</option>
              ${getCategoryOptions(selectedCategory)}
            </select>
          </label>

          <div data-new-category ${selectedCategory === '__new__' ? '' : 'hidden'}>
            <label class="stacked-label">
              Nova aba
              <input class="field" name="newCategoryName" placeholder="Ex.: Combos">
            </label>
          </div>

          <label class="stacked-label">
            Preco de venda
            <input class="field" name="price" type="number" min="0" step="0.01" required placeholder="0,00" value="${product ? product.price : ''}">
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
            <input class="field" name="name" required placeholder="Ex: Salgados" value="${category ? category.name : ''}">
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
        ${category.name}
      </option>
    `)
    .join('');
}

function getVisibleCategories() {
  return getCategories().filter((category) => category.id !== 'todos');
}

function getFilteredProducts() {
  const normalizedQuery = productState.query.trim().toLowerCase();

  return getProducts().filter((product) => {
    const matchesQuery = !normalizedQuery || product.name.toLowerCase().includes(normalizedQuery);
    const matchesCategory = productState.categoryFilter === 'todos' || product.categoryId === productState.categoryFilter;

    return matchesQuery && matchesCategory;
  });
}

function renderBestSellers() {
  const bestSellers = getFilteredBestSellers();

  if (!bestSellers.length) {
    return '<div class="empty-products product-empty-large">NENHUMA VENDA NO PERIODO</div>';
  }

  const maxQuantity = Math.max(...bestSellers.map((item) => item.quantity));

  return `
    <div class="best-seller-chart">
      ${bestSellers.slice(0, 8).map((item, index) => {
        const percent = Math.max((item.quantity / maxQuantity) * 100, 8);
        return `
          <article class="best-seller-row">
            <div class="best-seller-row__info">
              <strong>${index + 1}. ${item.name}</strong>
              <span>${item.quantity} vendidos - ${formatCurrency(item.revenue)}</span>
            </div>
            <div class="best-seller-bar" aria-label="${item.name}: ${item.quantity}">
              <span style="width: ${percent}%"></span>
            </div>
          </article>
        `;
      }).join('')}
    </div>
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
    ['month', 'Este mes'],
    ['year', 'Este ano'],
    ['all', 'Todo periodo'],
    ['custom', 'Periodo personalizado']
  ];

  return options.map(([value, label]) => `
    <option value="${value}" ${productState.bestSellerPeriod === value ? 'selected' : ''}>${label}</option>
  `).join('');
}
