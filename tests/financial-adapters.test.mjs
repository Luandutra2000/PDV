const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const saleAdapter = await import('../src/services/repositories/sale.adapter.js');
const saleItemAdapter = await import('../src/services/repositories/sale-item.adapter.js');
const cashMovementAdapter = await import('../src/services/repositories/cash-movement.adapter.js');
const commandAdapter = await import('../src/services/repositories/command.adapter.js');
const commandItemAdapter = await import('../src/services/repositories/command-item.adapter.js');
const cashClosingAdapter = await import('../src/services/repositories/cash-closing.adapter.js');

const sale = {
  id: 'sale-1',
  status: 'ativa',
  comandaId: 'comanda-1',
  comandaNumber: 12,
  total: '38.50',
  paymentMethod: 'dinheiro',
  receivedAmount: '50',
  change: '11.50',
  createdBy: 'user-1',
  createdAt: '2026-06-02T10:00:00.000Z'
};
const saleRow = saleAdapter.toRow(sale);
assert(saleRow.command_id === 'comanda-1', 'sale comandaId should map to command_id');
assert(saleRow.command_number === 12, 'sale comandaNumber should map to command_number');
assert(saleRow.received_amount === 50, 'sale receivedAmount should map numeric');
assert(saleRow.change_amount === 11.5, 'sale change should map numeric');
assert(saleAdapter.fromRow(saleRow).comandaId === 'comanda-1', 'sale row should map command_id back');

const saleItemRow = saleItemAdapter.toRows({
  id: 'sale-1',
  items: [
    { productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 },
    { productId: 'batata', name: 'Batata', quantity: 1, price: 14, total: 14 }
  ]
});
assert(saleItemRow[0].id === 'sale-1-x-burger-0', 'sale item id should be deterministic');
assert(saleItemRow[1].unit_price === 14, 'sale item should accept price fallback');
assert(saleItemAdapter.fromRows(saleItemRow, 'sale-1').length === 2, 'sale item rows should map back');

const movementRow = cashMovementAdapter.toRow({
  id: 'entrada-1',
  type: 'entrada',
  status: 'ativa',
  amount: '20',
  category: 'troco',
  description: 'Troco inicial',
  userName: 'Luan',
  createdBy: 'user-1',
  createdAt: '2026-06-02T09:00:00.000Z'
});
assert(movementRow.user_name === 'Luan', 'movement userName should map to user_name');
assert(cashMovementAdapter.fromRow(movementRow).amount === 20, 'movement row amount should map numeric');

const commandRow = commandAdapter.toRow({
  id: 'comanda-1',
  number: 12,
  status: 'fechada',
  total: 38.5,
  paymentMethod: 'dinheiro',
  receivedAmount: 50,
  change: 11.5,
  createdAt: '2026-06-02T09:50:00.000Z',
  updatedAt: '2026-06-02T10:00:00.000Z',
  closedAt: '2026-06-02T10:00:00.000Z'
});
assert(commandRow.payment_method === 'dinheiro', 'command paymentMethod should map');
assert(commandAdapter.fromRow(commandRow).paymentMethod === 'dinheiro', 'command row should map back');

const commandItemRows = commandItemAdapter.toRows({
  id: 'comanda-1',
  items: [{ productId: 'x-burger', name: 'X-Burger', quantity: 2, unitPrice: 16, total: 32 }]
});
assert(commandItemRows[0].id === 'comanda-1-x-burger-0', 'command item id should be deterministic');
assert(commandItemAdapter.fromRows(commandItemRows, 'comanda-1')[0].productId === 'x-burger', 'command item rows should map back');

const closingRow = cashClosingAdapter.toRow({
  id: 'closing-1',
  status: 'fechado',
  totals: { sales: 100 },
  payments: { expectedCash: 50 },
  showcase: [{ productId: 'x-burger' }],
  differences: [{ scope: 'payment' }],
  input: { countedCash: 48 },
  createdBy: 'user-1',
  createdAt: '2026-06-02T11:00:00.000Z',
  closedAt: '2026-06-02T11:05:00.000Z',
  updatedAt: '2026-06-02T11:05:00.000Z'
});
assert(closingRow.totals.sales === 100, 'closing totals should stay JSON');
assert(cashClosingAdapter.fromRow(closingRow).payments.expectedCash === 50, 'closing payments should map back');

console.log('financial adapters ok');
