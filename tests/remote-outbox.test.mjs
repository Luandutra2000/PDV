import assert from 'node:assert/strict';
import test from 'node:test';

test('sales, movements, cancels and closings reach the server even after a network failure', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };

  const tables = { sales: new Map(), sale_items: new Map(), cash_movements: new Map(), cash_closings: new Map() };
  const calls = [];
  let online = false;

  const client = {
    from(table) {
      return {
        async upsert(rows, options) {
          calls.push(['upsert', table, options]);

          if (!online) {
            return { error: { message: 'TypeError: Failed to fetch' } };
          }

          (Array.isArray(rows) ? rows : [rows]).forEach((row) => {
            if (!tables[table].has(row.id)) {
              tables[table].set(row.id, { ...row });
            }
          });
          return { error: null };
        },
        update(values) {
          return {
            eq(_column, id) {
              return {
                async select() {
                  if (!online) {
                    return { data: null, error: { message: 'Failed to fetch' } };
                  }

                  const row = tables[table].get(id);

                  if (!row) {
                    return { data: [], error: null };
                  }

                  Object.assign(row, values);
                  return { data: [{ id }], error: null };
                }
              };
            }
          };
        }
      };
    }
  };

  const outbox = await import('../src/services/remote-outbox.service.js');
  outbox.setRemoteOutboxClientForTests(client);

  const storage = await import('../src/services/storage.service.js');
  const products = await import('../src/services/product.service.js');
  const comandas = await import('../src/services/comanda.service.js');
  const transactions = await import('../src/services/transaction.service.js');
  const closing = await import('../src/services/cash-closing.service.js');

  storage.ensureSeedData();

  comandas.addItemQuantity(products.getProductById('x-burger'), 2);
  const sale = transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 50 });
  const movement = transactions.registerCashMovement({ type: 'saida', amount: 10, description: 'Sangria' });
  transactions.cancelTransaction(movement.id);
  const confirmed = closing.confirmClosing(closing.saveClosingDraft({ countedCash: 22 }));

  await outbox.flushRemoteOutbox();
  assert.equal(outbox.getRemoteOutbox().length, 4, 'nothing should be lost while offline');
  assert.equal(outbox.getRemoteOutboxStatus().failing, 1, 'only the first item is tried while offline');
  assert.match(outbox.getRemoteOutboxStatus().lastError, /fetch/);

  online = true;
  await outbox.flushRemoteOutbox();
  assert.equal(outbox.getRemoteOutbox().length, 0, 'outbox should empty once online');

  const savedSale = tables.sales.get(sale.id);
  assert.equal(savedSale.total, 32);
  assert.equal(savedSale.payment_method, 'dinheiro');
  assert.equal(savedSale.change_amount, 18);
  assert.equal(tables.sale_items.size, 1);
  assert.equal([...tables.sale_items.values()][0].quantity, 2);
  assert.equal(tables.cash_movements.get(movement.id).status, 'cancelada');
  assert.equal(tables.cash_closings.get(confirmed.id).closed_at, confirmed.closedAt);
  assert.ok(calls.every(([kind, , options]) => kind !== 'upsert' || options.ignoreDuplicates), 'uploads must be idempotent');

  transactions.cancelTransaction(sale.id);
  await outbox.flushRemoteOutbox();
  assert.equal(tables.sales.get(sale.id).status, 'cancelada', 'sale cancel should reach the server');
  assert.equal(outbox.getRemoteOutbox().length, 0);
});

test('status update stays queued when the server rejects it', async () => {
  const outbox = await import('../src/services/remote-outbox.service.js');
  const client = {
    from: () => ({
      update: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) })
    })
  };
  outbox.setRemoteOutboxClientForTests(client);
  outbox.enqueueRemote('saleStatus', { id: 'sale-x', status: 'cancelada', canceledAt: '2026-11-23T10:00:00.000Z' });
  await outbox.flushRemoteOutbox();

  const [item] = outbox.getRemoteOutbox();
  assert.equal(item.attempts, 1);
  assert.match(item.lastError, /permissao/);
});
