import assert from 'node:assert/strict';
const disk = new Map();
globalThis.localStorage = {
  getItem:key=>disk.get(key)??null,
  setItem:(key,value)=>disk.set(key,String(value)),
  removeItem:key=>disk.delete(key),
  clear:()=>disk.clear()
};
const financial = await import('../src/services/financial-sync.service.js?v=20260804-06');
let mode='offline';
let release, started;
const awaiting = new Promise(resolve=>{started=resolve;});
const gate = new Promise(resolve=>{release=resolve;});
const saved=[];
const client={from:()=>({upsert:async rows=>{
  if(mode==='flushing' && rows[0].id==='A') {started(); await gate; saved.push(rows[0]); return {error:null};}
  return {error:new Error('offline')};
}})};
financial.configureFinancialSyncForTests({getClient:async()=>client});
const movement=(id,amount=10)=>({id,type:'entrada',status:'ativa',amount,description:'QA',createdAt:new Date().toISOString()});
await financial.saveCashMovementToSupabase(movement('A'));
mode='flushing';
const firstFlush=financial.flushFinancialQueue();
await awaiting;
const concurrentFlush=financial.flushFinancialQueue();
await financial.saveCashMovementToSupabase(movement('B'));
release();
await Promise.all([firstFlush,concurrentFlush]);
assert.equal(saved.length,1,'concurrent flush calls must share one send');
assert.equal(financial.getFinancialSyncStatus().pending,1,'a new failed operation must remain pending when an older flush completes');
assert.equal(JSON.parse(disk.get('pdv.syncQueue.financial'))[0].movement.id,'B');
console.log('financial queue concurrency ok');
