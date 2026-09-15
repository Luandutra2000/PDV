import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-06';
import { createLocalProvider, deferLocalEffect } from './local.provider.js?v=20260804-06';

const TABLE_MAPPERS = {
  [STORAGE_KEYS.categories]: {
    table: 'categories',
    select: 'id,name,show_in_showcase',
    map: (category) => ({
      id: category.id,
      name: category.name,
      show_in_showcase: category.showInShowcase !== false
    }),
    unmap: (row) => ({
      id: row.id,
      name: row.name,
      showInShowcase: row.show_in_showcase !== false
    })
  },
  [STORAGE_KEYS.products]: {
    table: 'products',
    select: 'id,name,category_id,price,cost,stock,active,aliases,favorite',
    map: (product) => ({
      id: product.id,
      name: product.name,
      category_id: product.categoryId,
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      stock: Number(product.stock) || 0,
      active: product.active !== false,
      aliases: product.aliases || [],
      favorite: Boolean(product.favorite)
    }),
    unmap: (row) => ({
      id: row.id,
      name: row.name,
      categoryId: row.category_id,
      price: Number(row.price) || 0,
      cost: Number(row.cost) || 0,
      stock: Number(row.stock) || 0,
      active: row.active !== false,
      aliases: Array.isArray(row.aliases) ? row.aliases : [],
      favorite: Boolean(row.favorite)
    })
  },
  [STORAGE_KEYS.stockLaunches]: {
    table: 'stock_production',
    select: 'id,product_id,product_name,category_id,category_name,quantity,unit_value,total_value,note,status,created_by,created_at,canceled_at',
    map: (launch) => ({
      id: launch.id,
      product_id: launch.produtoId || launch.productId,
      product_name: launch.produtoNome || launch.productName,
      category_id: launch.categoriaId || launch.categoryId,
      category_name: launch.categoriaNome || launch.categoryName,
      quantity: Number(launch.quantidade || launch.quantity) || 0,
      unit_value: Number(launch.valorUnitario || launch.unitValue) || 0,
      total_value: Number(launch.valorTotal || launch.totalValue) || 0,
      note: launch.note || launch.observacao || '',
      status: launch.status || 'ativo',
      created_by: launch.usuarioId || launch.createdBy || null,
      created_at: launch.dataHora || launch.createdAt || new Date().toISOString(),
      canceled_at: launch.canceledAt || null
    }),
    unmap: (row) => ({
      id: row.id,
      produtoId: row.product_id,
      produtoNome: row.product_name,
      categoriaId: row.category_id,
      categoriaNome: row.category_name,
      quantidade: Number(row.quantity) || 0,
      valorUnitario: Number(row.unit_value) || 0,
      valorTotal: Number(row.total_value) || 0,
      note: row.note || '',
      usuarioId: row.created_by || '',
      usuarioNome: '',
      dataHora: row.created_at,
      status: row.status || 'ativo',
      canceledAt: row.canceled_at || null
    })
  },
  [STORAGE_KEYS.showcaseWriteOffs]: {
    table: 'showcase_write_offs',
    select: 'id,product_id,product_name,category_id,category_name,quantity,unit_value,total_value,reason,note,status,created_at,canceled_at',
    map: (writeOff) => ({
      id: writeOff.id,
      product_id: writeOff.produtoId || writeOff.productId,
      product_name: writeOff.produtoNome || writeOff.productName,
      category_id: writeOff.categoriaId || writeOff.categoryId,
      category_name: writeOff.categoriaNome || writeOff.categoryName,
      quantity: Number(writeOff.quantidade || writeOff.quantity) || 0,
      unit_value: Number(writeOff.valorUnitario || writeOff.unitValue) || 0,
      total_value: Number(writeOff.valorTotal || writeOff.totalValue) || 0,
      reason: writeOff.reason || writeOff.motivo || 'ajuste',
      note: writeOff.note || writeOff.observacao || '',
      status: writeOff.status || 'ativa',
      created_at: writeOff.createdAt || new Date().toISOString(),
      canceled_at: writeOff.canceledAt || null
    }),
    unmap: (row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      categoryId: row.category_id,
      categoryName: row.category_name,
      quantity: Number(row.quantity) || 0,
      unitValue: Number(row.unit_value) || 0,
      totalValue: Number(row.total_value) || 0,
      reason: row.reason || 'ajuste',
      note: row.note || '',
      status: row.status || 'ativa',
      createdAt: row.created_at,
      canceledAt: row.canceled_at || null
    })
  },
  [STORAGE_KEYS.users]: {
    table: 'profiles',
    select: 'id,name,role_id,is_active,empresa_id,created_at,updated_at',
    unmap: (row) => ({
      id: row.id,
      name: row.name,
      username: row.email || '',
      role: row.role_id,
      empresaId: row.empresa_id || '',
      active: row.is_active !== false,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })
  },
  [STORAGE_KEYS.userPermissionOverrides]: {
    table: 'user_permission_overrides',
    select: 'user_id,permission_id,state',
    unmapCollection: (rows) => rows.reduce((result, row) => {
      if (!result[row.user_id]) {
        result[row.user_id] = {};
      }
      result[row.user_id][row.permission_id] = row.state;
      return result;
    }, {})
  },
  [STORAGE_KEYS.auditLogs]: {
    table: 'audit_logs',
    select: 'id,action,entity_type,entity_id,user_id,user_name,metadata,created_at',
    unmap: (row) => ({
      id: row.metadata?.clientAuditId || row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      userId: row.user_id,
      userName: row.user_name,
      metadata: row.metadata || {},
      reason: row.metadata?.reason || '',
      module: row.metadata?.module || '',
      details: row.metadata?.details || '',
      createdAt: row.created_at
    })
  },
};

export function createSupabaseProvider({ getClient, localProvider = createLocalProvider() }) {
  let syncChain = Promise.resolve();

  function scheduleSync(key, value) {
    syncChain = syncChain
      .then(() => key === STORAGE_KEYS.auditLogs
        ? syncAuditLogs(getClient, localProvider)
        : syncCollection(getClient, key, value))
      .catch((error) => {
        console.warn(`Nao foi possivel sincronizar ${key} com Supabase.`, error);
      });
  }

  return {
    mode: 'supabase',
    read(key, fallback = null) {
      return localProvider.read(key, fallback);
    },
    write(key, value) {
      if (key === STORAGE_KEYS.auditLogs && Array.isArray(value)) {
        const existing = new Map(localProvider.read(key, []).map((entry) => [entry.id, entry]));
        value = value.map((entry) => ({
          ...entry,
          pendingSync: existing.has(entry.id) ? existing.get(entry.id).pendingSync === true : true
        }));
      }
      const saved = localProvider.write(key, value);
      deferLocalEffect(() => scheduleSync(key, saved));
      return saved;
    },
    remove(key) {
      localProvider.remove(key);
    },
    clear() {
      localProvider.clear();
    },
    async hydrate(keys = [STORAGE_KEYS.categories, STORAGE_KEYS.products]) {
      const client = await getClient();

      if (!client) {
        return;
      }

      await Promise.all(keys.map((key) => hydrateCollection(client, localProvider, key)));
    },
    flush() {
      scheduleSync(STORAGE_KEYS.auditLogs);
      return syncChain;
    }
  };
}

async function hydrateCollection(client, localProvider, key) {
  const mapper = TABLE_MAPPERS[key];

  if (!mapper?.unmap && !mapper?.unmapCollection) {
    return;
  }

  const { data, error } = await client.from(mapper.table).select(mapper.select || '*');

  if (error) {
    throw error;
  }

  if (Array.isArray(data)) {
    let hydrated = mapper.unmapCollection ? mapper.unmapCollection(data) : data.map(mapper.unmap);
    if (key === STORAGE_KEYS.auditLogs) {
      const pending = localProvider.read(key, []).filter((entry) => entry.pendingSync === true);
      const pendingIds = new Set(pending.map((entry) => entry.id));
      hydrated = [...pending, ...hydrated.filter((entry) => !pendingIds.has(entry.id))];
    }
    localProvider.write(key, hydrated);
  }
}

async function syncCollection(getClient, key, value) {
  const mapper = TABLE_MAPPERS[key];

  if (!mapper?.map || !Array.isArray(value)) {
    return;
  }

  const client = await getClient();

  if (!client) {
    return;
  }

  const rows = value.map(mapper.map).filter((row) => row.id);

  if (!rows.length) {
    return;
  }

  await throwIfSupabaseError(client.from(mapper.table).upsert(rows));
}

async function throwIfSupabaseError(query) {
  const { error } = await query;

  if (error) {
    throw error;
  }
}

// Audit entries are append-only. The durable flag survives network failure and reload.
async function syncAuditLogs(getClient, localProvider) {
  const pending = localProvider.read(STORAGE_KEYS.auditLogs, []).filter((entry) => entry.pendingSync === true);
  if (!pending.length) return;
  const client = await getClient();
  const { data, error } = await client?.auth?.getSession?.() || {};
  if (error) throw error;
  const userId = data?.session?.user?.id;
  if (!userId) return;
  for (const entry of pending.filter((item) => item.userId === userId)) {
    const row = {
      id: await auditUuid(entry.id),
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId || null,
      user_id: userId,
      user_name: entry.userName || 'Sistema',
      metadata: { ...entry.metadata, reason: entry.reason || '', clientAuditId: entry.id },
      created_at: entry.createdAt
    };
    // ON CONFLICT requires SELECT under RLS; operators only need INSERT here.
    // The stable UUID makes a lost-response retry a primary-key collision.
    const { error: insertError } = await client.from('audit_logs').insert([row]);
    if (insertError && insertError.code !== '23505') throw insertError;
    const latest = localProvider.read(STORAGE_KEYS.auditLogs, []);
    localProvider.write(STORAGE_KEYS.auditLogs, latest.map((item) => item.id === entry.id ? { ...item, pendingSync: false } : item));
  }
}

async function auditUuid(id) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return id;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pdv-audit:${id}`)));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
