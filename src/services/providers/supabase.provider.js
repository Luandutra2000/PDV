export function mapProductToSupabase(product) {
  return {
    id: product.id,
    name: product.name,
    category_id: product.categoryId,
    price: product.price,
    cost: product.cost,
    stock: product.stock,
    active: product.active,
    aliases: product.aliases || [],
    favorite: product.favorite
  };
}

export function mapProductFromSupabase(row) {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    price: Number(row.price || 0),
    cost: Number(row.cost || 0),
    stock: Number(row.stock || 0),
    active: Boolean(row.active),
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    favorite: Boolean(row.favorite)
  };
}

export function mapSaleToSupabase(sale, createItemId = () => globalThis.crypto.randomUUID()) {
  return {
    sale: {
      id: sale.id,
      status: sale.status || 'ativa',
      comanda_id: sale.comandaId || null,
      comanda_number: Number.isFinite(Number(sale.comandaNumber)) ? Number(sale.comandaNumber) : null,
      total: roundMoney(sale.total),
      payment_method: sale.paymentMethod,
      received_amount: roundMoney(sale.receivedAmount),
      change_amount: roundMoney(sale.change),
      created_at: sale.createdAt,
      canceled_at: sale.canceledAt || null
    },
    items: (sale.items || []).map((item) => ({
      id: createItemId(),
      sale_id: sale.id,
      product_id: item.productId,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: roundMoney(item.unitPrice),
      total: roundMoney(item.total)
    }))
  };
}

export function mapCashMovementToSupabase(movement) {
  return {
    id: movement.id,
    type: movement.type,
    status: movement.status || 'ativa',
    amount: roundMoney(movement.amount),
    category: movement.category || 'sem-categoria',
    description: movement.description || '',
    user_name: movement.userName || 'Local',
    created_at: movement.createdAt,
    canceled_at: movement.canceledAt || null
  };
}

export function mapCashClosingToSupabase(closing) {
  return {
    id: closing.id,
    status: closing.status || 'fechado',
    totals: closing.totals || {},
    payments: closing.payments || {},
    showcase: closing.showcase || [],
    differences: closing.differences || [],
    input: closing.input || {},
    created_at: closing.createdAt || closing.closedAt,
    closed_at: closing.closedAt,
    updated_at: closing.updatedAt || closing.closedAt
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function createSupabaseProvider(client) {
  return {
    mode: 'supabase',
    async getProducts() {
      const { data, error } = await client.from('products').select('*').order('name');

      if (error) {
        throw new Error(error.message);
      }

      return data.map(mapProductFromSupabase);
    }
  };
}
