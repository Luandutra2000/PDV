import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
function createWorker(fetcher = async () => new Response('fresh')) {
  const handlers = {};
  const entries = new Map();
  const deleted = [];
  const requests = [];
  const cache = {
    put: async (request, response) => entries.set(request.url, response),
    match: async (request) => entries.get(typeof request === 'string' ? new URL(request, 'https://pdv.test/').href : request.url),
    addAll: async () => {}
  };
  const context = {
    self: { location: new URL('https://pdv.test/service-worker.js'), addEventListener: (type, handler) => { handlers[type] = handler; }, clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches: { open: async () => cache, keys: async () => ['pdv-old', 'unrelated-app-cache'], delete: async (key) => { deleted.push(key); }, match: cache.match },
    fetch: async (...args) => { requests.push(args); return fetcher(...args); },
    URL, Response
  };
  vm.runInNewContext(source, context);
  return { handlers, entries, deleted, requests };
}
function dispatch(worker, request) {
  const waits = [];
  let response;
  worker.handlers.fetch({ request, respondWith: (value) => { response = Promise.resolve(value); }, waitUntil: (value) => waits.push(value) });
  return { response, settled: async () => { if (response) await response; await Promise.all(waits); } };
}

test('backend, authentication and other origins bypass service worker caching', () => {
  const worker = createWorker();
  for (const url of [
    'https://project.supabase.co/rest/v1/sales', 'https://cdn.jsdelivr.net/library.js',
    'https://pdv.test/api/sales', 'https://pdv.test/auth/callback?code=secret',
    'https://pdv.test/?access_token=secret', 'https://pdv.test/src/app.js?token=secret'
  ]) {
    assert.equal(dispatch(worker, new Request(url)).response, undefined, url);
  }
  assert.equal(dispatch(worker, new Request('https://pdv.test/src/app.js', { headers: { Authorization: 'Bearer secret' } })).response, undefined);
  assert.equal(worker.requests.length, 0);
});

test('public asset refresh bypasses browser HTTP cache and preserves fresh offline copy', async () => {
  const worker = createWorker();
  const request = new Request('https://pdv.test/src/app.js?v=release');
  const event = dispatch(worker, request);
  assert.equal(await (await event.response).text(), 'fresh');
  await event.settled();
  assert.equal(worker.requests[0][1]?.cache, 'no-cache');
  assert.equal(await worker.entries.get(request.url).text(), 'fresh');
});

test('offline asset uses cached copy and uncached asset returns a network error', async () => {
  const worker = createWorker(async () => { throw new Error('offline'); });
  worker.entries.set('https://pdv.test/src/app.js', new Response('cached'));
  assert.equal(await (await dispatch(worker, new Request('https://pdv.test/src/app.js')).response).text(), 'cached');
  assert.equal((await dispatch(worker, new Request('https://pdv.test/src/missing.js')).response).type, 'error');
});

test('private or no-store responses are never retained as public assets', async () => {
  for (const directive of ['private, max-age=60', 'no-store']) {
    const worker = createWorker(async () => new Response('private', { headers: { 'Cache-Control': directive } }));
    const event = dispatch(worker, new Request('https://pdv.test/src/config/runtime-config.js'));
    await event.settled();
    assert.equal(worker.entries.size, 0, directive);
  }
});

test('activation deletes previous PDV caches while retaining unrelated applications', async () => {
  const worker = createWorker();
  let done;
  worker.handlers.activate({ waitUntil: (promise) => { done = promise; } });
  await done;
  assert.deepEqual(worker.deleted, ['pdv-old']);
});
