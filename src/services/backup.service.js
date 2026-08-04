import { STORAGE_KEYS } from '../database/schema.js?v=20260804-01';
import { getItem, setItem } from './storage.service.js?v=20260804-01';

const BACKUP_VERSION = 1;
const BACKUP_KEYS = Object.freeze([...new Set(Object.values(STORAGE_KEYS))]);

export function createBackup() {
  const data = Object.fromEntries(BACKUP_KEYS.map((key) => [key, getItem(key, null)]));
  assertNoStoredPasswords(data);
  const payload = JSON.stringify(data);
  return JSON.stringify({
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    checksum: checksum(payload),
    data
  });
}

export function validateBackup(serialized) {
  const backup = parseBackup(serialized);
  if (backup.version !== BACKUP_VERSION) throw new Error('Versao de backup incompativel.');
  if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) {
    throw new Error('Conteudo de backup invalido.');
  }
  const unknownKeys = Object.keys(backup.data).filter((key) => !BACKUP_KEYS.includes(key));
  if (unknownKeys.length) throw new Error('Backup contem chaves nao permitidas.');
  if (checksum(JSON.stringify(backup.data)) !== backup.checksum) {
    throw new Error('Checksum do backup invalido.');
  }
  assertNoStoredPasswords(backup.data);
  return backup;
}

export function restoreBackup(serialized) {
  const backup = validateBackup(serialized);
  const previous = Object.fromEntries(BACKUP_KEYS.map((key) => [key, getItem(key, null)]));
  try {
    BACKUP_KEYS.forEach((key) => {
      if (Object.hasOwn(backup.data, key)) setItem(key, backup.data[key]);
    });
  } catch (error) {
    BACKUP_KEYS.forEach((key) => setItem(key, previous[key]));
    throw new Error(`Restauracao revertida: ${error?.message || 'falha desconhecida'}`);
  }
  return { restoredAt: new Date().toISOString(), keysRestored: Object.keys(backup.data).length };
}

function parseBackup(serialized) {
  try {
    return JSON.parse(String(serialized || ''));
  } catch {
    throw new Error('Arquivo de backup invalido.');
  }
}

function assertNoStoredPasswords(value) {
  const containsPassword = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    if (Array.isArray(candidate)) return candidate.some(containsPassword);
    return Object.entries(candidate).some(([key, nested]) => (
      key.toLowerCase() === 'password' || containsPassword(nested)
    ));
  };
  if (containsPassword(value)) throw new Error('Backup recusado por conter senha.');
}

function checksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
