import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const seed = await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const resetScript = await readFile(new URL('../scripts/reset-supabase-homologation.ps1', import.meta.url), 'utf8');
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');

assert(config.includes('sql_paths = ["./seed.sql"]'), 'Supabase config should enable the QA seed');
assert(seed.includes("'qa-ultimo-item'"), 'seed should include a one-unit concurrency product');
assert(seed.includes("'qa-sem-estoque'"), 'seed should include an out-of-stock product');
assert(seed.includes('on conflict (id) do update'), 'seed should be idempotent');
assert(!/\b(truncate|drop table|delete from)\b/i.test(seed), 'seed should not contain destructive statements');
assert(!/service_role/i.test(seed), 'seed should not contain privileged keys');
assert(resetScript.includes("'inquppkbkmhnbtwpriuw'"), 'reset should protect the current project ref');
assert(resetScript.includes('SUPABASE_HOMOLOG_PROJECT_REF'), 'reset should require an explicit QA environment guard');
assert(resetScript.includes('$linkedProjectRef -ne $normalizedExpectedRef'), 'reset should compare linked and expected refs');
assert(resetScript.includes('supabase db reset --linked'), 'guarded script should reset only after validation');

console.log('homologation environment config ok');
