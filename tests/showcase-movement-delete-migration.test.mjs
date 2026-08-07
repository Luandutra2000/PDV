import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260807233000_allow_showcase_movement_product_delete.sql', import.meta.url),
  'utf8'
);

assert.match(migration, /alter table if exists public\.showcase_movements/i, 'migration should target showcase movements');
assert.match(migration, /drop constraint if exists showcase_movements_product_id_fkey/i, 'migration should remove only the blocking product FK');
assert.match(migration, /comment on column public\.showcase_movements\.product_id/i, 'migration should document the historical snapshot');
assert(!migration.includes('delete from public.showcase_movements'), 'migration must preserve showcase movement history');
assert(!migration.includes('cascade'), 'migration must not cascade-delete historical movements');

console.log('showcase movement delete migration ok');
