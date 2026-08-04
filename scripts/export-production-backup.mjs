import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const productionUrl = process.argv[2];
const outputDirectory = process.argv[3];
const environmentFile = process.argv[4];

if (!productionUrl || !outputDirectory) {
  throw new Error('Uso: node scripts/export-production-backup.mjs <url-producao> <diretorio-saida> [arquivo-env]');
}

const tables = [
  'roles',
  'permissions',
  'role_permissions',
  'profiles',
  'user_permission_overrides',
  'categories',
  'products',
  'cash_sessions',
  'commands',
  'command_items',
  'sales',
  'sale_items',
  'cash_movements',
  'cash_closings',
  'financial_categories',
  'financial_transactions',
  'stock_production',
  'product_stock',
  'showcase_movements',
  'showcase_write_offs',
  'out_of_stock_sales',
  'notifications',
  'audit_logs'
];

const runtimeUrl = new URL('/src/config/runtime-config.js', productionUrl);
const runtimeResponse = await fetch(runtimeUrl);
if (!runtimeResponse.ok) {
  throw new Error(`Falha ao obter configuracao de producao: HTTP ${runtimeResponse.status}`);
}

const runtimeSource = await runtimeResponse.text();
const configMatch = runtimeSource.match(/globalThis\.__PDV_RUNTIME_CONFIG__\s*=\s*({[\s\S]*?});/);
if (!configMatch) throw new Error('Configuracao de producao invalida.');

const config = JSON.parse(configMatch[1]);
if (config.dataProvider !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
  throw new Error('Producao nao esta configurada para Supabase.');
}

const protectedEnvironment = environmentFile ? parseEnvironment(await readFile(resolve(environmentFile), 'utf8')) : {};
const apiKey = protectedEnvironment.SUPABASE_SERVICE_ROLE_KEY
  || protectedEnvironment.VITE_SUPABASE_ANON_KEY
  || protectedEnvironment.SUPABASE_ANON_KEY
  || config.supabaseAnonKey;

const destination = resolve(outputDirectory);
await mkdir(destination, { recursive: true });

const headers = {
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json'
};
const manifest = {
  createdAt: new Date().toISOString(),
  source: new URL(productionUrl).origin,
  projectUrl: config.supabaseUrl,
  format: 'json',
  tables: []
};

for (const table of tables) {
  const rows = [];
  let offset = 0;
  let unavailable = false;

  while (true) {
    const endpoint = new URL(`/rest/v1/${table}`, config.supabaseUrl);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('limit', '1000');
    endpoint.searchParams.set('offset', String(offset));

    const response = await fetch(endpoint, { headers });
    if (response.status === 404 || response.status === 400) {
      unavailable = true;
      break;
    }
    if (!response.ok) {
      throw new Error(`Falha ao exportar ${table}: HTTP ${response.status}`);
    }

    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) break;
    offset += page.length;
  }

  if (unavailable) {
    manifest.tables.push({ table, status: 'unavailable', rows: 0 });
    continue;
  }

  const payload = `${JSON.stringify(rows, null, 2)}\n`;
  const file = `${table}.json`;
  const sha256 = createHash('sha256').update(payload).digest('hex');
  await writeFile(resolve(destination, file), payload, 'utf8');
  manifest.tables.push({ table, status: 'exported', rows: rows.length, file, sha256 });
}

const manifestPayload = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(resolve(destination, 'manifest.json'), manifestPayload, 'utf8');

const exported = manifest.tables.filter((entry) => entry.status === 'exported');
const unavailable = manifest.tables.filter((entry) => entry.status !== 'exported');
process.stdout.write(`Backup concluido: ${exported.length} tabelas, ${exported.reduce((sum, entry) => sum + entry.rows, 0)} registros.\n`);
if (unavailable.length) {
  process.stdout.write(`Tabelas indisponiveis: ${unavailable.map((entry) => entry.table).join(', ')}\n`);
}

function parseEnvironment(source) {
  return Object.fromEntries(String(source || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => {
      const separator = line.indexOf('=');
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      return [key, value];
    }));
}
