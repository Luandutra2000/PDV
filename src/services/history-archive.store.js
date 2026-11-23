// Older history fetched from the server for a report. Kept in memory only:
// it never enters the local caches, so it cannot fill the browser storage
// nor be written back by code that rewrites the local collections.
let archive = createEmptyArchive();

export function getArchivedTransactions() {
  return archive.transactions;
}

export function getArchivedComandas() {
  return archive.comandas;
}

export function getHistoryArchiveState() {
  const { since, until, status, error } = archive;
  return { since, until, status, error };
}

export function setHistoryArchiveLoading({ since, until }) {
  archive = { ...createEmptyArchive(), since, until, status: 'loading' };
}

export function setHistoryArchiveData({ since, until, transactions = [], comandas = [] }) {
  archive = { since, until, status: 'ready', error: '', transactions, comandas };
}

export function setHistoryArchiveError({ since, until, error }) {
  archive = { ...createEmptyArchive(), since, until, status: 'error', error: String(error?.message || error || '') };
}

export function clearHistoryArchive() {
  archive = createEmptyArchive();
}

export function mergeWithArchive(localItems, archivedItems) {
  if (!archivedItems.length) {
    return localItems;
  }

  const localIds = new Set(localItems.map((item) => item.id));
  return [...localItems, ...archivedItems.filter((item) => !localIds.has(item.id))];
}

function createEmptyArchive() {
  return { since: null, until: null, status: 'idle', error: '', transactions: [], comandas: [] };
}
