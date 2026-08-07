import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260807234500_allow_out_of_stock_sale_product_delete.sql', import.meta.url),
  'utf8'
);

assert.match(migration, /alter table if exists public\.out_of_stock_sales/i, 'migration should target out-of-stock sales');
assert.match(migration, /drop constraint if exists out_of_stock_sales_product_id_fkey/i, 'migration should remove the blocking product FK');
assert.match(migration, /comment on column public\.out_of_stock_sales\.product_id/i, 'migration should document the historical snapshot');
assert(!migration.includes('delete from public.out_of_stock_sales'), 'migration must preserve out-of-stock history');
assert(!migration.includes('cascade'), 'migration must not cascade-delete historical sales');

console.log('out-of-stock sale delete migration ok');
