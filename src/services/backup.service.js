import { STORAGE_KEYS } from '../database/schema.js?v=20260804-06';
import { getItem } from './storage.service.js?v=20260804-06';
import { getDataProviderMode } from './app-config.service.js?v=20260804-06';
import { createLocalProvider } from './providers/local.provider.js?v=20260804-06';

const BACKUP_VERSION = 1;
const AUTH_KEYS = new Set([STORAGE_KEYS.users, STORAGE_KEYS.currentSession, STORAGE_KEYS.userPermissionOverrides]);
const BACKUP_KEYS = Object.freeze([...new Set(Object.values(STORAGE_KEYS))].filter((key) => !AUTH_KEYS.has(key)));

export function createBackup() {
  const data = Object.fromEntries(BACKUP_KEYS.map((key) => [key, getItem(key, null)]).filter(([, value]) => value !== null));
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
  if (getDataProviderMode() !== 'local') {
    throw new Error('Restauracao permitida somente em ambiente local isolado. Solicite recuperacao assistida para o sistema online.');
  }
  const localProvider = createLocalProvider();
  const previous = Object.fromEntries(BACKUP_KEYS.map((key) => [key, localProvider.read(key, null)]));
  const written = [];
  try {
    BACKUP_KEYS.forEach((key) => {
      if (Object.hasOwn(backup.data, key)) {
        localProvider.write(key, backup.data[key]);
        written.push(key);
      }
    });
  } catch (error) {
    try {
      written.reverse().forEach((key) => {
        if (previous[key] === null) localProvider.remove(key);
        else localProvider.write(key, previous[key]);
      });
    } catch (rollbackError) {
      throw new Error(`Restauracao interrompida; reversao incompleta: ${rollbackError.message}. Preserve o backup e solicite suporte.`);
    }
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
      /^(password|senha|access_?token|refresh_?token|id_?token|token|authorization|api_?key|service_?role_?key|secret)$/i.test(key) || containsPassword(nested)
    ));
  };
  if (containsPassword(value)) throw new Error('Backup recusado por conter senha, token ou credencial.');
}

function checksum(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
