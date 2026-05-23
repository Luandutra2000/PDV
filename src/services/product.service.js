import { getDataProvider } from './data-provider.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { getSupabaseClient } from './supabase-client.service.js';

let productCatalogClientForTests = null;

export function setProductCatalogClientForTests(client) {
  productCatalogClientForTests = client;
}

export async function syncProductsFromOnlineDatabase() {
  if (!isSupabaseEnabled()) {
    return {
      categories: getCategories(),
      products: getProducts()
    };
  }

  const client = await getProductCatalogClient();
  const [{ data: categories, error: categoriesError }, { data: products, error: productsError }] = await Promise.all([
    client.from('categories').select('*').order('name'),
    client.from('products').select('*').order('name')
  ]);

  if (categoriesError) {
    throw new Error(categoriesError.message || 'Falha ao carregar categorias do banco.');
  }

  if (productsError) {
    throw new Error(productsError.message || 'Falha ao carregar produtos do banco.');
  }

  const mappedCategories = categories.map(mapCategoryFromSupabase);
  const mappedProducts = products.map(mapProductFromSupabase);

  getDataProvider().setCollection('categories', mappedCategories);
  getDataProvider().setCollection('products', mappedProducts);

  return {
    categories: mappedCategories,
    products: mappedProducts
  };
}

export function getProducts() {
  return getDataProvider().getCollection('products', []);
}

export function getActiveProducts() {
  return getProducts().filter((product) => product.active);
}

export function getCategories() {
  return getDataProvider().getCollection('categories', []).map(normalizeCategory);
}

export function getShowcaseCategories() {
  return getCategories().filter((category) => category.id !== 'todos' && category.showInShowcase);
}

export function getShowcaseProducts() {
  const showcaseCategoryIds = new Set(getShowcaseCategories().map((category) => category.id));
  return getProducts().filter((product) => product.active && showcaseCategoryIds.has(product.categoryId));
}

export function createCategory(name, options = {}) {
  const categories = getCategories();
  const category = normalizeCategory({
    id: createSlugId(name, categories.map((item) => item.id)),
    name,
    showInShowcase: options.showInShowcase
  });

  categories.push(category);
  getDataProvider().setCollection('categories', categories);

  return category;
}

export async function createCategoryOnline(name, options = {}) {
  const category = createCategory(name, options);
  await saveCategoryToOnlineDatabase(category);
  await syncProductsFromOnlineDatabase();
  return category;
}

export function updateCategory(categoryId, data = {}) {
  const categories = getCategories();
  const index = categories.findIndex((category) => category.id === categoryId);

  if (index === -1 || categoryId === 'todos') {
    return null;
  }

  categories[index] = {
    ...categories[index],
    ...normalizeCategory({
      ...categories[index],
      name: typeof data === 'string' ? data : data.name ?? categories[index].name,
      showInShowcase: typeof data === 'string' ? categories[index].showInShowcase : data.showInShowcase
    })
  };

  getDataProvider().setCollection('categories', categories);

  return categories[index];
}

export async function updateCategoryOnline(categoryId, data = {}) {
  const category = updateCategory(categoryId, data);

  if (!category) {
    return null;
  }

  await saveCategoryToOnlineDatabase(category);
  await syncProductsFromOnlineDatabase();
  return category;
}

export function deleteCategory(categoryId) {
  if (categoryId === 'todos') {
    return;
  }

  const categories = getCategories().filter((category) => category.id !== categoryId);
  const products = getProducts().filter((product) => product.categoryId !== categoryId);

  getDataProvider().setCollection('categories', categories);
  saveProducts(products);
}

export async function deleteCategoryOnline(categoryId) {
  deleteCategory(categoryId);

  if (isSupabaseEnabled()) {
    const client = await getProductCatalogClient();
    const { error: productsError } = await client.from('products').delete().eq('category_id', categoryId);

    if (productsError) {
      throw new Error(productsError.message || 'Falha ao apagar produtos da categoria no banco.');
    }

    const { error } = await client.from('categories').delete().eq('id', categoryId);

    if (error) {
      throw new Error(error.message || 'Falha ao apagar categoria no banco.');
    }

    await syncProductsFromOnlineDatabase();
  }
}

export function getProductById(productId) {
  return getProducts().find((product) => product.id === productId) || null;
}

export function searchProducts({ query = '', categoryId = 'todos' } = {}) {
  const normalizedQuery = normalizeSearchText(query);
  const categoriesById = new Map(getCategories().map((category) => [category.id, category.name]));

  return getActiveProducts().filter((product) => {
    const matchesCategory = categoryId === 'todos'
      || product.categoryId === categoryId;
    const categoryName = categoriesById.get(product.categoryId) || '';
    const searchableText = normalizeSearchText([
      product.name,
      categoryName,
      ...(product.aliases || [])
    ].join(' '));
    const matchesQuery = !normalizedQuery || searchableText.includes(normalizedQuery);

    return matchesCategory && matchesQuery;
  });
}

export function getFavoriteProducts() {
  return getActiveProducts().filter((product) => product.favorite);
}

export function createProduct(productData) {
  const products = getProducts();
  const product = normalizeProduct({
    id: createProductId(productData.name),
    ...productData
  });

  products.push(product);
  saveProducts(products);

  return product;
}

export async function createProductOnline(productData) {
  const product = createProduct(productData);
  await saveProductToOnlineDatabase(product);
  await syncProductsFromOnlineDatabase();
  return product;
}

export function updateProduct(productId, productData) {
  const products = getProducts();
  const index = products.findIndex((product) => product.id === productId);

  if (index === -1) {
    return null;
  }

  products[index] = normalizeProduct({
    ...products[index],
    ...productData,
    id: productId
  });

  saveProducts(products);

  return products[index];
}

export async function updateProductOnline(productId, productData) {
  const product = updateProduct(productId, productData);

  if (!product) {
    return null;
  }

  await saveProductToOnlineDatabase(product);
  await syncProductsFromOnlineDatabase();
  return product;
}

export function deleteProduct(productId) {
  const products = getProducts().filter((product) => product.id !== productId);
  saveProducts(products);
}

export async function deleteProductOnline(productId) {
  deleteProduct(productId);

  if (isSupabaseEnabled()) {
    const client = await getProductCatalogClient();
    const { error } = await client.from('products').delete().eq('id', productId);

    if (error) {
      throw new Error(error.message || 'Falha ao apagar produto no banco.');
    }

    await syncProductsFromOnlineDatabase();
  }
}

function saveProducts(products) {
  getDataProvider().setCollection('products', products);
}

async function saveProductToOnlineDatabase(product) {
  if (!isSupabaseEnabled()) {
    return;
  }

  const client = await getProductCatalogClient();
  const { error } = await client.from('products').upsert(mapProductToSupabase(product));

  if (error) {
    throw new Error(error.message || 'Falha ao salvar produto no banco.');
  }
}

async function saveCategoryToOnlineDatabase(category) {
  if (!isSupabaseEnabled()) {
    return;
  }

  const client = await getProductCatalogClient();
  const { error } = await client.from('categories').upsert(mapCategoryToSupabase(category));

  if (error) {
    throw new Error(error.message || 'Falha ao salvar categoria no banco.');
  }
}

function normalizeProduct(product) {
  return {
    id: product.id,
    name: String(product.name || '').trim(),
    categoryId: product.categoryId || 'lanches',
    price: Number(product.price) || 0,
    cost: Number(product.cost) || 0,
    stock: Number(product.stock) || 0,
    active: Boolean(product.active),
    aliases: Array.isArray(product.aliases)
      ? product.aliases.map((alias) => String(alias).trim()).filter(Boolean)
      : [],
    favorite: Boolean(product.favorite)
  };
}

function normalizeCategory(category) {
  return {
    id: category.id,
    name: normalizeCategoryName(category.name, category.id),
    showInShowcase: category.id === 'todos' ? false : category.showInShowcase !== false
  };
}

function mapProductToSupabase(product) {
  return {
    id: product.id,
    name: product.name,
    category_id: product.categoryId,
    price: product.price,
    cost: product.cost,
    stock: product.stock,
    active: product.active,
    aliases: product.aliases || [],
    favorite: product.favorite
  };
}

function mapProductFromSupabase(row) {
  return normalizeProduct({
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    price: row.price,
    cost: row.cost,
    stock: row.stock,
    active: row.active,
    aliases: row.aliases,
    favorite: row.favorite
  });
}

function mapCategoryToSupabase(category) {
  return {
    id: category.id,
    name: category.name,
    show_in_showcase: category.showInShowcase
  };
}

function mapCategoryFromSupabase(row) {
  return normalizeCategory({
    id: row.id,
    name: row.name,
    showInShowcase: row.show_in_showcase
  });
}

async function getProductCatalogClient() {
  return productCatalogClientForTests || getSupabaseClient();
}

function normalizeCategoryName(value, categoryId) {
  if (value && typeof value === 'object' && 'name' in value) {
    return normalizeCategoryName(value.name, categoryId);
  }

  const normalizedName = String(value || '').trim();

  if (normalizedName && normalizedName !== '[object Object]') {
    return normalizedName;
  }

  return humanizeSlug(categoryId || 'categoria');
}

function humanizeSlug(value) {
  return String(value || 'categoria')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Categoria';
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function createProductId(name) {
  return createSlugId(name || 'produto', getProducts().map((product) => product.id));
}

function createSlugId(value, existingIdsList) {
  const baseId = String(value || 'item')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'item';
  const existingIds = new Set(existingIdsList);
  let id = baseId;
  let suffix = 2;

  while (existingIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}
