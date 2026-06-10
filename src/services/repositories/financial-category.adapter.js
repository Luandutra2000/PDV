export const financialCategoryAdapter = {
  table: 'financial_categories',
  cacheKey: 'pdv.financialCategories',
  select: 'id,name,type,color,active,created_at,updated_at',
  fromRow(row) {
    return {
      id: row.id,
      name: row.name || '',
      type: row.type || 'both',
      color: row.color || '#ff6b1a',
      active: row.active !== false,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString()
    };
  },
  toRow(category) {
    return {
      id: category.id,
      name: category.name || '',
      type: category.type || 'both',
      color: category.color || '#ff6b1a',
      active: category.active !== false,
      created_at: category.createdAt || new Date().toISOString(),
      updated_at: category.updatedAt || new Date().toISOString()
    };
  }
};

export const { fromRow, toRow } = financialCategoryAdapter;
