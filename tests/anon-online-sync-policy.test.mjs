import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const migration = await readFile(new URL('../supabase/migrations/202609100001_secure_authenticated_online_sync.sql', import.meta.url), 'utf8')
  .catch(() => '');

[
  'categories',
  'products',
  'commands',
  'command_items',
  'sales',
  'sale_items',
  'cash_movements',
  'cash_closings',
  'stock_production',
  'showcase_write_offs'
].forEach((table) => {
  assert(migration.includes(`'${table}'`), `secure sync migration should cover ${table}`);
});

assert(migration.includes('revoke all on table'), 'secure sync migration should revoke anon table access');
assert(migration.includes("roles @> array['anon']::name[]"), 'secure sync migration should remove legacy anon policies');
assert(migration.includes('grant select, insert, update, delete on table'), 'authenticated sync should retain table grants');
assert(!migration.match(/for\s+(select|insert|update|delete).*to\s+anon/i), 'secure sync migration must not create anon policies');

const nullableMigration = await readFile(new URL('../supabase/migrations/202606030003_allow_local_sync_without_auth_uid.sql', import.meta.url), 'utf8')
  .catch(() => '');
const schemaAlignmentMigration = await readFile(new URL('../supabase/migrations/202606030004_align_remote_sales_schema.sql', import.meta.url), 'utf8')
  .catch(() => '');
const itemSnapshotMigration = await readFile(new URL('../supabase/migrations/20260608154723_allow_sale_item_product_snapshot.sql', import.meta.url), 'utf8')
  .catch(() => '');
const financialDeleteMigration = await readFile(new URL('../supabase/migrations/20260608162457_allow_financial_history_delete.sql', import.meta.url), 'utf8')
  .catch(() => '');
const catalogDeleteMigration = await readFile(new URL('../supabase/migrations/20260610130251_allow_catalog_delete_sync.sql', import.meta.url), 'utf8')
  .catch(() => '');
const catalogHardDeleteMigration = await readFile(new URL('../supabase/migrations/20260807230000_allow_product_catalog_hard_delete.sql', import.meta.url), 'utf8')
  .catch(() => '');

[
  'sales',
  'cash_movements',
  'cash_closings',
  'stock_production'
].forEach((table) => {
  assert(nullableMigration.includes(`public.${table} alter column created_by drop not null`), `local sync migration should allow ${table}.created_by to be null`);
});

assert(schemaAlignmentMigration.includes('add column if not exists command_id'), 'remote schema alignment should add sales.command_id');
assert(schemaAlignmentMigration.includes('add column if not exists command_number'), 'remote schema alignment should add sales.command_number');
assert(schemaAlignmentMigration.includes('alter table public.sale_items alter column id type text'), 'remote schema alignment should allow deterministic sale item ids');
assert(itemSnapshotMigration.includes('drop constraint if exists command_items_product_id_fkey'), 'command item snapshots should not fail when a local product id is missing remotely');
assert(itemSnapshotMigration.includes('drop constraint if exists sale_items_product_id_fkey'), 'sale item snapshots should not fail when a local product id is missing remotely');
assert(financialDeleteMigration.includes('grant delete on table'), 'financial history cleanup should grant delete on remote history tables');
assert(financialDeleteMigration.includes('for delete to anon'), 'financial history cleanup should allow browser delete policies');
assert(catalogDeleteMigration.includes('grant delete on table public.products to anon'), 'catalog delete sync should grant product deletes');
assert(catalogDeleteMigration.includes('grant delete on table public.categories to anon'), 'catalog delete sync should grant category deletes');
assert(catalogDeleteMigration.includes('for delete to anon'), 'catalog delete sync should allow browser delete policies');
assert(!catalogDeleteMigration.includes('public.sales'), 'catalog delete sync should not open sale deletes');
assert(!catalogDeleteMigration.includes('public.cash_movements'), 'catalog delete sync should not open cash movement deletes');
assert(catalogHardDeleteMigration.includes('stock_production_product_id_fkey'), 'catalog hard delete should remove stock product FK blockers');
assert(catalogHardDeleteMigration.includes('showcase_write_offs_product_id_fkey'), 'catalog hard delete should remove showcase product FK blockers');

const legacyAnonMigration = await readFile(new URL('../supabase/migrations/202606030002_restore_anon_online_sync.sql', import.meta.url), 'utf8')
  .catch(() => '');
assert(legacyAnonMigration.includes('to anon'), 'legacy migration should remain traceable for audit');

console.log('anon online sync policy ok');
