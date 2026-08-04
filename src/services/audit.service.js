import { STORAGE_KEYS } from '../database/schema.js?v=20260804-06';
import { getItem, setItem } from './storage.service.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20260804-06';

const REQUIRED_FIELDS_ERROR = 'Acao e tipo da entidade sao obrigatorios.';

export function recordAudit({
  action,
  entityType,
  entityId = '',
  user = getCurrentUser(),
  reason = '',
  metadata = {}
} = {}) {
  const normalizedAction = String(action || '').trim();
  const normalizedEntityType = String(entityType || '').trim();

  if (!normalizedAction || !normalizedEntityType) {
    throw new Error(REQUIRED_FIELDS_ERROR);
  }

  const entry = {
    id: createId('audit'),
    action: normalizedAction,
    entityType: normalizedEntityType,
    entityId: String(entityId || '').trim(),
    userId: user?.id || '',
    userName: user?.name || 'Sistema',
    reason: String(reason || '').trim(),
    metadata: normalizeMetadata(metadata),
    createdAt: new Date().toISOString()
  };

  const logs = getAuditLogs();
  setItem(STORAGE_KEYS.auditLogs, [entry, ...logs]);

  return entry;
}

export function getAuditLogs() {
  return getItem(STORAGE_KEYS.auditLogs, []);
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
