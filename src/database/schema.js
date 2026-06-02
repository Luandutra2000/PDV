export const STORAGE_KEYS = {
  users: 'pdv.users',
  currentSession: 'pdv.currentSession',
  userPermissionOverrides: 'pdv.userPermissionOverrides',
  auditLogs: 'pdv.auditLogs',
  products: 'pdv.products',
  categories: 'pdv.categories',
  activeComanda: 'pdv.activeComanda',
  caixa: 'pdv.caixa',
  transactions: 'pdv.transactions',
  closedComandas: 'pdv.closedComandas',
  stockLaunches: 'pdv.stockLaunches',
  hiddenStockComparisons: 'pdv.hiddenStockComparisons',
  cashClosings: 'pdv.cashClosings',
  cashClosingDraft: 'pdv.cashClosingDraft',
  showcaseWriteOffs: 'pdv.showcaseWriteOffs',
  syncQueue: 'pdv.syncQueue'
};

export const SYNC_EVENTS = {
  comandaItemAdded: 'COMANDA_ITEM_ADDED',
  comandaItemRemoved: 'COMANDA_ITEM_REMOVED',
  comandaQuantityChanged: 'COMANDA_QUANTITY_CHANGED',
  comandaCleared: 'COMANDA_CLEARED',
  saleFinished: 'SALE_FINISHED',
  cashMovementRegistered: 'CASH_MOVEMENT_REGISTERED'
};

export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED',
  mobileFeedChanged: 'MOBILE_FEED_CHANGED',
  productCatalogChanged: 'PRODUCT_CATALOG_CHANGED',
  productSyncStatusChanged: 'PRODUCT_SYNC_STATUS_CHANGED'
};
