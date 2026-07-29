import {
  getDefaultCompanySettings,
  loadCompanySettingsLocal,
  saveCompanySettings,
  uploadCompanyLogo,
  validateCompanySettings
} from '../../services/empresa-config.service.js?v=20260729-12';

const boundContainers = new WeakSet();
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function initEmpresaConfigModule(workspace) {
  renderEmpresaConfigScreen(workspace);

  if (!boundContainers.has(workspace)) {
    bindEmpresaConfigEvents(workspace);
    boundContainers.add(workspace);
  }
}

function renderEmpresaConfigScreen(workspace) {
  const settings = loadCompanySettingsLocal();

  workspace.innerHTML = `
    <section class="module-screen empresa-config-screen" data-empresa-config-screen>
      <header class="module-header empresa-config-header">
        <div>
          <p class="module-subtitle">Identidade do sistema</p>
          <h1 class="pdv-title">Configurações da Empresa</h1>
          <p class="module-subtitle">Ajuste nome, logo, cores e dados basicos exibidos dentro do PDV.</p>
        </div>
      </header>

      <form class="empresa-config-form" data-company-settings-form novalidate>
        <p class="form-error" data-company-settings-error hidden></p>

        <div class="empresa-config-grid">
          <section class="empresa-config-card">
            <header>
              <span>Identidade visual</span>
              <strong>Logo e cores</strong>
            </header>

            <label class="field-group empresa-config-logo-field">
              <span>Logo da empresa</span>
              <input class="field" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-field="logoFile" aria-label="Logo da empresa">
            </label>

            <div class="empresa-config-logo-preview">
              ${renderLogoPreview(settings)}
            </div>

            <div class="empresa-config-color-grid">
              ${renderColorField('corPrimaria', 'Cor primária', settings.corPrimaria)}
              ${renderColorField('corSecundaria', 'Cor secundaria', settings.corSecundaria)}
              ${renderColorField('corDestaque', 'Cor de destaque', settings.corDestaque)}
            </div>
          </section>

          <section class="empresa-config-card">
            <header>
              <span>Nome do programa</span>
              <strong>Como o PDV aparece</strong>
            </header>

            ${renderTextField('nomeSistema', 'Nome do programa', settings.nomeSistema, 'Ex.: Zelo PDV', true)}
            ${renderTextField('nomeFantasia', 'Nome fantasia', settings.nomeFantasia, 'Ex.: Lanchonete Central', true)}
          </section>

          <section class="empresa-config-card">
            <header>
              <span>Dados básicos</span>
              <strong>Cadastro da empresa</strong>
            </header>

            <div class="empresa-config-two-columns">
              ${renderTextField('razaoSocial', 'Razao social', settings.razaoSocial, 'Razao social completa')}
              ${renderTextField('cnpj', 'CNPJ', settings.cnpj, 'Somente numeros')}
              ${renderTextField('telefone', 'Telefone', settings.telefone, '(00) 0000-0000')}
              ${renderTextField('whatsapp', 'WhatsApp', settings.whatsapp, '(00) 00000-0000')}
            </div>
            ${renderTextField('email', 'E-mail', settings.email, 'contato@empresa.com', false, 'email')}
            ${renderTextField('endereco', 'Endereco', settings.endereco, 'Rua, numero, bairro e cidade')}
          </section>

          <section class="empresa-config-card empresa-config-preview-card">
            <header>
              <span>Pré-visualização</span>
              <strong>Marca aplicada</strong>
            </header>

            ${renderPreview(settings)}
          </section>
        </div>

        <footer class="empresa-config-actions">
          <button class="button button--ghost" type="button" data-action="restore-defaults">Restaurar padrao</button>
          <button class="button button--ghost" type="button" data-action="remove-logo">Remover logo</button>
          <button class="button" type="submit">Salvar configurações</button>
        </footer>
      </form>
    </section>
  `;
}

function bindEmpresaConfigEvents(workspace) {
  workspace.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-company-settings-form]')) {
      return;
    }

    event.preventDefault();

    try {
      const payload = collectSettings(event.target);
      await saveCompanySettings(payload);
      renderEmpresaConfigScreen(workspace);
    } catch (error) {
      showError(workspace, error.message || 'Nao foi possivel salvar as configuracoes.');
    }
  });

  workspace.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');

    if (!actionButton || !actionButton.closest('[data-empresa-config-screen]')) {
      return;
    }

    try {
      if (actionButton.dataset.action === 'restore-defaults') {
        await saveCompanySettings(getRestoreDefaultsPayload());
        renderEmpresaConfigScreen(workspace);
      }

      if (actionButton.dataset.action === 'remove-logo') {
        const currentSettings = loadCompanySettingsLocal();
        await saveCompanySettings({ ...currentSettings, logoUrl: '' });
        renderEmpresaConfigScreen(workspace);
      }
    } catch (error) {
      showError(workspace, error.message || 'Nao foi possivel atualizar as configuracoes.');
    }
  });

  workspace.addEventListener('change', async (event) => {
    if (!event.target.matches('[data-field="logoFile"]')) {
      return;
    }

    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const form = event.target.closest?.('[data-company-settings-form]');
      const currentSettings = form ? collectSettings(form) : loadCompanySettingsLocal();
      const logoUrl = await uploadCompanyLogo(file, currentSettings.empresaId);
      await saveCompanySettings({ ...currentSettings, logoUrl });
      renderEmpresaConfigScreen(workspace);
    } catch (error) {
      showError(workspace, error.message || 'Nao foi possivel enviar o logo.');
    }
  });
}

function getRestoreDefaultsPayload() {
  const currentSettings = loadCompanySettingsLocal();
  const defaultSettings = getDefaultCompanySettings();

  return {
    ...defaultSettings,
    id: currentSettings.id || defaultSettings.id,
    empresaId: currentSettings.empresaId || defaultSettings.empresaId
  };
}

function renderTextField(name, label, value, placeholder = '', required = false, type = 'text') {
  const requiredAttribute = required ? ' required' : '';

  return `
    <label class="field-group">
      <span>${escapeHtml(label)}</span>
      <input
        class="field"
        type="${escapeAttribute(type)}"
        name="${escapeAttribute(name)}"
        data-field="${escapeAttribute(name)}"
        value="${escapeAttribute(value)}"
        placeholder="${escapeAttribute(placeholder)}"${requiredAttribute}
      >
    </label>
  `;
}

function renderColorField(name, label, value) {
  const color = sanitizeColor(value);

  return `
    <label class="field-group empresa-config-color-field">
      <span>${escapeHtml(label)}</span>
      <input
        class="field"
        type="color"
        name="${escapeAttribute(name)}"
        data-field="${escapeAttribute(name)}"
        value="${escapeAttribute(color)}"
      >
    </label>
  `;
}

function renderPreview(settings) {
  const primary = sanitizeColor(settings.corPrimaria);
  const secondary = sanitizeColor(settings.corSecundaria);
  const accent = sanitizeColor(settings.corDestaque);

  return `
    <div
      class="empresa-config-preview"
      data-company-preview
      style="--preview-primary: ${escapeAttribute(primary)}; --preview-secondary: ${escapeAttribute(secondary)}; --preview-accent: ${escapeAttribute(accent)};"
    >
      <div class="empresa-config-preview__bar"></div>
      <div class="empresa-config-preview__brand">
        ${renderLogoPreview(settings)}
        <div>
          <strong>${escapeHtml(settings.nomeSistema)}</strong>
          <span>${escapeHtml(settings.nomeFantasia)}</span>
        </div>
      </div>
      <div class="empresa-config-preview__body">
        <span>${escapeHtml(settings.razaoSocial || 'Dados da empresa')}</span>
        <small>${escapeHtml(settings.email || settings.telefone || 'Sem contato informado')}</small>
      </div>
    </div>
  `;
}

function renderLogoPreview(settings) {
  if (!isSafePreviewLogoUrl(settings.logoUrl)) {
    return '<div class="empresa-config-logo-empty">Sem logo</div>';
  }

  return `
    <img
      class="empresa-config-logo-image"
      src="${escapeAttribute(settings.logoUrl)}"
      alt="${escapeAttribute(settings.nomeFantasia || settings.nomeSistema || 'Logo da empresa')}"
    >
  `;
}

function collectSettings(form) {
  const formData = new FormData(form);
  const currentSettings = loadCompanySettingsLocal();
  const payload = {
    ...currentSettings,
    nomeSistema: formData.get('nomeSistema'),
    nomeFantasia: formData.get('nomeFantasia'),
    razaoSocial: formData.get('razaoSocial'),
    cnpj: formData.get('cnpj'),
    telefone: formData.get('telefone'),
    whatsapp: formData.get('whatsapp'),
    email: formData.get('email'),
    endereco: formData.get('endereco'),
    corPrimaria: formData.get('corPrimaria'),
    corSecundaria: formData.get('corSecundaria'),
    corDestaque: formData.get('corDestaque')
  };

  return validateCompanySettings(payload);
}

function showError(workspace, message) {
  const errorTarget = workspace.querySelector?.('[data-company-settings-error]');

  if (!errorTarget) {
    return;
  }

  errorTarget.textContent = message;
  errorTarget.hidden = false;
}

function isSafePreviewLogoUrl(value) {
  const url = String(value || '').trim();

  if (!url) {
    return false;
  }

  if (/^https?:\/\/[^\s"'<>]+$/i.test(url)) {
    return true;
  }

  if (/^data:image\/(?:png|jpeg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(url)) {
    return true;
  }

  return /^blob:[^\s"'<>]+$/i.test(url);
}

function sanitizeColor(value) {
  const color = String(value || '').trim();
  return HEX_COLOR_PATTERN.test(color) ? color : '#ff6b1a';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}
