function createCommandItemId(commandId, item, index) {
  return `${commandId}-${item.productId || 'item'}-${index}`;
}

export const commandItemAdapter = {
  table: 'command_items',
  select: 'id,command_id,product_id,name,quantity,unit_price,total',
  fromRows(rows = [], commandId = '') {
    return rows
      .filter((row) => !commandId || row.command_id === commandId)
      .map((row) => ({
        productId: row.product_id,
        name: row.name,
        quantity: Number(row.quantity) || 0,
        unitPrice: Number(row.unit_price) || 0,
        total: Number(row.total) || 0
      }));
  },
  toRows(command) {
    return (command.items || []).map((item, index) => ({
      id: createCommandItemId(command.id, item, index),
      command_id: command.id,
      product_id: item.productId,
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit_price: Number(item.unitPrice || item.price) || 0,
      total: Number(item.total) || 0
    }));
  }
};

export const { fromRows, toRows } = commandItemAdapter;
