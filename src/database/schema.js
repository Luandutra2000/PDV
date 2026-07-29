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
  productStock: 'pdv.productStock',
  showcaseMovements: 'pdv.showcaseMovements',
  outOfStockSales: 'pdv.outOfStockSales',
  showcaseSyncQueue: 'pdv.syncQueue.showcase',
  financialCategories: 'pdv.financialCategories',
  financialTransactions: 'pdv.financialTransactions',
  financialSyncQueue: 'pdv.syncQueue.financial',
  companySettings: 'pdv.companySettings',
  paymentAttempts: 'pdv.paymentAttempts',
  kitchenOrders: 'pdv.kitchenOrders',
  printJobs: 'pdv.printJobs',
  syncQueue: 'pdv.syncQueue'
};

export const SYNC_EVENTS = {
  comandaItemAdded: 'COMANDA_ITEM_ADDED',
  comandaItemRemoved: 'COMANDA_ITEM_REMOVED',
  comandaQuantityChanged: 'COMANDA_QUANTITY_CHANGED',
  comandaCleared: 'COMANDA_CLEARED',
  saleFinished: 'SALE_FINISHED',
  cashMovementRegistered: 'CASH_MOVEMENT_REGISTERED',
  financialTransactionChanged: 'FINANCIAL_TRANSACTION_CHANGED'
};

export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED',
  mobileFeedChanged: 'MOBILE_FEED_CHANGED',
  productCatalogChanged: 'PRODUCT_CATALOG_CHANGED',
  productSyncStatusChanged: 'PRODUCT_SYNC_STATUS_CHANGED',
  financialSyncStatusChanged: 'FINANCIAL_SYNC_STATUS_CHANGED',
  financialDataChanged: 'FINANCIAL_DATA_CHANGED',
  showcaseStockChanged: 'SHOWCASE_STOCK_CHANGED',
  showcaseDataChanged: 'SHOWCASE_DATA_CHANGED',
  showcaseSyncStatusChanged: 'SHOWCASE_SYNC_STATUS_CHANGED',
  financeChanged: 'FINANCE_CHANGED',
  usersChanged: 'USERS_CHANGED',
  permissionsChanged: 'PERMISSIONS_CHANGED',
  companySettingsChanged: 'COMPANY_SETTINGS_CHANGED'
};
