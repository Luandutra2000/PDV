import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';
import { emit } from './event-bus.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { isSupabaseEnabled } from './app-config.service.js';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};
const DEFAULT_COMPANY_SETTINGS = {
  id: '',
  empresaId: 'local-company',
  nomeSistema: 'Zelo PDV',
  nomeFantasia: 'Lanchonete',
  razaoSocial: '',
  cnpj: '',
  telefone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  logoUrl: '',
  corPrimaria: '#ff6b1a',
  corSecundaria: '#e65b11',
  corDestaque: '#fff0e6',
  updatedAt: ''
};

export function getDefaultCompanySettings() {
  return { ...DEFAULT_COMPANY_SETTINGS };
}

export function normalizeCompanySettings(input = {}) {
  const merged = {
    ...getDefaultCompanySettings(),
    ...input
  };

  return {
    ...merged,
    nomeSistema: String(merged.nomeSistema || '').trim(),
    nomeFantasia: String(merged.nomeFantasia || '').trim(),
    razaoSocial: String(merged.razaoSocial || '').trim(),
    cnpj: onlyDigits(merged.cnpj),
    telefone: String(merged.telefone || '').trim(),
    whatsapp: String(merged.whatsapp || '').trim(),
    email: String(merged.email || '').trim(),
    endereco: String(merged.endereco || '').trim(),
    logoUrl: String(merged.logoUrl || '').trim(),
    corPrimaria: normalizeHex(merged.corPrimaria),
    corSecundaria: normalizeHex(merged.corSecundaria),
    corDestaque: normalizeHex(merged.corDestaque)
  };
}

export function validateCompanySettings(input = {}) {
  const settings = normalizeCompanySettings(input);

  if (!settings.nomeSistema) {
    throw new Error('Nome do programa e obrigatorio.');
  }

  if (!settings.nomeFantasia) {
    throw new Error('Nome fantasia e obrigatorio.');
  }

  assertHex(settings.corPrimaria, 'Cor primaria invalida.');
  assertHex(settings.corSecundaria, 'Cor secundaria invalida.');
  assertHex(settings.corDestaque, 'Cor de destaque invalida.');

  if (settings.email && !EMAIL_PATTERN.test(settings.email)) {
    throw new Error('E-mail invalido.');
  }

  if (settings.cnpj && settings.cnpj.length !== 14) {
    throw new Error('CNPJ invalido.');
  }

  return settings;
}

export function loadCompanySettingsLocal() {
  return normalizeCompanySettings(getItem(STORAGE_KEYS.companySettings, getDefaultCompanySettings()));
}

export function saveCompanySettingsLocal(input) {
  const settings = {
    ...validateCompanySettings(input),
    updatedAt: new Date().toISOString()
  };
  setItem(STORAGE_KEYS.companySettings, settings);
  applyCompanyIdentity(settings);
  emit(UI_EVENTS.companySettingsChanged, settings);
  return settings;
}

export function resetCompanySettingsLocal() {
  return saveCompanySettingsLocal(getDefaultCompanySettings());
}

export function applyCompanyIdentity(input = loadCompanySettingsLocal()) {
  const settings = normalizeCompanySettings(input);
  const root = globalThis.document?.documentElement;

  if (!root?.style) {
    return settings;
  }

  root.style.setProperty('--color-primary', settings.corPrimaria);
  root.style.setProperty('--color-primary-strong', settings.corSecundaria);
  root.style.setProperty('--crm-orange', settings.corPrimaria);
  root.style.setProperty('--crm-orange-soft', settings.corDestaque);

  return settings;
}

export async function loadCompanySettings() {
  const localSettings = loadCompanySettingsLocal();

  if (!isSupabaseEnabled()) {
    return localSettings;
  }

  try {
    const client = await getSupabaseClient();

    if (!client) {
      return localSettings;
    }

    const { data, error } = await client
      .from('empresa_configuracoes')
      .select('*')
      .eq('empresa_id', localSettings.empresaId)
      .maybeSingle();

    if (error) {
      console.warn('Nao foi possivel carregar configuracoes da empresa.', error);
      return localSettings;
    }

    const settings = data ? unmapCompanySettings(data) : localSettings;
    setItem(STORAGE_KEYS.companySettings, settings);
    applyCompanyIdentity(settings);
    return settings;
  } catch (error) {
    console.warn('Nao foi possivel carregar configuracoes da empresa.', error);
    return localSettings;
  }
}

export async function saveCompanySettings(input) {
  const settings = validateCompanySettings(input);

  if (!isSupabaseEnabled()) {
    return saveCompanySettingsLocalOnly(settings);
  }

  try {
    const client = await getSupabaseClient();

    if (!client) {
      return saveCompanySettingsLocalOnly(settings);
    }

    const row = mapCompanySettings(settings);
    const { data, error } = await client
      .from('empresa_configuracoes')
      .upsert(row, { onConflict: 'empresa_id' })
      .select()
      .single();

    if (error) {
      console.warn('Nao foi possivel salvar configuracoes da empresa.', error);
      return saveCompanySettingsLocalOnly(settings);
    }

    return {
      ...saveCompanySettingsLocal(data ? unmapCompanySettings(data) : settings),
      syncStatus: 'synced'
    };
  } catch (error) {
    console.warn('Nao foi possivel salvar configuracoes da empresa.', error);
    return saveCompanySettingsLocalOnly(settings);
  }
}

export function validateLogoFile(file) {
  if (!file || !LOGO_EXTENSIONS_BY_MIME[file.type]) {
    throw new Error('Arquivo de logo invalido.');
  }

  if (Number(file.size || 0) > LOGO_MAX_SIZE_BYTES) {
    throw new Error('Logo deve ter no maximo 2 MB.');
  }

  return true;
}

export function readLogoAsDataUrl(file) {
  validateLogoFile(file);

  if (typeof globalThis.FileReader !== 'function') {
    throw new Error('Leitura de logo nao esta disponivel neste ambiente.');
  }

  return new Promise((resolve, reject) => {
    const reader = new globalThis.FileReader();

    reader.addEventListener('load', () => {
      resolve(String(reader.result || ''));
    });

    reader.addEventListener('error', () => {
      reject(new Error('Nao foi possivel ler o arquivo de logo.'));
    });

    reader.readAsDataURL(file);
  });
}

export async function uploadCompanyLogo(file, empresaId) {
  validateLogoFile(file);

  if (!isSupabaseEnabled()) {
    return readLogoAsDataUrl(file);
  }

  try {
    const client = await getSupabaseClient();

    if (!client?.storage?.from) {
      return readLogoAsDataUrl(file);
    }

    const extension = getLogoExtension(file.type);
    const safeEmpresaId = sanitizeLogoPathSegment(empresaId);
    const path = `${safeEmpresaId}/logo-${Date.now()}.${extension}`;

    const bucket = client.storage.from('logos');
    const { error } = await bucket.upload(path, file, {
      upsert: true,
      cacheControl: '3600'
    });

    if (error) {
      throw error;
    }

    const publicUrlResult = bucket.getPublicUrl(path);
    const publicUrl = publicUrlResult?.data?.publicUrl || '';

    if (!publicUrl) {
      throw new Error('URL publica do logo nao foi retornada.');
    }

    return publicUrl;
  } catch (error) {
    throw new Error(`Nao foi possivel enviar logo da empresa. ${error.message || ''}`.trim());
  }
}

export function mapCompanySettings(settings) {
  return {
    id: settings.id || undefined,
    empresa_id: settings.empresaId,
    nome_sistema: settings.nomeSistema,
    nome_fantasia: settings.nomeFantasia,
    razao_social: settings.razaoSocial || null,
    cnpj: settings.cnpj || null,
    telefone: settings.telefone || null,
    whatsapp: settings.whatsapp || null,
    email: settings.email || null,
    endereco: settings.endereco || null,
    logo_url: settings.logoUrl || null,
    cor_primaria: settings.corPrimaria,
    cor_secundaria: settings.corSecundaria,
    cor_destaque: settings.corDestaque
  };
}

export function unmapCompanySettings(row = {}) {
  return normalizeCompanySettings({
    id: row.id || '',
    empresaId: row.empresa_id || 'local-company',
    nomeSistema: row.nome_sistema,
    nomeFantasia: row.nome_fantasia,
    razaoSocial: row.razao_social,
    cnpj: row.cnpj,
    telefone: row.telefone,
    whatsapp: row.whatsapp,
    email: row.email,
    endereco: row.endereco,
    logoUrl: row.logo_url,
    corPrimaria: row.cor_primaria,
    corSecundaria: row.cor_secundaria,
    corDestaque: row.cor_destaque,
    updatedAt: row.updated_at || ''
  });
}

function normalizeHex(value) {
  const color = String(value || '').trim();
  return color.startsWith('#') ? color : `#${color}`;
}

function assertHex(value, message) {
  if (!HEX_COLOR_PATTERN.test(value)) {
    throw new Error(message);
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function getLogoExtension(mimeType) {
  return LOGO_EXTENSIONS_BY_MIME[mimeType] || 'png';
}

function sanitizeLogoPathSegment(value) {
  const segment = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');

  return segment || 'local-company';
}

function saveCompanySettingsLocalOnly(settings) {
  return { ...saveCompanySettingsLocal(settings), syncStatus: 'local-only' };
}
