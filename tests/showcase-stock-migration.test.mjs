import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationName = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('_add_showcase_stock_sync.sql'))
  .sort()
  .at(-1);

if (!migrationName) {
  throw new Error('showcase stock migration should exist');
}

const sql = readFileSync(join('supabase/migrations', migrationName), 'utf8');
const normalizedSql = sql.replace(/\s+/g, ' ').toLowerCase();
const required = [
  'create table if not exists public.product_stock',
  'create table if not exists public.showcase_movements',
  'create table if not exists public.out_of_stock_sales',
  'alter table public.product_stock enable row level security',
  'alter table public.showcase_movements enable row level security',
  'alter table public.out_of_stock_sales enable row level security',
  'create or replace function public.process_showcase_sale',
  'create or replace function public.reverse_showcase_sale',
  'create or replace function public.process_showcase_production',
  'create or replace function public.adjust_showcase_stock',
  'alter publication supabase_realtime add table public.product_stock',
  'alter publication supabase_realtime add table public.showcase_movements',
  'alter publication supabase_realtime add table public.out_of_stock_sales'
];

for (const snippet of required) {
  if (!sql.includes(snippet)) {
    throw new Error(`migration missing: ${snippet}`);
  }
}

const protectionSnippets = [
  'with grouped_sale_items as',
  'sum(private.safe_showcase_numeric(raw_item->>\'quantity\', 0))::numeric(12,3) as quantity',
  'from grouped_sale_items where quantity > 0 loop',
  'where oos.sale_id = _sale_id and oos.status = \'ativa\'',
  '\'mov-reverse-out-\' || oos.sale_id || \'-\' || oos.product_id',
  '\'reverse-out-\' || oos.sale_id',
  'set search_path = \'\'',
  'grant execute on function public.process_showcase_production(jsonb) to authenticated',
  'grant execute on function public.process_showcase_sale(jsonb) to authenticated',
  'grant execute on function public.reverse_showcase_sale(jsonb) to authenticated',
  'grant execute on function public.adjust_showcase_stock(jsonb) to authenticated',
  'create unique index if not exists showcase_movements_reversed_movement_uidx',
  'where reversed_movement_id is not null and movement_type = \'estorno_venda\'',
  'for update of sm',
  'private.safe_showcase_numeric',
  'private.safe_showcase_uuid',
  'private.safe_showcase_timestamptz'
];

for (const snippet of protectionSnippets) {
  if (!normalizedSql.includes(snippet)) {
    throw new Error(`migration missing protection: ${snippet}`);
  }
}

const forbiddenSnippets = [
  'grant select, insert, update, delete on public.product_stock to authenticated',
  'grant select, insert, update, delete on public.showcase_movements to authenticated',
  'grant select, insert, update, delete on public.out_of_stock_sales to authenticated',
  'for all to authenticated',
  'set search_path = public, private'
];

for (const snippet of forbiddenSnippets) {
  if (normalizedSql.includes(snippet)) {
    throw new Error(`migration has forbidden broad access: ${snippet}`);
  }
}

console.log('showcase stock migration ok');
