import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js?v=20260804-06';
import { getItem, setItem } from './storage.service.js?v=20260804-06';
import { emit } from './event-bus.service.js?v=20260804-06';
import { getSupabaseClient } from './supabase-client.service.js?v=20260804-06';
import { isSupabaseEnabled } from './app-config.service.js?v=20260804-06';
import { getCurrentUser } from './auth.service.js?v=20260804-06';

const LOCAL_COMPANY_ID = 'local-company';
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;
const LOGO_EXTENSIONS_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg'
};
const BRAND_INK_DARK = '#1C2331';
const BRAND_INK_LIGHT = '#FFFFFF';
// Cores padrao do visual antigo: contam como "nao personalizadas".
const LEGACY_BRAND_COLORS = {
  primary: '#ff6b1a',
  secondary: '#e65b11',
  highlight: '#fff0e6'
};
const DEFAULT_COMPANY_SETTINGS = {
  id: '',
  empresaId: LOCAL_COMPANY_ID,
  nomeSistema: 'Zelo PDV',
  nomeFantasia: 'Lanchonete',
  razaoSocial: '',
  cnpj: '',
  telefone: '',
  whatsapp: '',
  email: '',
  endereco: '',
  logoUrl: '',
  corPrimaria: '#FFB547',
  corSecundaria: '#F0A030',
  corDestaque: '#FFF1D6',
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
    id: String(merged.id || '').trim(),
    empresaId: String(merged.empresaId || LOCAL_COMPANY_ID).trim() || LOCAL_COMPANY_ID,
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

export function resolveBrandColors(settings = {}) {
  return {
    accent: resolveBrandColor(settings.corPrimaria, LEGACY_BRAND_COLORS.primary, DEFAULT_COMPANY_SETTINGS.corPrimaria),
    accentStrong: resolveBrandColor(settings.corSecundaria, LEGACY_BRAND_COLORS.secondary, DEFAULT_COMPANY_SETTINGS.corSecundaria),
    accentSoft: resolveBrandColor(settings.corDestaque, LEGACY_BRAND_COLORS.highlight, DEFAULT_COMPANY_SETTINGS.corDestaque),
    accentInk: pickReadableInk(resolveBrandColor(settings.corPrimaria, LEGACY_BRAND_COLORS.primary, DEFAULT_COMPANY_SETTINGS.corPrimaria))
  };
}

export function pickReadableInk(hex) {
  const luminance = relativeLuminance(hex);

  if (luminance === null) {
    return BRAND_INK_DARK;
  }

  const darkContrast = contrastRatio(luminance, relativeLuminance(BRAND_INK_DARK));
  const lightContrast = contrastRatio(luminance, relativeLuminance(BRAND_INK_LIGHT));

  return lightContrast > darkContrast ? BRAND_INK_LIGHT : BRAND_INK_DARK;
}

export function applyCompanyIdentity(input = loadCompanySettingsLocal()) {
  const settings = normalizeCompanySettings(input);
  const root = globalThis.document?.documentElement;

  if (!root?.style) {
    return settings;
  }

  const brand = resolveBrandColors(settings);

  // Cores personalizadas valem inline nos dois temas. Cores padrao saem do
  // inline para que tokens.css (inclusive o tema escuro) governe.
  const accentIsCustom = isCustomBrandColor(settings.corPrimaria, DEFAULT_COMPANY_SETTINGS.corPrimaria);
  setOrClearProperty(root.style, '--accent', brand.accent, accentIsCustom);
  setOrClearProperty(root.style, '--accent-ink', brand.accentInk, accentIsCustom);
  setOrClearProperty(root.style, '--accent-strong', brand.accentStrong,
    isCustomBrandColor(settings.corSecundaria, DEFAULT_COMPANY_SETTINGS.corSecundaria));
  setOrClearProperty(root.style, '--accent-soft', brand.accentSoft,
    isCustomBrandColor(settings.corDestaque, DEFAULT_COMPANY_SETTINGS.corDestaque));
  root.style.setProperty('--color-primary', settings.corPrimaria);
  root.style.setProperty('--color-primary-strong', settings.corSecundaria);
  root.style.setProperty('--crm-orange', settings.corPrimaria);
  root.style.setProperty('--crm-orange-soft', settings.corDestaque);

  return settings;
}

export async function loadCompanySettings() {
  const localSettings = loadCompanySettingsLocal();
  let empresaId = resolveCompanyEmpresaId(localSettings.empresaId);

  if (!isSupabaseEnabled()) {
    return normalizeCompanySettings({ ...localSettings, empresaId });
  }

  try {
    const client = await getSupabaseClient();

    if (!client) {
      return normalizeCompanySettings({ ...localSettings, empresaId });
    }

    if (!isUuid(empresaId)) {
      empresaId = await loadCurrentUserEmpresaId(client);
    }

    if (!isUuid(empresaId)) {
      return normalizeCompanySettings({ ...localSettings, empresaId: LOCAL_COMPANY_ID });
    }

    const { data, error } = await client
      .from('empresa_configuracoes')
      .select('*')
      .eq('empresa_id', empresaId)
      .maybeSingle();

    if (error) {
      console.warn('Nao foi possivel carregar configuracoes da empresa.', error);
      return normalizeCompanySettings({ ...localSettings, empresaId });
    }

    const settings = data
      ? unmapCompanySettings(data)
      : normalizeCompanySettings({ ...localSettings, empresaId });
    setItem(STORAGE_KEYS.companySettings, settings);
    applyCompanyIdentity(settings);
    return settings;
  } catch (error) {
    console.warn('Nao foi possivel carregar configuracoes da empresa.', error);
    return normalizeCompanySettings({ ...localSettings, empresaId });
  }
}

export async function saveCompanySettings(input) {
  const settings = validateCompanySettings({
    ...input,
    empresaId: resolveCompanyEmpresaId(input?.empresaId)
  });

  if (!isSupabaseEnabled()) {
    return saveCompanySettingsLocalOnly(settings);
  }

  try {
    const client = await getSupabaseClient();

    if (!client) {
      return saveCompanySettingsLocalOnly(settings);
    }

    if (!isUuid(settings.empresaId)) {
      const remoteEmpresaId = await loadCurrentUserEmpresaId(client);

      if (!isUuid(remoteEmpresaId)) {
        return saveCompanySettingsLocalOnly(settings);
      }

      settings.empresaId = remoteEmpresaId;
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
  const resolvedEmpresaId = resolveCompanyEmpresaId(empresaId);

  if (!isSupabaseEnabled()) {
    return readLogoAsDataUrl(file);
  }

  try {
    const client = await getSupabaseClient();

    if (!client?.storage?.from) {
      return readLogoAsDataUrl(file);
    }

    const extension = getLogoExtension(file.type);
    const safeEmpresaId = sanitizeLogoPathSegment(resolvedEmpresaId);
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
    empresaId: row.empresa_id || LOCAL_COMPANY_ID,
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

function resolveBrandColor(value, legacyDefault, tokenDefault) {
  const color = String(value || '').trim();

  if (!HEX_COLOR_PATTERN.test(color) || color.toLowerCase() === legacyDefault) {
    return tokenDefault;
  }

  return color;
}

function isCustomBrandColor(value, tokenDefault) {
  const color = String(value || '').trim().toLowerCase();

  return HEX_COLOR_PATTERN.test(color)
    && color !== tokenDefault.toLowerCase()
    && !Object.values(LEGACY_BRAND_COLORS).includes(color);
}

function setOrClearProperty(style, name, value, shouldSet) {
  if (shouldSet) {
    style.setProperty(name, value);
  } else {
    style.removeProperty?.(name);
  }
}

function relativeLuminance(hex) {
  const color = String(hex || '').trim();

  if (!HEX_COLOR_PATTERN.test(color)) {
    return null;
  }

  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(color.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(first, second) {
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
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

  return segment || LOCAL_COMPANY_ID;
}

function saveCompanySettingsLocalOnly(settings) {
  return { ...saveCompanySettingsLocal(settings), syncStatus: 'local-only' };
}

function resolveCompanyEmpresaId(value) {
  const candidate = String(value || '').trim();

  if (isUuid(candidate)) {
    return candidate;
  }

  const currentUserEmpresaId = String(getCurrentUser()?.empresaId || '').trim();

  return isUuid(currentUserEmpresaId) ? currentUserEmpresaId : LOCAL_COMPANY_ID;
}

async function loadCurrentUserEmpresaId(client) {
  const userId = String(getCurrentUser()?.id || '').trim();

  if (!userId || !client?.from) {
    return '';
  }

  const query = client
    .from('profiles')
    .select('empresa_id')
    .eq('id', userId);
  const result = typeof query.maybeSingle === 'function'
    ? await query.maybeSingle()
    : await query.single();

  if (result?.error) {
    return '';
  }

  const empresaId = String(result?.data?.empresa_id || '').trim();
  return isUuid(empresaId) ? empresaId : '';
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}
