import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const productionUrl = readArgument('--url') || 'https://pdv-qdelicia.vercel.app/';
const requestedRunId = readArgument('--run-id');
const cleanupRunId = readArgument('--cleanup');
const productionConfirmed = args.has('--confirm-production');
const batchSize = Number(readArgument('--batch-size') || 250);
const concurrency = Number(readArgument('--concurrency') || 8);

if (!productionConfirmed) {
  throw new Error('Use --confirm-production para confirmar que a carga pode gravar na producao.');
}

if (!/^https:\/\/pdv-qdelicia\.vercel\.app\/?$/i.test(productionUrl)) {
  throw new Error('A URL informada nao corresponde a producao autorizada.');
}

if (!Number.isInteger(batchSize) || batchSize < 25 || batchSize > 500) {
  throw new Error('--batch-size deve estar entre 25 e 500.');
}

if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
  throw new Error('--concurrency deve estar entre 1 e 12.');
}

const runtime = await loadRuntimeConfig(productionUrl);
const headers = {
  apikey: runtime.supabaseAnonKey,
  Authorization: `Bearer ${runtime.supabaseAnonKey}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=ignore-duplicates,return=minimal'
};
const restUrl = `${runtime.supabaseUrl.replace(/\/$/, '')}/rest/v1`;

if (cleanupRunId) {
  await cleanupRun(cleanupRunId);
  process.exit(0);
}

const runId = sanitizeRunId(requestedRunId || `qa50k-${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}`);
const prefix = `${runId}-`;
const product = await loadQaProduct();
const stages = [250, 2250, 10000];
const metrics = [];
let saleOffset = 0;

await writeManifest({
  runId,
  prefix,
  productionUrl,
  product,
  status: 'started',
  startedAt: new Date().toISOString(),
  cleanupCommand: `node scripts/production-load-test.mjs --url ${productionUrl} --cleanup ${runId} --confirm-production`
});

for (const stageSales of stages) {
  const stageStartedAt = Date.now();
  const records = buildStageRecords({ runId, product, offset: saleOffset, count: stageSales });
  const phaseMetrics = [];

  phaseMetrics.push(await insertBatches('commands', records.commands));
  phaseMetrics.push(await insertBatches('command_items', records.commandItems));
  phaseMetrics.push(await insertBatches('sales', records.sales));
  phaseMetrics.push(await insertBatches('sale_items', records.saleItems));
  saleOffset += stageSales;

  const counts = await countRunRows(prefix);
  assertCounts(counts, saleOffset);
  const stageMetric = {
    stageSales,
    stageOperations: stageSales * 4,
    cumulativeSales: saleOffset,
    cumulativeOperations: saleOffset * 4,
    durationMs: Date.now() - stageStartedAt,
    counts,
    phases: phaseMetrics
  };
  metrics.push(stageMetric);
  process.stdout.write(`${JSON.stringify(stageMetric)}\n`);
}

const result = {
  runId,
  prefix,
  status: 'passed',
  startedAt: new Date(Date.now() - metrics.reduce((sum, item) => sum + item.durationMs, 0)).toISOString(),
  finishedAt: new Date().toISOString(),
  sales: saleOffset,
  operations: saleOffset * 4,
  metrics,
  cleanupCommand: `node scripts/production-load-test.mjs --url ${productionUrl} --cleanup ${runId} --confirm-production`
};
await writeManifest(result);
process.stdout.write(`LOAD_TEST_PASSED ${runId} ${result.operations} operacoes\n`);

async function cleanupRun(targetRunId) {
  const safeRunId = sanitizeRunId(targetRunId);
  const targetPrefix = `${safeRunId}-`;
  const before = await countRunRows(targetPrefix);

  await deleteRows('sale_items', 'sale_id', targetPrefix);
  await deleteRows('sales', 'id', targetPrefix);
  await deleteRows('command_items', 'command_id', targetPrefix);
  await deleteRows('commands', 'id', targetPrefix);

  const after = await countRunRows(targetPrefix);
  if (Object.values(after).some((count) => count !== 0)) {
    throw new Error(`Limpeza incompleta: ${JSON.stringify(after)}`);
  }

  const result = {
    runId: safeRunId,
    status: 'cleaned',
    cleanedAt: new Date().toISOString(),
    removed: before,
    remaining: after
  };
  await writeManifest(result);
  process.stdout.write(`LOAD_TEST_CLEANED ${safeRunId} ${JSON.stringify(before)}\n`);
}

function buildStageRecords({ runId: targetRunId, product: targetProduct, offset, count }) {
  const commands = [];
  const commandItems = [];
  const sales = [];
  const saleItems = [];
  const timestamp = new Date().toISOString();

  for (let localIndex = 0; localIndex < count; localIndex += 1) {
    const index = offset + localIndex;
    const suffix = String(index).padStart(5, '0');
    const commandId = `${targetRunId}-cmd-${suffix}`;
    const saleId = `${targetRunId}-sale-${suffix}`;
    const commandNumber = 9000000 + index;

    commands.push({
      id: commandId,
      number: commandNumber,
      status: 'fechada',
      total: 0.01,
      payment_method: 'pix',
      received_amount: 0.01,
      change_amount: 0,
      created_at: timestamp,
      updated_at: timestamp,
      closed_at: timestamp
    });
    commandItems.push({
      id: randomUUID(),
      command_id: commandId,
      product_id: targetProduct.id,
      name: `[LOAD ${targetRunId}] ${targetProduct.name}`,
      quantity: 1,
      unit_price: 0.01,
      total: 0.01,
      created_at: timestamp
    });
    sales.push({
      id: saleId,
      status: 'ativa',
      command_id: commandId,
      command_number: commandNumber,
      total: 0.01,
      payment_method: 'pix',
      received_amount: 0.01,
      change_amount: 0,
      created_at: timestamp
    });
    saleItems.push({
      id: `${saleId}-item-0`,
      sale_id: saleId,
      product_id: targetProduct.id,
      name: `[LOAD ${targetRunId}] ${targetProduct.name}`,
      quantity: 1,
      unit_price: 0.01,
      total: 0.01
    });
  }

  return { commands, commandItems, sales, saleItems };
}

async function insertBatches(table, rows) {
  const batches = chunk(rows, batchSize);
  const latencies = [];
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const batchIndex = cursor;
      cursor += 1;
      const startedAt = Date.now();
      const response = await fetch(`${restUrl}/${table}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(batches[batchIndex]),
        signal: AbortSignal.timeout(30000)
      });
      const latencyMs = Date.now() - startedAt;
      latencies.push(latencyMs);
      if (!response.ok) {
        throw new Error(`${table} lote ${batchIndex + 1}/${batches.length}: HTTP ${response.status} ${await response.text()}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, () => worker()));
  latencies.sort((left, right) => left - right);
  return {
    table,
    rows: rows.length,
    requests: batches.length,
    averageMs: round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    maxMs: latencies.at(-1) || 0
  };
}

async function countRunRows(targetPrefix) {
  const [commands, commandItems, sales, saleItems] = await Promise.all([
    countRows('commands', 'id', targetPrefix),
    countRows('command_items', 'command_id', targetPrefix),
    countRows('sales', 'id', targetPrefix),
    countRows('sale_items', 'sale_id', targetPrefix)
  ]);
  return { commands, commandItems, sales, saleItems };
}

async function countRows(table, column, targetPrefix) {
  const url = new URL(`${restUrl}/${table}`);
  url.searchParams.set(column, `like.${targetPrefix}*`);
  url.searchParams.set('select', 'id');
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { ...headers, Prefer: 'count=exact' },
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    throw new Error(`Contagem ${table}: HTTP ${response.status} ${await response.text()}`);
  }
  const contentRange = response.headers.get('content-range') || '';
  const total = Number(contentRange.split('/')[1]);
  if (!Number.isFinite(total)) {
    throw new Error(`Contagem invalida para ${table}: ${contentRange}`);
  }
  return total;
}

async function deleteRows(table, column, targetPrefix) {
  const cleanupBatchSize = 200;

  while (true) {
    const selectUrl = new URL(`${restUrl}/${table}`);
    selectUrl.searchParams.set(column, `like.${targetPrefix}*`);
    selectUrl.searchParams.set('select', 'id');
    selectUrl.searchParams.set('limit', String(cleanupBatchSize));
    const selectResponse = await fetch(selectUrl, {
      headers,
      signal: AbortSignal.timeout(30000)
    });

    if (!selectResponse.ok) {
      throw new Error(`Selecao para limpeza ${table}: HTTP ${selectResponse.status} ${await selectResponse.text()}`);
    }

    const rows = await selectResponse.json();
    if (!rows.length) {
      return;
    }

    const deleteUrl = new URL(`${restUrl}/${table}`);
    deleteUrl.searchParams.set('id', `in.(${rows.map((row) => quoteFilterValue(row.id)).join(',')})`);
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(30000)
    });

    if (!deleteResponse.ok) {
      throw new Error(`Limpeza ${table}: HTTP ${deleteResponse.status} ${await deleteResponse.text()}`);
    }
  }
}

function quoteFilterValue(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function assertCounts(counts, expected) {
  for (const [table, count] of Object.entries(counts)) {
    if (count !== expected) {
      throw new Error(`Integridade falhou em ${table}: esperado ${expected}, encontrado ${count}.`);
    }
  }
}

async function loadQaProduct() {
  const url = new URL(`${restUrl}/products`);
  url.searchParams.set('id', 'eq.qa-produto-sync-20260804');
  url.searchParams.set('select', 'id,name');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Produto QA: HTTP ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  if (rows.length !== 1) {
    throw new Error('Produto QA exclusivo nao encontrado.');
  }
  return rows[0];
}

async function loadRuntimeConfig(url) {
  const response = await fetch(new URL('/src/config/runtime-config.js', url), { signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    throw new Error(`Runtime config: HTTP ${response.status}`);
  }
  const source = await response.text();
  const match = source.match(/globalThis\.__PDV_RUNTIME_CONFIG__\s*=\s*({[\s\S]*?});/);
  if (!match) {
    throw new Error('Configuracao de producao invalida.');
  }
  const config = JSON.parse(match[1]);
  if (config.dataProvider !== 'supabase' || !config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('Producao nao esta configurada para Supabase.');
  }
  return config;
}

async function writeManifest(payload) {
  const directory = resolve('backups', 'load-tests');
  await mkdir(directory, { recursive: true });
  const targetRunId = sanitizeRunId(payload.runId);
  await writeFile(resolve(directory, `${targetRunId}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sanitizeRunId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^qa50k-[a-z0-9-]{6,48}$/.test(normalized)) {
    throw new Error('run-id invalido; use o prefixo qa50k-.');
  }
  return normalized;
}

function chunk(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function percentile(sortedValues, ratio) {
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)] || 0;
}

function round(value) {
  return Math.round(value * 10) / 10;
}
