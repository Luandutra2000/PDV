import { SYNC_EVENTS, UI_EVENTS } from '../database/schema.js';
import { emit, on } from './event-bus.service.js';

let initialized = false;

export function initRealtimeService() {
  if (initialized) {
    return;
  }

  on(SYNC_EVENTS.saleFinished, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));
  on(SYNC_EVENTS.cashMovementRegistered, (payload) => emit(UI_EVENTS.mobileFeedChanged, payload));

  initialized = true;
}
