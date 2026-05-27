import { STORAGE_KEYS } from '../../database/schema.js';
import { createLocalProvider } from './local.provider.js';

const TABLE_MAPPERS = {
  [STORAGE_KEYS.categories]: {
    table: 'categories',
    map: (category) => ({
      id: category.id,
      name: category.name,
      show_in_showcase: category.showInShowcase !== false
    })
  },
  [STORAGE_KEYS.products]: {
    table: 'products',
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
    map: (launch) => ({
      id: launch.id,
      product_id: launch.produtoId || launch.productId,
      product_name: launch.produtoNome || launch.productName,
      category_id: launch.categoriaId || launch.categoryId,
      category_name: launch.categoriaNome || launch.categoryName,
      quantity: Number(launch.quantidade || launch.quantity) || 0,
      unit_value: Number(launch.valorUnitario || launch.unitValue) || 0,
      total_value: Number(launch.valorTotal || launch.totalValue) || 0,
      status: launch.status || 'ativo',
      created_at: launch.createdAt || new Date().toISOString(),
      canceled_at: launch.canceledAt || null
    })
  },
  [STORAGE_KEYS.showcaseWriteOffs]: {
    table: 'showcase_write_offs',
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
    })
  },
  [STORAGE_KEYS.cashClosings]: {
    table: 'cash_closings',
    map: (closing) => ({
      id: closing.id,
      status: closing.status || 'fechado',
      totals: closing.totals || {},
      payments: closing.payments || {},
      showcase: closing.showcase || [],
      differences: closing.differences || [],
      input: closing.input || {},
      created_at: closing.createdAt || closing.closedAt,
      closed_at: closing.closedAt || closing.createdAt || new Date().toISOString(),
      updated_at: closing.updatedAt || closing.closedAt || closing.createdAt
    })
  }
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
    flush() {
      return syncChain;
    }
  };
}

async function syncCollection(getClient, key, value) {
  const client = await getClient();

  if (!client) {
    return;
  }

  if (key === STORAGE_KEYS.transactions) {
    await syncTransactions(client, value);
    return;
  }

  const mapper = TABLE_MAPPERS[key];

  if (!mapper || !Array.isArray(value)) {
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
