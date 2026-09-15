// Run with a locally installed @electric-sql/pglite module path as argv[2].
// Uses an isolated in-memory PostgreSQL database; never connects to Supabase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const original = fs.readFileSync(new URL('../supabase/migrations/202609120001_fix_online_sales_showcase_and_company.sql', import.meta.url), 'utf8');
const correctiveUrl = new URL('../supabase/migrations/202609150001_harden_showcase_operations.sql', import.meta.url);
const baseline = process.argv.includes('--baseline');
const db = new PGlite();
await db.exec('CREATE TABLE public.profiles (id uuid PRIMARY KEY); CREATE TABLE public.products (id text PRIMARY KEY); CREATE TABLE public.sales (id text PRIMARY KEY);');
await db.exec(original.slice(0, original.indexOf('grant usage')) + '\nCOMMIT;');
if (!baseline) await db.exec(fs.readFileSync(correctiveUrl, 'utf8'));
await db.exec("INSERT INTO products VALUES ('qa-product'); INSERT INTO sales VALUES ('sale-1'), ('sale-2'), ('sale-invalid');");
const rpc = async (name, input) => (await db.query(`SELECT public.${name}($1::jsonb) AS result`, [JSON.stringify(input)])).rows[0].result;
const available = async () => Number((await db.query('SELECT quantity_available FROM product_stock')).rows[0].quantity_available);
const production = { operationId: 'production', productId: 'qa-product', quantity: 10 };
await rpc('process_showcase_production', production);
assert.equal(await available(), 10);
assert.equal((await rpc('process_showcase_production', production)).reason, 'already-applied');
assert.equal(await available(), 10);
const sale = { operationId: 'sale-op', saleId: 'sale-1', items: [{ product_id: 'qa-product', quantity: 5, unit_price: 7.5 }] };
await rpc('process_showcase_sale', sale);
assert.equal(await available(), 5);
assert.equal((await rpc('process_showcase_sale', sale)).reason, 'already-applied');
assert.equal((await rpc('process_showcase_sale', { ...sale, operationId: 'different-retry-id' })).reason, 'already-applied');
assert.equal(await available(), 5, 'same sale identity must not decrement twice');
await rpc('reverse_showcase_sale', { operationId: 'reverse', saleId: 'sale-1' });
await rpc('reverse_showcase_sale', { operationId: 'reverse', saleId: 'sale-1' });
assert.equal(await available(), 10);
await rpc('process_showcase_sale', {
  operationId: 'camel', saleId: 'sale-2', items: [
    { productId: 'qa-product', quantity: 6, unitPrice: 5 },
    { productId: 'qa-product', quantity: 6, unitPrice: 10 }
  ]
});
assert.equal(await available(), 0);
const missing = (await db.query("SELECT quantity, unit_price, total_price FROM out_of_stock_sales WHERE sale_id='sale-2'")).rows[0];
assert.equal(Number(missing.quantity), 2);
assert.equal(Number(missing.unit_price), 7.5);
assert.equal(Number(missing.total_price), 15);
await assert.rejects(rpc('process_showcase_sale', { operationId: 'invalid', saleId: 'sale-invalid', items: [{ quantity: 1 }] }), /items|produto/i);
assert.equal(await available(), 0);
await rpc('adjust_showcase_stock', { operationId: 'adjust', productId: 'qa-product', quantityAvailable: 8 });
await rpc('adjust_showcase_stock', { operationId: 'adjust', productId: 'qa-product', quantityAvailable: 8 });
assert.equal(await available(), 8);
await db.close();

if (!baseline) {
  const duplicateDb = new PGlite();
  await duplicateDb.exec('CREATE TABLE public.product_stock (id text PRIMARY KEY, product_id text); INSERT INTO product_stock VALUES (\'a\', \'same\'), (\'b\', \'same\');');
  await assert.rejects(duplicateDb.exec(fs.readFileSync(correctiveUrl, 'utf8')), /duplic|unique/i);
  await duplicateDb.exec('ROLLBACK;');
  assert.equal((await duplicateDb.query('SELECT count(*) FROM product_stock')).rows[0].count, 2, 'migration must retain duplicate data for reconciliation');
  await duplicateDb.close();
}
console.log('PostgreSQL showcase contract, retry, reversal, weighted missing price and duplicate preservation verified');
