import { UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { getSupabaseAuthSession, getSupabaseClient } from './supabase-client.service.js?v=20260804-06';
import { emit } from './event-bus.service.js?v=20260804-06';
import { createEntitySyncRepository } from './repositories/entity-sync.repository.js?v=20260804-06';
import { categoryAdapter } from './repositories/category.adapter.js?v=20260804-06';
import { productAdapter } from './repositories/product.adapter.js?v=20260804-06';
import { setLocalCache } from './providers/local.provider.js?v=20260804-06';

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
      writeCacheOverride: (items) => setLocalCache(categoryAdapter.cacheKey, items),
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
      writeCacheOverride: (items) => setLocalCache(productAdapter.cacheKey, items),
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
  try {
    await getSupabaseAuthSession({ forceRefresh: true });
  } catch (error) {
    // The repositories still attempt the queue flush so they can preserve
    // pending changes and expose the actual remote error in their status.
  }
  await getCategoryRepository().flushQueue();
  await getProductRepository().flushQueue();
  emit(UI_EVENTS.productSyncStatusChanged, getProductSyncStatus());
}

export async function clearProductCatalogQueue() {
  await getCategoryRepository().clearQueue();
  await getProductRepository().clearQueue();
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
