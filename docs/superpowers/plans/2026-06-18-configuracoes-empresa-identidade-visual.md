# Configuracoes da Empresa e Identidade Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional "Configuracoes da Empresa" tab where an authorized company user can configure system name, logo, primary color, secondary color, accent color, and basic company data, with local fallback and Supabase tenant isolation.

**Architecture:** Add a focused company settings service, a dedicated module screen, a small CSS file, and shell integration for sidebar/header branding. Supabase gets `empresas`, `profiles.empresa_id`, `empresa_configuracoes`, a `logos` bucket, and RLS policies tied to the current profile's company.

**Tech Stack:** JavaScript ES Modules, HTML templates, modular CSS, localStorage data provider, Supabase Postgres/RLS/Storage, Node `.mjs` tests.

---

## Starting Context

Implement on top of the requested deploy base:

- Branch: `codex/showcase-stock-sync`
- Commit: `1bad1f6`
- App cache target: `app.js?v=20260618-02`
- PWA cache target: `pdv-v59`
- Supabase project: `inquppkbkmhnbtwpriuw`
- Latest applied migration from user context: `20260618194000_add_user_delete_permission.sql`

The workspace observed during planning was on `feature/fechamento-caixa` with unrelated pending changes. Preserve those changes. Do not reset or discard user work.

## File Structure

- Modify `src/database/schema.js`: add `STORAGE_KEYS.companySettings` and `UI_EVENTS.companySettingsChanged`.
- Modify `src/services/permission.service.js`: add `company_settings.manage` and default role grants for `admin` and `dono`.
- Create `src/services/empresa-config.service.js`: defaults, validation, local read/write, Supabase read/write, logo upload, CSS variable application.
- Create `tests/empresa-config-service.test.mjs`: unit tests for defaults, validation, local save/load, and style application.
- Modify `src/components/sidebar.component.js`: render configured logo/name/store label and menu item.
- Create `tests/sidebar-company-settings.test.mjs`: asserts sidebar brand/menu behavior.
- Create `src/modules/empresa-config/empresa-config.module.js`: form UI, preview, logo picker, save/reset/remove actions.
- Create `src/styles/empresa-config.css`: responsive card layout and preview styles.
- Modify `index.html`: include `empresa-config.css` and bump `LOCAL_CACHE_VERSION` plus `app.js` query.
- Modify `service-worker.js`: bump cache name and precache `app.js?v=20260618-02`.
- Modify `tests/vercel-cache-config.test.mjs`: expected cache versions.
- Modify `src/app.js`: import module/service, add route, permission, load/apply settings before shell render.
- Modify `src/services/providers/supabase.provider.js`: hydrate local cache from `empresa_configuracoes` if using provider hydration, or leave reads in the dedicated service if the service owns Supabase access.
- Add Supabase migration via `npx.cmd supabase migration new add_company_visual_settings`: creates schema, grants, policies, seed/default linking, storage bucket and storage policies.
- Create `tests/company-settings-migration.test.mjs`: static SQL checks for required tables, columns, policies, bucket, and permission.

---

### Task 0: Align The Working Base

**Files:**
- Read: `git status`
- Read: `git branch --show-current`
- Read: `git log --oneline -8`
- No code changes in this task

- [ ] **Step 1: Confirm current branch and dirty files**

Run:

```powershell
git branch --show-current
git log --oneline -8
git status --short
```

Expected:

```text
The output either shows codex/showcase-stock-sync at 1bad1f6, or shows a different branch with pending work that must be preserved.
```

- [ ] **Step 2: If not on the requested base, create or switch to an isolated worktree**

Run this only when the current workspace is not already cleanly on `codex/showcase-stock-sync`:

```powershell
git worktree add .worktrees\company-visual-settings codex/showcase-stock-sync
```

Expected:

```text
Preparing worktree (checking out 'codex/showcase-stock-sync')
HEAD is now at 1bad1f6 ...
```

- [ ] **Step 3: Run all later commands in the selected implementation directory**

If a worktree was created, use:

```powershell
cd .worktrees\company-visual-settings
```

Expected:

```text
pwd shows the isolated worktree path.
```

Do not move unrelated dirty files from the original workspace.

---

### Task 1: Add Storage Key And Permission Catalog

**Files:**
- Modify: `src/database/schema.js`
- Modify: `src/services/permission.service.js`
- Test: `tests/permission-service.test.mjs`

- [ ] **Step 1: Extend the permission test first**

Add these assertions after the existing owner app/admin assertions in `tests/permission-service.test.mjs`:

```js
assert(
  permissions.hasPermission(admin, 'company_settings.manage'),
  'admin should manage company settings'
);
assert(
  permissions.hasPermission({ id: 'dono-1', role: 'dono', active: true }, 'company_settings.manage'),
  'dono should manage company settings'
);
assert(
  !permissions.hasPermission(gerente, 'company_settings.manage'),
  'gerente should not manage company settings by default'
);
assert(
  permissions.PERMISSIONS.some((permission) => permission.id === 'company_settings.manage'),
  'permission catalog should include company settings management'
);
```

- [ ] **Step 2: Run the failing permission test**

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected:

```text
FAIL with a message containing "admin should manage company settings" or "permission catalog should include company settings management".
```

- [ ] **Step 3: Add schema keys and UI event**

In `src/database/schema.js`, add:

```js
companySettings: 'pdv.companySettings'
```

inside `STORAGE_KEYS`, after `financialSyncQueue`.

Add:

```js
companySettingsChanged: 'COMPANY_SETTINGS_CHANGED'
```

inside `UI_EVENTS`, after `permissionsChanged`.

- [ ] **Step 4: Add the permission and default role grants**

In `src/services/permission.service.js`, add this object to `PERMISSIONS` in the `Sistema` group:

```js
{
  id: 'company_settings.manage',
  label: 'Configurar empresa',
  group: 'Sistema',
  description: 'Permite alterar logo, nome e cores do sistema.'
}
```

Add `'company_settings.manage'` to the `dono` defaults. Do not add it to `gerente`, `caixa`, or `operador`.

- [ ] **Step 5: Run the permission test again**

Run:

```powershell
node tests\permission-service.test.mjs
```

Expected:

```text
permission service ok
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/database/schema.js src/services/permission.service.js tests/permission-service.test.mjs
git commit -m "feat: add company settings permission"
```

Expected:

```text
[branch ...] feat: add company settings permission
```

---

### Task 2: Build The Company Settings Service

**Files:**
- Create: `src/services/empresa-config.service.js`
- Create: `tests/empresa-config-service.test.mjs`

- [ ] **Step 1: Write the service test**

Create `tests/empresa-config-service.test.mjs`:

```js
const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const documentStyle = new Map();
globalThis.document = {
  documentElement: {
    style: {
      setProperty(name, value) {
        documentStyle.set(name, value);
      },
      removeProperty(name) {
        documentStyle.delete(name);
      }
    }
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertThrows = (callback, expectedMessage, message) => {
  try {
    callback();
  } catch (error) {
    assert(error.message.includes(expectedMessage), `${message}: got "${error.message}"`);
    return;
  }
  throw new Error(message);
};

const storage = await import('../src/services/storage.service.js');
const { STORAGE_KEYS } = await import('../src/database/schema.js');
const company = await import('../src/services/empresa-config.service.js');

storage.ensureSeedData();

const defaults = company.getDefaultCompanySettings();
assert(defaults.nomeSistema === 'Zelo PDV', 'default system name should keep current brand');
assert(defaults.nomeFantasia === 'Lanchonete', 'default store label should keep current sidebar footer');
assert(defaults.corPrimaria === '#ff6b1a', 'default primary color should match current theme');
assert(defaults.corSecundaria === '#e65b11', 'default secondary color should match current strong color');
assert(defaults.corDestaque === '#fff0e6', 'default accent color should match current soft highlight');

assertThrows(
  () => company.validateCompanySettings({ ...defaults, nomeSistema: '' }),
  'Nome do programa e obrigatorio.',
  'empty system name should fail'
);

assertThrows(
  () => company.validateCompanySettings({ ...defaults, corPrimaria: 'orange' }),
  'Cor primaria invalida.',
  'invalid primary color should fail'
);

const saved = company.saveCompanySettingsLocal({
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao',
  corPrimaria: '#2563eb',
  corSecundaria: '#1d4ed8',
  corDestaque: '#dbeafe',
  logoUrl: 'data:image/png;base64,abc',
  email: 'contato@example.com'
});

assert(saved.nomeSistema === 'Meu Caixa', 'save should normalize system name');
assert(saved.nomeFantasia === 'Padaria Sao Joao', 'save should normalize company name');
assert(storage.getItem(STORAGE_KEYS.companySettings).nomeSistema === 'Meu Caixa', 'settings should persist locally');

const loaded = company.loadCompanySettingsLocal();
assert(loaded.nomeSistema === 'Meu Caixa', 'load should read persisted settings');
assert(loaded.logoUrl === 'data:image/png;base64,abc', 'load should keep local logo');

company.applyCompanyIdentity(loaded);
assert(documentStyle.get('--color-primary') === '#2563eb', 'primary variable should be applied');
assert(documentStyle.get('--color-primary-strong') === '#1d4ed8', 'secondary variable should be applied');
assert(documentStyle.get('--crm-orange-soft') === '#dbeafe', 'accent variable should be applied');

const restored = company.resetCompanySettingsLocal();
assert(restored.nomeSistema === 'Zelo PDV', 'reset should restore default system name');

console.log('empresa config service ok');
```

- [ ] **Step 2: Run the failing service test**

Run:

```powershell
node tests\empresa-config-service.test.mjs
```

Expected:

```text
FAIL with ERR_MODULE_NOT_FOUND for empresa-config.service.js.
```

- [ ] **Step 3: Create the service**

Create `src/services/empresa-config.service.js`:

```js
import { STORAGE_KEYS, UI_EVENTS } from '../database/schema.js';
import { getItem, setItem } from './storage.service.js';
import { emit } from './event-bus.service.js';
import { getSupabaseClient } from './supabase-client.service.js';
import { isSupabaseEnabled } from './app-config.service.js';

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
  if (!isSupabaseEnabled()) {
    return loadCompanySettingsLocal();
  }

  const client = await getSupabaseClient();

  if (!client) {
    return loadCompanySettingsLocal();
  }

  const { data, error } = await client
    .from('empresa_configuracoes')
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('Nao foi possivel carregar configuracoes da empresa.', error);
    return loadCompanySettingsLocal();
  }

  const settings = data ? unmapCompanySettings(data) : loadCompanySettingsLocal();
  setItem(STORAGE_KEYS.companySettings, settings);
  applyCompanyIdentity(settings);
  return settings;
}

export async function saveCompanySettings(input) {
  const settings = validateCompanySettings(input);

  if (!isSupabaseEnabled()) {
    return saveCompanySettingsLocal(settings);
  }

  const client = await getSupabaseClient();

  if (!client) {
    return saveCompanySettingsLocal(settings);
  }

  const row = mapCompanySettings(settings);
  const { data, error } = await client
    .from('empresa_configuracoes')
    .upsert(row, { onConflict: 'empresa_id' })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return saveCompanySettingsLocal(unmapCompanySettings(data));
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
```

- [ ] **Step 4: Run the service test**

Run:

```powershell
node tests\empresa-config-service.test.mjs
```

Expected:

```text
empresa config service ok
```

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/services/empresa-config.service.js tests/empresa-config-service.test.mjs
git commit -m "feat: add company settings service"
```

Expected:

```text
[branch ...] feat: add company settings service
```

---

### Task 3: Render Configured Branding In The Sidebar

**Files:**
- Modify: `src/components/sidebar.component.js`
- Create: `tests/sidebar-company-settings.test.mjs`

- [ ] **Step 1: Write the sidebar test**

Create `tests/sidebar-company-settings.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { renderSidebar } = await import('../src/components/sidebar.component.js');

const admin = { id: 'admin-1', name: 'Admin', role: 'admin', active: true };

const html = renderSidebar(admin, {
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao',
  logoUrl: 'https://example.com/logo.png'
});

assert(html.includes('Meu Caixa'), 'sidebar should render configured system name');
assert(html.includes('Padaria Sao Joao'), 'sidebar should render configured company name in footer');
assert(html.includes('https://example.com/logo.png'), 'sidebar should render configured logo');
assert(html.includes('Configurações da Empresa') || html.includes('Configuracoes da Empresa'), 'sidebar should include company settings menu item');
assert(html.includes('data-menu-id="empresa-config"'), 'company settings item should use expected route id');

const operatorHtml = renderSidebar({ id: 'op-1', role: 'operador', active: true }, {
  nomeSistema: 'Meu Caixa',
  nomeFantasia: 'Padaria Sao Joao'
});

assert(!operatorHtml.includes('data-menu-id="empresa-config"'), 'operator should not see company settings menu item');

console.log('sidebar company settings ok');
```

- [ ] **Step 2: Run the failing sidebar test**

Run:

```powershell
node tests\sidebar-company-settings.test.mjs
```

Expected:

```text
FAIL because renderSidebar does not accept company settings or does not render empresa-config.
```

- [ ] **Step 3: Update sidebar rendering**

Change `renderSidebar(currentUser)` to `renderSidebar(currentUser, companySettings = {})`.

Add menu item under `Gestao`:

```js
{ id: 'empresa-config', label: 'Configurações da Empresa', icon: 'CE', permission: 'company_settings.manage' }
```

Replace the brand block with:

```js
const systemName = companySettings.nomeSistema || 'Zelo PDV';
const companyName = companySettings.nomeFantasia || 'Lanchonete';
const logo = companySettings.logoUrl
  ? `<img class="sidebar__logo" src="${companySettings.logoUrl}" alt="">`
  : '<span class="sidebar__badge">PDV</span>';
```

Render:

```js
<div class="sidebar__brand">
  ${logo}
  <span class="sidebar__brand-name">${systemName}</span>
</div>
```

Render footer store:

```js
<div class="sidebar__store">${companyName}</div>
```

- [ ] **Step 4: Add sidebar logo CSS**

In `src/styles/sidebar.css`, add:

```css
.sidebar__logo {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  object-fit: contain;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.sidebar__brand-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

In the `@media (max-width: 980px)` selector, replace `.sidebar__brand span:not(.sidebar__badge)` with:

```css
.sidebar__brand-name
```

- [ ] **Step 5: Run sidebar and permission tests**

Run:

```powershell
node tests\sidebar-company-settings.test.mjs
node tests\permission-service.test.mjs
```

Expected:

```text
sidebar company settings ok
permission service ok
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/components/sidebar.component.js src/styles/sidebar.css tests/sidebar-company-settings.test.mjs
git commit -m "feat: show company identity in sidebar"
```

Expected:

```text
[branch ...] feat: show company identity in sidebar
```

---

### Task 4: Add The Empresa Config Module UI

**Files:**
- Create: `src/modules/empresa-config/empresa-config.module.js`
- Create: `src/styles/empresa-config.css`
- Modify: `index.html`

- [ ] **Step 1: Create module smoke test**

Create `tests/empresa-config-module.test.mjs`:

```js
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const listeners = new Map();
const workspace = {
  innerHTML: '',
  querySelector(selector) {
    return {
      addEventListener(type, callback) {
        listeners.set(`${selector}:${type}`, callback);
      },
      value: '',
      checked: false,
      files: []
    };
  },
  querySelectorAll() {
    return [];
  },
  addEventListener(type, callback) {
    listeners.set(`workspace:${type}`, callback);
  }
};

globalThis.document = {
  documentElement: {
    style: {
      setProperty() {},
      removeProperty() {}
    }
  }
};

globalThis.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
  clear() {}
};

const { initEmpresaConfigModule } = await import('../src/modules/empresa-config/empresa-config.module.js');

initEmpresaConfigModule(workspace);

assert(workspace.innerHTML.includes('Configurações da Empresa') || workspace.innerHTML.includes('Configuracoes da Empresa'), 'module should render title');
assert(workspace.innerHTML.includes('Nome do programa'), 'module should render system name field');
assert(workspace.innerHTML.includes('Cor primaria') || workspace.innerHTML.includes('Cor primária'), 'module should render color fields');
assert(workspace.innerHTML.includes('data-company-preview'), 'module should render preview');
assert(workspace.innerHTML.includes('Salvar configurações') || workspace.innerHTML.includes('Salvar configuracoes'), 'module should render save button');

console.log('empresa config module ok');
```

- [ ] **Step 2: Run the failing module test**

Run:

```powershell
node tests\empresa-config-module.test.mjs
```

Expected:

```text
FAIL with ERR_MODULE_NOT_FOUND for empresa-config.module.js.
```

- [ ] **Step 3: Create the module**

Create `src/modules/empresa-config/empresa-config.module.js` with these exports and helpers:

```js
import {
  getDefaultCompanySettings,
  loadCompanySettingsLocal,
  saveCompanySettings,
  resetCompanySettingsLocal,
  validateCompanySettings
} from '../../services/empresa-config.service.js';

export function initEmpresaConfigModule(workspace) {
  const settings = loadCompanySettingsLocal();
  workspace.innerHTML = renderEmpresaConfig(settings);
  bindEmpresaConfigEvents(workspace);
}

function renderEmpresaConfig(settings) {
  return `
    <section class="module-screen empresa-config-screen">
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Configurações da Empresa</h1>
          <p class="module-subtitle">Ajuste o nome, a logo e as cores exibidas no sistema.</p>
        </div>
      </header>

      <form class="empresa-config-grid" data-company-settings-form>
        <article class="empresa-config-card">
          <h2>Identidade visual</h2>
          <label class="field-group">
            <span>Logo</span>
            <input class="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-field="logoFile">
          </label>
          <div class="empresa-logo-preview" data-logo-preview>
            ${settings.logoUrl ? `<img src="${settings.logoUrl}" alt="">` : '<span>Sem logo</span>'}
          </div>
          <button class="button button--ghost" type="button" data-action="remove-logo">Remover logo</button>

          ${renderColorField('Cor primaria', 'corPrimaria', settings.corPrimaria)}
          ${renderColorField('Cor secundaria', 'corSecundaria', settings.corSecundaria)}
          ${renderColorField('Cor de destaque', 'corDestaque', settings.corDestaque)}
        </article>

        <article class="empresa-config-card">
          <h2>Nome do programa</h2>
          ${renderTextField('Nome do programa', 'nomeSistema', settings.nomeSistema, true)}
          ${renderTextField('Nome fantasia', 'nomeFantasia', settings.nomeFantasia, true)}
        </article>

        <article class="empresa-config-card">
          <h2>Dados básicos</h2>
          ${renderTextField('Razão social', 'razaoSocial', settings.razaoSocial)}
          ${renderTextField('CNPJ', 'cnpj', settings.cnpj)}
          ${renderTextField('Telefone', 'telefone', settings.telefone)}
          ${renderTextField('WhatsApp', 'whatsapp', settings.whatsapp)}
          ${renderTextField('E-mail', 'email', settings.email)}
          ${renderTextField('Endereço', 'endereco', settings.endereco)}
        </article>

        <article class="empresa-config-card empresa-config-card--preview" data-company-preview>
          <h2>Pré-visualização</h2>
          ${renderPreview(settings)}
        </article>

        <div class="empresa-config-actions">
          <button class="button" type="submit">Salvar configurações</button>
          <button class="button button--ghost" type="button" data-action="restore-defaults">Restaurar padrão</button>
          <p class="form-error" data-company-settings-error hidden></p>
        </div>
      </form>
    </section>
  `;
}

function renderTextField(label, field, value = '', required = false) {
  return `
    <label class="field-group">
      <span>${label}</span>
      <input class="field" type="text" name="${field}" value="${escapeHtml(value)}" ${required ? 'required' : ''}>
    </label>
  `;
}

function renderColorField(label, field, value) {
  return `
    <label class="field-group empresa-color-field">
      <span>${label}</span>
      <input class="field" type="color" name="${field}" value="${escapeHtml(value)}">
    </label>
  `;
}

function renderPreview(settings) {
  return `
    <div class="empresa-preview-shell" style="--preview-primary:${settings.corPrimaria};--preview-secondary:${settings.corSecundaria};--preview-accent:${settings.corDestaque}">
      <div class="empresa-preview-sidebar">
        <div class="empresa-preview-brand">${settings.logoUrl ? `<img src="${settings.logoUrl}" alt="">` : '<span>PDV</span>'}<strong>${settings.nomeSistema}</strong></div>
        <div class="empresa-preview-item">Frente de Caixa</div>
        <div class="empresa-preview-item is-active">Configurações</div>
      </div>
      <div class="empresa-preview-content">
        <h3>${settings.nomeFantasia}</h3>
        <button type="button">Botão principal</button>
      </div>
    </div>
  `;
}

function bindEmpresaConfigEvents(workspace) {
  const form = workspace.querySelector('[data-company-settings-form]');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const payload = collectSettings(form);
    try {
      await saveCompanySettings(payload);
      initEmpresaConfigModule(workspace);
    } catch (error) {
      showError(workspace, error.message || 'Não foi possível salvar as configurações.');
    }
  });

  workspace.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="restore-defaults"]')) {
      resetCompanySettingsLocal();
      initEmpresaConfigModule(workspace);
    }

    if (event.target.closest('[data-action="remove-logo"]')) {
      const payload = collectSettings(form);
      payload.logoUrl = '';
      saveCompanySettings(payload).then(() => initEmpresaConfigModule(workspace));
    }
  });
}

function collectSettings(form) {
  const data = new FormData(form);
  return validateCompanySettings({
    ...loadCompanySettingsLocal(),
    nomeSistema: data.get('nomeSistema'),
    nomeFantasia: data.get('nomeFantasia'),
    razaoSocial: data.get('razaoSocial'),
    cnpj: data.get('cnpj'),
    telefone: data.get('telefone'),
    whatsapp: data.get('whatsapp'),
    email: data.get('email'),
    endereco: data.get('endereco'),
    corPrimaria: data.get('corPrimaria'),
    corSecundaria: data.get('corSecundaria'),
    corDestaque: data.get('corDestaque')
  });
}

function showError(workspace, message) {
  const target = workspace.querySelector('[data-company-settings-error]');
  if (!target) return;
  target.hidden = false;
  target.textContent = message;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
```

- [ ] **Step 4: Create module CSS**

Create `src/styles/empresa-config.css`:

```css
.empresa-config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.empresa-config-card {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  padding: 18px;
  box-shadow: var(--shadow-soft);
}

.empresa-config-card h2 {
  margin: 0 0 14px;
  font-size: 18px;
}

.empresa-logo-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  margin: 10px 0;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-muted);
  color: var(--color-text-muted);
  font-weight: 700;
}

.empresa-logo-preview img {
  max-width: 180px;
  max-height: 70px;
  object-fit: contain;
}

.empresa-color-field input[type="color"] {
  min-height: 44px;
  padding: 4px;
}

.empresa-config-card--preview {
  grid-column: span 2;
}

.empresa-preview-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 230px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface-muted);
}

.empresa-preview-sidebar {
  padding: 16px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
}

.empresa-preview-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}

.empresa-preview-brand img,
.empresa-preview-brand span {
  width: 34px;
  height: 34px;
  border-radius: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--preview-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  object-fit: contain;
}

.empresa-preview-item {
  padding: 10px 12px;
  border-radius: 7px;
  color: var(--color-text-muted);
  font-weight: 700;
}

.empresa-preview-item.is-active {
  color: var(--preview-primary);
  background: var(--preview-accent);
  box-shadow: inset 3px 0 0 var(--preview-primary);
}

.empresa-preview-content {
  padding: 20px;
}

.empresa-preview-content h3 {
  margin: 0 0 14px;
  color: var(--preview-primary);
}

.empresa-preview-content button {
  border: 0;
  border-radius: 7px;
  padding: 11px 14px;
  background: var(--preview-primary);
  color: #fff;
  font-weight: 800;
}

.empresa-config-actions {
  grid-column: span 2;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 860px) {
  .empresa-config-grid,
  .empresa-preview-shell {
    grid-template-columns: 1fr;
  }

  .empresa-config-card--preview,
  .empresa-config-actions {
    grid-column: span 1;
  }
}
```

- [ ] **Step 5: Include CSS in `index.html`**

Add after `forms.css`:

```html
<link rel="stylesheet" href="./src/styles/empresa-config.css">
```

- [ ] **Step 6: Run module test**

Run:

```powershell
node tests\empresa-config-module.test.mjs
```

Expected:

```text
empresa config module ok
```

- [ ] **Step 7: Commit**

Run:

```powershell
git add src/modules/empresa-config/empresa-config.module.js src/styles/empresa-config.css index.html tests/empresa-config-module.test.mjs
git commit -m "feat: add company settings screen"
```

Expected:

```text
[branch ...] feat: add company settings screen
```

---

### Task 5: Wire Route, Bootstrap, And Cache Versions

**Files:**
- Modify: `src/app.js`
- Modify: `index.html`
- Modify: `service-worker.js`
- Modify: `tests/vercel-cache-config.test.mjs`

- [ ] **Step 1: Update cache test expectations first**

In `tests/vercel-cache-config.test.mjs`, change expected app version assertions to:

```js
assert(indexHtml.includes('./src/app.js?v=20260618-02'), 'app entrypoint should use the latest cache-busting version');
assert(serviceWorkerJs.includes('pdv-v59'), 'service worker cache name should change when app modules change');
assert(serviceWorkerJs.includes('./src/app.js?v=20260618-02'), 'service worker should precache the latest app entrypoint');
assert(!serviceWorkerJs.includes('./src/app.js?v=20260610-03'), 'service worker should not keep the stale app entrypoint');
```

- [ ] **Step 2: Run the failing cache test**

Run:

```powershell
node tests\vercel-cache-config.test.mjs
```

Expected:

```text
FAIL because index.html and service-worker.js still reference older cache versions.
```

- [ ] **Step 3: Wire app route and identity load**

In `src/app.js`, import:

```js
import { initEmpresaConfigModule } from './modules/empresa-config/empresa-config.module.js';
import { applyCompanyIdentity, loadCompanySettings } from './services/empresa-config.service.js';
```

Add route:

```js
'empresa-config': initEmpresaConfigModule
```

Add route permission:

```js
'empresa-config': 'company_settings.manage'
```

Before rendering `app.innerHTML`, load and apply:

```js
  const companySettings = await loadCompanySettings();
  applyCompanyIdentity(companySettings);
```

Pass settings to sidebar:

```js
${renderSidebar(currentUser, companySettings)}
```

- [ ] **Step 4: Update cache versions**

In `index.html`, set:

```js
const LOCAL_CACHE_VERSION = '20260618-02-company-settings';
```

and:

```js
await import('./src/app.js?v=20260618-02');
```

In `service-worker.js`, set the cache name to:

```js
const CACHE_NAME = 'pdv-v59';
```

and precache:

```js
'./src/app.js?v=20260618-02'
```

- [ ] **Step 5: Run route and cache tests**

Run:

```powershell
node tests\sidebar-company-settings.test.mjs
node tests\vercel-cache-config.test.mjs
```

Expected:

```text
sidebar company settings ok
vercel cache config ok
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/app.js index.html service-worker.js tests/vercel-cache-config.test.mjs
git commit -m "feat: wire company settings route"
```

Expected:

```text
[branch ...] feat: wire company settings route
```

---

### Task 6: Add Supabase Migration And Storage Policies

**Files:**
- Create: migration file returned by `npx.cmd supabase migration new add_company_visual_settings`, with a name ending in `_add_company_visual_settings.sql`
- Create: `tests/company-settings-migration.test.mjs`

- [ ] **Step 1: Create static migration test**

Create `tests/company-settings-migration.test.mjs`:

```js
import { readdir, readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const migrationNames = await readdir(new URL('../supabase/migrations/', import.meta.url));
const migrationName = migrationNames.find((name) => name.endsWith('_add_company_visual_settings.sql'));

assert(migrationName, 'company settings migration should exist');

const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8');

[
  'create table if not exists public.empresas',
  'alter table public.profiles add column if not exists empresa_id',
  'create table if not exists public.empresa_configuracoes',
  "('company_settings.manage'",
  'alter table public.empresas enable row level security',
  'alter table public.empresa_configuracoes enable row level security',
  'create policy "company users read own company"',
  'create policy "company settings managers upsert own settings"',
  "insert into storage.buckets (id, name, public)",
  "values ('logos', 'logos', true)",
  'storage.objects'
].forEach((snippet) => {
  assert(sql.includes(snippet), `migration should include ${snippet}`);
});

assert(!sql.includes('auth.role()'), 'migration should not use deprecated auth.role()');
assert(sql.includes('to authenticated'), 'migration policies should use TO authenticated');
assert(sql.includes('with check'), 'update/insert policies should include WITH CHECK');

console.log('company settings migration ok');
```

- [ ] **Step 2: Run failing migration test**

Run:

```powershell
node tests\company-settings-migration.test.mjs
```

Expected:

```text
FAIL with "company settings migration should exist".
```

- [ ] **Step 3: Generate migration file**

Run:

```powershell
npx.cmd supabase migration new add_company_visual_settings
```

Expected:

```text
Created new migration at supabase/migrations/YYYYMMDDHHMMSS_add_company_visual_settings.sql
```

- [ ] **Step 4: Add migration SQL**

Open the generated migration file and insert:

```sql
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists empresa_id uuid references public.empresas(id);

insert into public.empresas (id, nome, slug)
values ('00000000-0000-0000-0000-000000000001', 'Lanchonete', 'lanchonete')
on conflict (id) do update
set nome = excluded.nome,
    slug = excluded.slug,
    updated_at = now();

update public.profiles
set empresa_id = '00000000-0000-0000-0000-000000000001'
where empresa_id is null;

alter table public.profiles
  alter column empresa_id set not null;

create table if not exists public.empresa_configuracoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id) on delete cascade,
  nome_sistema text not null default 'Zelo PDV',
  nome_fantasia text not null default 'Lanchonete',
  razao_social text,
  cnpj text,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  logo_url text,
  cor_primaria text not null default '#ff6b1a',
  cor_secundaria text not null default '#e65b11',
  cor_destaque text not null default '#fff0e6',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empresa_configuracoes_cor_primaria_hex check (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  constraint empresa_configuracoes_cor_secundaria_hex check (cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  constraint empresa_configuracoes_cor_destaque_hex check (cor_destaque ~ '^#[0-9A-Fa-f]{6}$')
);

insert into public.empresa_configuracoes (empresa_id, nome_sistema, nome_fantasia)
values ('00000000-0000-0000-0000-000000000001', 'Zelo PDV', 'Lanchonete')
on conflict (empresa_id) do nothing;

insert into public.permissions (id, description)
values ('company_settings.manage', 'Configurar nome, logo e cores da empresa')
on conflict (id) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
values
  ('admin', 'company_settings.manage'),
  ('dono', 'company_settings.manage')
on conflict do nothing;

grant select, insert, update on public.empresas to authenticated;
grant select, insert, update on public.empresa_configuracoes to authenticated;

alter table public.empresas enable row level security;
alter table public.empresa_configuracoes enable row level security;

drop policy if exists "company users read own company" on public.empresas;
create policy "company users read own company" on public.empresas
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresas.id
    )
  );

drop policy if exists "company settings users read own settings" on public.empresa_configuracoes;
create policy "company settings users read own settings" on public.empresa_configuracoes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
    )
  );

drop policy if exists "company settings managers insert own settings" on public.empresa_configuracoes;
create policy "company settings managers insert own settings" on public.empresa_configuracoes
  for insert
  to authenticated
  with check (
    private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
    )
  );

drop policy if exists "company settings managers upsert own settings" on public.empresa_configuracoes;
create policy "company settings managers upsert own settings" on public.empresa_configuracoes
  for update
  to authenticated
  using (
    private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
    )
  )
  with check (
    private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id = empresa_configuracoes.empresa_id
    )
  );

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "company users read own logos" on storage.objects;
create policy "company users read own logos" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'logos'
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "company settings managers insert own logos" on storage.objects;
create policy "company settings managers insert own logos" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'logos'
    and private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "company settings managers update own logos" on storage.objects;
create policy "company settings managers update own logos" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'logos'
    and private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'logos'
    and private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "company settings managers delete own logos" on storage.objects;
create policy "company settings managers delete own logos" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'logos'
    and private.current_profile_has_permission('company_settings.manage')
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.is_active = true
        and p.empresa_id::text = (storage.foldername(name))[1]
    )
  );
```

- [ ] **Step 5: Run migration static test**

Run:

```powershell
node tests\company-settings-migration.test.mjs
```

Expected:

```text
company settings migration ok
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add supabase/migrations tests/company-settings-migration.test.mjs
git commit -m "feat: add company settings schema"
```

Expected:

```text
[branch ...] feat: add company settings schema
```

---

### Task 7: Add Logo Upload Support

**Files:**
- Modify: `src/services/empresa-config.service.js`
- Modify: `src/modules/empresa-config/empresa-config.module.js`
- Modify: `tests/empresa-config-service.test.mjs`

- [ ] **Step 1: Add upload validation tests**

Append to `tests/empresa-config-service.test.mjs` before the final `console.log`:

```js
assertThrows(
  () => company.validateLogoFile({ type: 'text/plain', size: 100 }),
  'Arquivo de logo invalido.',
  'invalid logo type should fail'
);

assertThrows(
  () => company.validateLogoFile({ type: 'image/png', size: 3 * 1024 * 1024 }),
  'Logo deve ter no maximo 2 MB.',
  'oversized logo should fail'
);

assert(company.validateLogoFile({ type: 'image/png', size: 1024 }) === true, 'valid logo should pass');
```

- [ ] **Step 2: Run failing upload test**

Run:

```powershell
node tests\empresa-config-service.test.mjs
```

Expected:

```text
FAIL with "company.validateLogoFile is not a function".
```

- [ ] **Step 3: Implement logo helpers**

Add to `src/services/empresa-config.service.js`:

```js
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
const MAX_LOGO_SIZE = 2 * 1024 * 1024;

export function validateLogoFile(file) {
  if (!file || !LOGO_TYPES.has(file.type)) {
    throw new Error('Arquivo de logo invalido.');
  }

  if (Number(file.size) > MAX_LOGO_SIZE) {
    throw new Error('Logo deve ter no maximo 2 MB.');
  }

  return true;
}

export async function readLogoAsDataUrl(file) {
  validateLogoFile(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Nao foi possivel ler a logo.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadCompanyLogo(file, empresaId) {
  validateLogoFile(file);

  if (!isSupabaseEnabled()) {
    return readLogoAsDataUrl(file);
  }

  const client = await getSupabaseClient();

  if (!client?.storage) {
    return readLogoAsDataUrl(file);
  }

  const extension = getLogoExtension(file.type);
  const path = `${empresaId || 'local-company'}/logo-${Date.now()}.${extension}`;
  const { error } = await client.storage.from('logos').upload(path, file, {
    cacheControl: '3600',
    upsert: true
  });

  if (error) {
    throw error;
  }

  const { data } = client.storage.from('logos').getPublicUrl(path);
  return data.publicUrl;
}

function getLogoExtension(type) {
  return {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  }[type] || 'png';
}
```

- [ ] **Step 4: Wire file input in the module**

In `src/modules/empresa-config/empresa-config.module.js`, import:

```js
uploadCompanyLogo
```

from the service.

In `bindEmpresaConfigEvents`, add:

```js
  const logoInput = workspace.querySelector('[data-field="logoFile"]');

  logoInput?.addEventListener('change', async () => {
    const file = logoInput.files?.[0];
    if (!file) return;

    try {
      const current = collectSettings(form);
      const logoUrl = await uploadCompanyLogo(file, current.empresaId);
      await saveCompanySettings({ ...current, logoUrl });
      initEmpresaConfigModule(workspace);
    } catch (error) {
      showError(workspace, error.message || 'Nao foi possivel enviar a logo.');
    }
  });
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node tests\empresa-config-service.test.mjs
node tests\empresa-config-module.test.mjs
```

Expected:

```text
empresa config service ok
empresa config module ok
```

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/services/empresa-config.service.js src/modules/empresa-config/empresa-config.module.js tests/empresa-config-service.test.mjs
git commit -m "feat: support company logo upload"
```

Expected:

```text
[branch ...] feat: support company logo upload
```

---

### Task 8: Final Verification

**Files:**
- Read/verify all changed files
- No new feature files unless a verification failure requires a targeted fix

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node tests\empresa-config-service.test.mjs
node tests\empresa-config-module.test.mjs
node tests\sidebar-company-settings.test.mjs
node tests\permission-service.test.mjs
node tests\company-settings-migration.test.mjs
node tests\vercel-cache-config.test.mjs
```

Expected:

```text
empresa config service ok
empresa config module ok
sidebar company settings ok
permission service ok
company settings migration ok
vercel cache config ok
```

- [ ] **Step 2: Run broader regression tests**

Run:

```powershell
node tests\auth-service.test.mjs
node tests\supabase-provider.test.mjs
node tests\login-module.test.mjs
node tests\mobile-dashboard-module.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected:

```text
Each command prints its ok line and exits 0.
```

- [ ] **Step 3: Start local server**

Run:

```powershell
scripts\start-server.cmd
```

Expected:

```text
Server starts and the app is available at http://127.0.0.1:5500/
```

- [ ] **Step 4: Browser verification**

Open:

```text
http://127.0.0.1:5500/?view=empresa-config
```

Expected:

```text
Login appears if no session exists. After login as admin, Configuracoes da Empresa opens, saving name/color changes updates sidebar branding, and refreshing keeps the saved identity.
```

- [ ] **Step 5: Verify no document scope leaked in**

Run:

```powershell
rg -n "PDF|pdf|proposta|recibo|assinatura|comprovante|impress" src tests supabase
```

Expected:

```text
No new implementation references related to PDF, proposal, receipt, signature, voucher, or printing were added by this feature.
```

- [ ] **Step 6: Final commit if verification fixes were needed**

If Step 1-5 required fixes, commit only those fixes:

```powershell
git add src/database/schema.js src/services/permission.service.js src/services/empresa-config.service.js src/components/sidebar.component.js src/modules/empresa-config/empresa-config.module.js src/styles/sidebar.css src/styles/empresa-config.css src/app.js index.html service-worker.js tests/permission-service.test.mjs tests/empresa-config-service.test.mjs tests/sidebar-company-settings.test.mjs tests/empresa-config-module.test.mjs tests/company-settings-migration.test.mjs tests/vercel-cache-config.test.mjs supabase/migrations
git commit -m "fix: verify company visual settings"
```

Expected:

```text
A commit is created only when verification required code changes.
```
