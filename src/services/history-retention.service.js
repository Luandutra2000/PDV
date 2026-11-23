import { STORAGE_KEYS } from '../database/schema.js?v=20260804-06';
import { readLocalCache, runLocalTransaction, setLocalCache } from './providers/local.provider.js?v=20261123-01';
import { fetchFinancialHistoryRange, getFinancialSyncStatus } from './financial-sync.service.js?v=20261123-01';
import { getShowcaseSyncStatus } from './showcase-sync.service.js?v=20261123-01';
import { getHistoryCutoff, isHistoryWindowActive } from './history-window.service.js?v=20261123-01';
import {
  getHistoryArchiveState,
  setHistoryArchiveData,
  setHistoryArchiveError,
  setHistoryArchiveLoading
} from './history-archive.store.js?v=20261123-01';

// Local collections that grow with every sale and the date that ages them.
const PRUNABLE_COLLECTIONS = [
  [STORAGE_KEYS.transactions, (item) => item.createdAt],
  [STORAGE_KEYS.closedComandas, (item) => item.closedAt || item.createdAt],
  [STORAGE_KEYS.cashClosings, (item) => item.closedAt || item.createdAt],
  [STORAGE_KEYS.showcaseMovements, (item) => item.createdAt],
  [STORAGE_KEYS.outOfStockSales, (item) => item.createdAt],
  [STORAGE_KEYS.auditLogs, (item) => item.createdAt]
];

// Removes from this device what is older than the retention window. Runs only
// in the online mode and only when nothing is waiting to be sent, so every
// removed record already exists on the server.
export function pruneLocalHistory({ now = new Date() } = {}) {
  if (!isHistoryWindowActive()) {
    return { pruned: 0, skipped: 'offline-mode' };
  }

  if (getFinancialSyncStatus().pending > 0 || getShowcaseSyncStatus().pending > 0) {
    return { pruned: 0, skipped: 'pending-sync' };
  }

  const cutoff = getHistoryCutoff(now).getTime();
  const session = readLocalCache(STORAGE_KEYS.cashSession, null);
  const sessionStart = session?.status === 'aberto' ? Date.parse(session.openedAt || '') : NaN;
  const keepFrom = Number.isFinite(sessionStart) ? Math.min(cutoff, sessionStart) : cutoff;
  let pruned = 0;

  runLocalTransaction(() => {
    for (const [key, getDate] of PRUNABLE_COLLECTIONS) {
      const items = readLocalCache(key, null);

      if (!Array.isArray(items)) {
        continue;
      }

      const kept = items.filter((item) => shouldKeep(item, getDate(item), keepFrom));

      if (kept.length !== items.length) {
        pruned += items.length - kept.length;
        setLocalCache(key, kept);
      }
    }
  });

  return { pruned, skipped: '' };
}

// Loads from the server the part of [since, until] that is older than the
// local window, for reports. The result stays in memory only.
export async function loadArchivedHistory({ since, until } = {}) {
  if (!isHistoryWindowActive() || !since) {
    return getHistoryArchiveState();
  }

  const range = getArchiveRange({ since, until });

  if (!range) {
    return getHistoryArchiveState();
  }

  const current = getHistoryArchiveState();

  if (current.since === range.since && current.until === range.until && current.status !== 'error') {
    return current;
  }

  setHistoryArchiveLoading(range);

  try {
    const { transactions, comandas } = await fetchFinancialHistoryRange(range);
    const latest = getHistoryArchiveState();

    if (latest.since === range.since && latest.until === range.until) {
      setHistoryArchiveData({ ...range, transactions, comandas });
    }
  } catch (error) {
    setHistoryArchiveError({ ...range, error });
  }

  return getHistoryArchiveState();
}

// The part of [since, until] older than the local window, or null.
export function getArchiveRange({ since, until } = {}) {
  const cutoff = getHistoryCutoff();
  const start = since ? new Date(since) : null;

  if (!start || start >= cutoff) {
    return null;
  }

  const end = until && new Date(until) < cutoff ? new Date(until) : cutoff;
  return { since: start.toISOString(), until: end.toISOString() };
}

export function needsArchivedHistory(since) {
  return isHistoryWindowActive() && Boolean(since) && new Date(since) < getHistoryCutoff();
}

function shouldKeep(item, dateValue, keepFrom) {
  if (!item || item.syncPending || item.pendingSync === true) {
    return true;
  }

  const time = Date.parse(dateValue || '');
  return !Number.isFinite(time) || time >= keepFrom;
}
