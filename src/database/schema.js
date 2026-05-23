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

export const SYNC_EVENTS = {
  comandaItemAdded: 'COMANDA_ITEM_ADDED',
  comandaItemRemoved: 'COMANDA_ITEM_REMOVED',
  comandaQuantityChanged: 'COMANDA_QUANTITY_CHANGED',
  comandaCleared: 'COMANDA_CLEARED',
  saleFinished: 'SALE_FINISHED',
  cashMovementRegistered: 'CASH_MOVEMENT_REGISTERED'
};

export const UI_EVENTS = {
  cashSummaryChanged: 'CASH_SUMMARY_CHANGED'
};
