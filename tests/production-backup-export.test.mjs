import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const directory = await mkdtemp(join(tmpdir(), 'pdv-backup-test-'));
const originalFetch = globalThis.fetch;
const originalArgv = process.argv;
const fetched = [];
try {
  globalThis.fetch = async (url, options) => {
    const endpoint = new URL(url);
    if (endpoint.pathname.endsWith('runtime-config.js')) {
      return new Response('globalThis.__PDV_RUNTIME_CONFIG__ = {"dataProvider":"supabase","supabaseUrl":"https://database.example.test","supabaseAnonKey":"test-public-key"};');
    }
    assert.equal(endpoint.origin, 'https://database.example.test');
    assert.equal(options?.method || 'GET', 'GET', 'export must remain read only');
    const table = endpoint.pathname.split('/').at(-1);
    fetched.push(table);
    return Response.json(table === 'empresa_configuracoes' ? [{ id: 'company', nome_fantasia: 'Loja de teste' }] : []);
  };
  process.argv = ['node', 'export-production-backup.mjs', 'https://shop.example.test', directory];
  await import('../scripts/export-production-backup.mjs');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  const company = manifest.tables.find(entry => entry.table === 'empresa_configuracoes');
  assert.equal(company?.rows, 1, 'remote backup must include company configuration');
  const payload = await readFile(join(directory, company.file), 'utf8');
  assert.equal(company.sha256, createHash('sha256').update(payload).digest('hex'));
  assert.equal(fetched.length, 24, 'all versioned public tables should be inventoried');
  assert.match(manifest.scope, /Auth.*Storage.*schema/);
} finally {
  globalThis.fetch = originalFetch;
  process.argv = originalArgv;
  await rm(directory, { recursive: true, force: true });
}
console.log('production backup export inventory ok');
