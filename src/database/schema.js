export const STORAGE_KEYS = {
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

export const DATA_PROVIDER_MODES = {
  local: 'local',
  supabase: 'supabase'
};

export const SYNC_EVENTS = {
  comandaItemAdded: 'COMANDA_ITEM_ADDED',
  comandaItemRemoved: 'COMANDA_ITEM_REMOVED',
  comandaQuantityChanged: 'COMANDA_QUANTITY_CHANGED',
  comandaCleared: 'COMANDA_CLEARED',
  saleFinished: 'SALE_FINISHED',
  cashMovementRegistered: 'CASH_MOVEMENT_REGISTERED',
  stockLaunchCreated: 'STOCK_LAUNCH_CREATED',
  stockLaunchUpdated: 'STOCK_LAUNCH_UPDATED',
  stockLaunchCanceled: 'STOCK_LAUNCH_CANCELED',
  showcaseProductCleared: 'SHOWCASE_PRODUCT_CLEARED',
  showcaseWriteOffCreated: 'SHOWCASE_WRITE_OFF_CREATED',
  transactionHistoryCleared: 'TRANSACTION_HISTORY_CLEARED'
};

export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED',
  mobileFeedChanged: 'MOBILE_FEED_CHANGED'
};
