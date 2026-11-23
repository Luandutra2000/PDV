import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';

// Each device keeps only the recent history; everything stays on the server.
// Without this window every sync downloaded the whole history and the
// browser storage (about 5 million characters) filled up in a few weeks.
export const HISTORY_RETENTION_DAYS = 60;

// Tables whose rows are only read from the server inside the window.
// Child tables (items) follow the date of their parent row.
const HISTORY_WINDOWS = {
  sales: { column: 'created_at' },
  sale_items: { parent: 'sales', column: 'created_at' },
  commands: { column: 'created_at' },
  command_items: { parent: 'commands', column: 'created_at' },
  cash_movements: { column: 'created_at' },
  cash_closings: { column: 'closed_at' },
  showcase_movements: { column: 'created_at' },
  out_of_stock_sales: { column: 'created_at' },
  audit_logs: { column: 'created_at' }
};

export function isHistoryWindowActive() {
  return isSupabaseEnabled();
}

export function getHistoryCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - HISTORY_RETENTION_DAYS);
  return cutoff;
}

export function isWindowedTable(table) {
  return Object.hasOwn(HISTORY_WINDOWS, table);
}

// Returns how to read `table` limited to [since, until]. Without an explicit
// range it uses the retention window while the online mode is active.
export function getHistoryQuery(table, { since, until } = {}) {
  const window = HISTORY_WINDOWS[table];

  if (!window) {
    return null;
  }

  const start = since || (isHistoryWindowActive() ? getHistoryCutoff() : null);

  if (!start && !until) {
    return null;
  }

  const column = window.parent ? `${window.parent}.${window.column}` : window.column;
  const filters = [];

  if (start) {
    filters.push({ column, op: 'gte', value: new Date(start).toISOString() });
  }

  if (until) {
    filters.push({ column, op: 'lt', value: new Date(until).toISOString() });
  }

  return {
    selectSuffix: window.parent ? `,${window.parent}!inner(${window.column})` : '',
    filters
  };
}

// Applies the window to a supabase-js style query builder. Builders that do
// not support a filter (test doubles) are returned unchanged.
export function applyHistoryFilters(query, historyQuery) {
  let current = query;

  for (const { column, op, value } of historyQuery?.filters || []) {
    if (typeof current?.[op] === 'function') {
      current = current[op](column, value);
    }
  }

  return current;
}

export function isInsideHistoryWindow(value, now = new Date()) {
  const time = Date.parse(value || '');
  return !Number.isFinite(time) || time >= getHistoryCutoff(now).getTime();
}
