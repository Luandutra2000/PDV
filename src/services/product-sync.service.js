import { UI_EVENTS } from '../database/schema.js?v=20260804-03';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-03';
import { emit } from './event-bus.service.js?v=20260804-03';
import { createEntitySyncRepository } from './repositories/entity-sync.repository.js?v=20260804-03';
import { categoryAdapter } from './repositories/category.adapter.js?v=20260804-03';
import { productAdapter } from './repositories/product.adapter.js?v=20260804-03';

let categoryRepository = null;
let productRepository = null;

function emitCatalogChange(entity, payload) {
  emit(UI_EVENTS.productCatalogChanged, { entity, ...payload });
  emit(UI_EVENTS.productSyncStatusChanged, getProductSyncStatus());
}

function getCategoryRepository() {
  if (!categoryRepository) {
    categoryRepository = createEntitySyncRepository({
      adapter: categoryAdapter,
      getClient: getSupabaseClient,
      emitChange: (payload) => emitCatalogChange('categories', payload)
    });
  }

  return categoryRepository;
}

function getProductRepository() {
  if (!productRepository) {
    productRepository = createEntitySyncRepository({
      adapter: productAdapter,
      getClient: getSupabaseClient,
      emitChange: (payload) => emitCatalogChange('products', payload)
    });
  }

  return productRepository;
}

function resolveState(categories, products, pending) {
  if (pending > 0) {
    return 'pending';
  }

  const states = [categories.state, products.state];

  if (states.includes('error')) {
    return 'error';
  }

  if (states.includes('cache')) {
    return 'cache';
  }

  if (states.includes('syncing')) {
    return 'syncing';
  }

  return 'synced';
}

export function loadProductsFromSupabase() {
  return getProductRepository().list();
}

export function loadCategoriesFromSupabase() {
  return getCategoryRepository().list();
}

export function saveProductToSupabase(product) {
  return getProductRepository().save(product);
}

export function saveCategoryToSupabase(category) {
  return getCategoryRepository().save(category);
}

export function deleteProductFromSupabase(productId) {
  return getProductRepository().remove(productId);
}

export function deleteCategoryFromSupabase(categoryId) {
  return getCategoryRepository().remove(categoryId);
}

export async function flushProductCatalogQueue() {
  await getCategoryRepository().flushQueue();
  await getProductRepository().flushQueue();
  emit(UI_EVENTS.productSyncStatusChanged, getProductSyncStatus());
}

export async function startProductCatalogRealtime() {
  await Promise.all([
    getCategoryRepository().subscribe(),
    getProductRepository().subscribe()
  ]);
}

export async function stopProductCatalogRealtime() {
  await Promise.all([
    getCategoryRepository().unsubscribe(),
    getProductRepository().unsubscribe()
  ]);
}

export function getProductSyncStatus() {
  const categories = getCategoryRepository().getSyncStatus();
  const products = getProductRepository().getSyncStatus();
  const pending = (categories.pending || 0) + (products.pending || 0);

  return {
    state: resolveState(categories, products, pending),
    pending,
    categories,
    products
  };
}
