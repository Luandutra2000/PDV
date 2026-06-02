function createCommandItemId(commandId, item, index) {
  return createDeterministicUuid(`${commandId}:${item.productId || 'item'}:${index}`);
}

function createDeterministicUuid(value) {
  const bytes = [];
  let hash = 0x811c9dc5;

  for (let seed = 0; seed < 4; seed += 1) {
    hash ^= seed;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    bytes.push(
      (hash >>> 24) & 0xff,
      (hash >>> 16) & 0xff,
      (hash >>> 8) & 0xff,
      hash & 0xff
    );
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
