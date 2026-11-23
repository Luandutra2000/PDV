// Realtime events say which rows changed. Reading only those rows (instead of
// the whole 60-day window on every sale, on every open device) keeps the
// server egress small: a full reload is still done at startup, on "Atualizar"
// and when the connection comes back.
const IN_FILTER_CHUNK = 50;

export function readRealtimeChange(payload) {
  const table = payload?.table || '';
  const newRow = payload?.new && Object.keys(payload.new).length ? payload.new : null;
  const oldRow = payload?.old && Object.keys(payload.old).length ? payload.old : null;
  return { table, row: newRow || oldRow || {} };
}

// Selects rows of `adapter.table` whose `column` is one of `values`.
// Works with the app REST client (selectRange) and supabase-js (in()).
export async function selectRowsByValues(client, adapter, column, values) {
  const unique = [...new Set(values.filter(Boolean).map(String))];
  const rows = [];

  for (let start = 0; start < unique.length; start += IN_FILTER_CHUNK) {
    const chunk = unique.slice(start, start + IN_FILTER_CHUNK);
    const table = client.from(adapter.table);
    let result;

    if (typeof table?.selectRange === 'function') {
      result = await table.selectRange(adapter.select || '*', 0, 999, {
        filters: [{ column, op: 'in', value: `(${chunk.map(quoteFilterValue).join(',')})` }],
        order: 'id.asc'
      });
    } else {
      const query = table?.select?.(adapter.select || '*');

      if (typeof query?.in !== 'function') {
        throw new Error('Cliente sem filtro por lista; usando leitura completa.');
      }

      result = await query.in(column, chunk);
    }

    if (result?.error) {
      throw result.error;
    }

    rows.push(...(Array.isArray(result?.data) ? result.data : []));
  }

  return rows;
}

export function mergeById(remoteItems, cachedItems) {
  const merged = new Map(cachedItems.map((item) => [item.id, item]));
  remoteItems.forEach((item) => merged.set(item.id, item));
  return Array.from(merged.values());
}

function quoteFilterValue(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
