import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const appSource = await readFile(new URL('../src/app.js?v=20260804-06', import.meta.url), 'utf8');
const onlineDataSource = await readFile(new URL('../src/services/online-data.service.js?v=20260804-06', import.meta.url), 'utf8');
const dashboardSource = await readFile(new URL('../src/modules/dashboard/dashboard.module.js?v=20260804-06', import.meta.url), 'utf8');
const estoqueSource = await readFile(new URL('../src/modules/estoque/estoque.module.js?v=20260804-06', import.meta.url), 'utf8');
const mobileSource = await readFile(new URL('../src/modules/mobile/mobile-dashboard.module.js?v=20260804-06', import.meta.url), 'utf8');
const supabaseProviderSource = await readFile(new URL('../src/services/providers/supabase.provider.js?v=20260804-06', import.meta.url), 'utf8');
const realtimeMigration = await readFile(new URL('../supabase/migrations/202606030001_enable_financial_realtime.sql', import.meta.url), 'utf8')
  .catch(() => '');

assert(onlineDataSource.includes('syncCatalogNow'), 'online boot should flush pending catalog changes after login');
assert(onlineDataSource.includes('flushFinancialQueue'), 'online boot should flush pending sales and financial changes after login');
assert(onlineDataSource.indexOf('hydrateFinancialData({ includePending: true })') < onlineDataSource.indexOf('flushFinancialQueue()'), 'financial data should hydrate before flushing queued local changes');
assert(onlineDataSource.indexOf('flushFinancialQueue()') < onlineDataSource.lastIndexOf('hydrateFinancialData({ includePending: true })'), 'financial data should hydrate again after flushing the queue');
assert(onlineDataSource.includes('STORAGE_KEYS.stockLaunches'), 'online boot should hydrate stock launches from the database');
assert(onlineDataSource.includes('STORAGE_KEYS.showcaseWriteOffs'), 'online boot should hydrate showcase write offs from the database');
assert(appSource.includes('hydrateOnlineOperationalData'), 'app boot should hydrate online operational data');
assert(dashboardSource.includes('hydrateOnlineOperationalData'), 'transaction history should refresh from the database when opened');
assert(estoqueSource.includes('hydrateOnlineOperationalData'), 'showcase module should refresh from the database when opened');
assert(mobileSource.includes('hydrateOnlineOperationalData'), 'owner app should refresh history and showcase from the database when opened');
assert(supabaseProviderSource.includes('unmap: (row) => ({'), 'supabase provider should map remote operational rows back to local format');
assert(supabaseProviderSource.includes('dataHora: row.created_at'), 'stock launches should hydrate from remote created_at');
assert(supabaseProviderSource.includes('productId: row.product_id'), 'showcase write offs should hydrate remote product ids');

[
  'commands',
  'command_items',
  'sales',
  'sale_items',
  'cash_movements',
  'cash_closings'
].forEach((table) => {
  assert(realtimeMigration.includes(`'${table}'`), `realtime migration should include ${table}`);
});
assert(realtimeMigration.includes('pg_publication_tables'), 'realtime migration should avoid adding tables twice');
assert(realtimeMigration.includes('alter publication supabase_realtime add table public.%I'), 'realtime migration should publish listed tables');

console.log('online sync bootstrap ok');
