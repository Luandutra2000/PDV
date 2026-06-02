function createSaleItemId(saleId, item, index) {
  return `${saleId}-${item.productId || 'item'}-${index}`;
}

export const saleItemAdapter = {
  table: 'sale_items',
  select: 'id,sale_id,product_id,name,quantity,unit_price,total',
  fromRows(rows = [], saleId = '') {
    return rows
      .filter((row) => !saleId || row.sale_id === saleId)
      .map((row) => ({
        productId: row.product_id,
        name: row.name,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        total: Number(row.total) || 0
      }));
  },
  toRows(sale) {
    return (sale.items || []).map((item, index) => ({
      id: createSaleItemId(sale.id, item, index),
      sale_id: sale.id,
      product_id: item.productId,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unitPrice || item.price) || 0,
      total: Number(item.total) || 0
    }));
  }
};

export const { fromRows, toRows } = saleItemAdapter;
