const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

import { readFileSync } from 'node:fs';

const { SYNC_EVENTS, UI_EVENTS } = await import('../src/database/schema.js');
const { emit, on } = await import('../src/services/event-bus.service.js');
const realtime = await import('../src/services/realtime.service.js');

let received = null;
on(UI_EVENTS.mobileFeedChanged, (payload) => {
  received = payload;
});

realtime.initRealtimeService();
emit(SYNC_EVENTS.saleFinished, { id: 'sale-test' });

assert(received?.id === 'sale-test', 'realtime bridge should republish sale events to mobile feed updates');

received = null;
realtime.initRealtimeService();
emit(SYNC_EVENTS.cashMovementRegistered, { id: 'cash-test' });

assert(received?.id === 'cash-test', 'realtime bridge should republish cash movement events to mobile feed updates');

const source = readFileSync(new URL('../src/services/realtime.service.js', import.meta.url), 'utf8');
assert(source.includes('startShowcaseRealtime'), 'realtime service should start showcase realtime sync');
assert(source.includes('isSupabaseEnabled()'), 'showcase realtime should only start when Supabase is enabled');

console.log('realtime service ok');
