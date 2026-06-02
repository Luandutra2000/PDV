export const productAdapter = {
  table: 'products',
  cacheKey: 'pdv.products',
  queueKey: 'pdv.syncQueue.products',
  select: 'id,name,category_id,price,cost,stock,active,aliases,favorite',
  fromRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      categoryId: row.category_id || 'sem-categoria',
      price: Number(row.price) || 0,
      cost: Number(row.cost) || 0,
      stock: Number(row.stock) || 0,
      active: row.active !== false,
      aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
      favorite: Boolean(row.favorite)
    };
  },
  toRow(product) {
    return {
      id: product.id,
      name: String(product.name || '').trim(),
      category_id: product.categoryId || 'sem-categoria',
      price: Number(product.price) || 0,
      cost: Number(product.cost) || 0,
      stock: Number(product.stock) || 0,
      active: product.active !== false,
      aliases: Array.isArray(product.aliases)
        ? product.aliases.map((alias) => String(alias).trim()).filter(Boolean)
        : [],
      favorite: Boolean(product.favorite)
    };
  }
};

export const { fromRow, toRow } = productAdapter;
