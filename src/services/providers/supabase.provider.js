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
