import { STORAGE_KEYS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';

export function getProducts() {
  return getItem(STORAGE_KEYS.products, []);
}

export function getActiveProducts() {
  return getProducts().filter((product) => product.active);
}

export function getCategories() {
  return getItem(STORAGE_KEYS.categories, []).map(normalizeCategory);
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
  setItem(STORAGE_KEYS.categories, categories);

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

  setItem(STORAGE_KEYS.categories, categories);

  return categories[index];
}

export function deleteCategory(categoryId) {
  if (categoryId === 'todos') {
    return;
  }

  const categories = getCategories().filter((category) => category.id !== categoryId);
  const products = getProducts().filter((product) => product.categoryId !== categoryId);

  setItem(STORAGE_KEYS.categories, categories);
  saveProducts(products);
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

export function deleteProduct(productId) {
  const products = getProducts().filter((product) => product.id !== productId);
  saveProducts(products);
}

function saveProducts(products) {
  setItem(STORAGE_KEYS.products, products);
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
