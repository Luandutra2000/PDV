import { STORAGE_KEYS } from '../../database/schema.js?v=20260804-06';
import { createLocalProvider } from './local.provider.js?v=20260804-06';

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
  [STORAGE_KEYS.closedComandas]: {
    table: 'commands',
    map: (command) => ({
      id: command.id,
      number: Number(command.number) || 0,
      status: command.status || 'fechada',
      total: Number(command.total) || 0,
      payment_method: command.paymentMethod || null,
      received_amount: Number(command.receivedAmount) || 0,
      change_amount: Number(command.change) || 0,
      created_at: command.createdAt || command.closedAt,
      updated_at: command.updatedAt || command.closedAt || command.createdAt,
      closed_at: command.closedAt || null,
      canceled_at: command.canceledAt || null
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
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      userId: row.user_id,
      userName: row.user_name,
      metadata: row.metadata || {},
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
      .then(() => syncCollection(getClient, key, value))
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
      const saved = localProvider.write(key, value);
      scheduleSync(key, saved);
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
    localProvider.write(
      key,
      mapper.unmapCollection ? mapper.unmapCollection(data) : data.map(mapper.unmap)
    );
  }
}

async function syncCollection(getClient, key, value) {
  if (key === STORAGE_KEYS.transactions) {
    const client = await getClient();

    if (!client) {
      return;
    }

    await syncTransactions(client, value);
    return;
  }

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

async function syncTransactions(client, transactions = []) {
  const sales = transactions.filter((item) => item.type === 'venda');
  const movements = transactions.filter((item) => item.type === 'entrada' || item.type === 'saida' || item.type === 'sangria');

  if (sales.length) {
    await throwIfSupabaseError(client.from('sales').upsert(sales.map(mapSale)));
    const saleItems = sales.flatMap((sale) => (sale.items || []).map((item) => mapSaleItem(sale, item)));

    if (saleItems.length) {
      await throwIfSupabaseError(client.from('sale_items').upsert(saleItems));
    }
  }

  if (movements.length) {
    await throwIfSupabaseError(client.from('cash_movements').upsert(movements.map(mapCashMovement)));
  }
}

function mapSale(sale) {
  return {
    id: sale.id,
    status: sale.status || 'ativa',
    command_id: sale.comandaId || null,
    command_number: Number(sale.comandaNumber) || null,
    total: Number(sale.total) || 0,
    payment_method: sale.paymentMethod,
    received_amount: Number(sale.receivedAmount) || 0,
    change_amount: Number(sale.change) || 0,
    created_at: sale.createdAt || new Date().toISOString(),
    canceled_at: sale.canceledAt || null
  };
}

function mapSaleItem(sale, item) {
  return {
    id: `${sale.id}-${item.productId}`,
    sale_id: sale.id,
    product_id: item.productId,
    name: item.name,
    quantity: Number(item.quantity) || 0,
    unit_price: Number(item.price || item.unitPrice) || 0,
    total: Number(item.total) || 0
  };
}

function mapCashMovement(movement) {
  return {
    id: movement.id,
    type: movement.type,
    status: movement.status || 'ativa',
    amount: Number(movement.amount) || 0,
    category: movement.category || 'sem-categoria',
    description: movement.description || '',
    user_name: movement.userName || 'Local',
    created_at: movement.createdAt || new Date().toISOString(),
    canceled_at: movement.canceledAt || null
  };
}

async function throwIfSupabaseError(query) {
  const { error } = await query;

  if (error) {
    throw error;
  }
}
