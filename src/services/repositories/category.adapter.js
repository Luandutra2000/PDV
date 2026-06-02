export const categoryAdapter = {
  table: 'categories',
  cacheKey: 'pdv.categories',
  queueKey: 'pdv.syncQueue.categories',
  select: 'id,name,show_in_showcase',
  fromRow(row) {
    return {
      id: row.id,
      name: String(row.name || '').trim(),
      showInShowcase: row.show_in_showcase !== false
    };
  },
  toRow(category) {
    return {
      id: category.id,
      name: String(category.name || '').trim(),
      show_in_showcase: category.showInShowcase !== false
    };
  }
};

export const { fromRow, toRow } = categoryAdapter;
