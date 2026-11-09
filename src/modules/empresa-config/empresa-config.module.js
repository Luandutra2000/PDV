import {
  getDefaultCompanySettings,
  loadCompanySettingsLocal,
  pickReadableInk,
  resolveBrandColors,
  saveCompanySettings,
  uploadCompanyLogo,
  validateCompanySettings
} from '../../services/empresa-config.service.js?v=20261109-01';

const boundContainers = new WeakSet();

const COLOR_FIELDS = [
  { name: 'corPrimaria', label: 'Cor primária', hint: 'Botões e destaques', brandKey: 'accent' },
  { name: 'corSecundaria', label: 'Cor secundária', hint: 'Botão ao passar o mouse', brandKey: 'accentStrong' },
  { name: 'corDestaque', label: 'Cor de destaque', hint: 'Fundos suaves e etiquetas', brandKey: 'accentSoft' }
];

export function initEmpresaConfigModule(workspace) {
  renderEmpresaConfigScreen(workspace);

  if (!boundContainers.has(workspace)) {
    bindEmpresaConfigEvents(workspace);
    boundContainers.add(workspace);
  }
}

function renderEmpresaConfigScreen(workspace) {
  workspace.innerHTML = renderEmpresaConfigMarkup(loadCompanySettingsLocal());
}

export function renderEmpresaConfigMarkup(settings) {
  const brand = resolveBrandColors(settings);
  const hasLogo = isSafePreviewLogoUrl(settings.logoUrl);

  return `
    <section class="ui-screen em" data-empresa-config-screen>
      <form class="em-form" data-company-settings-form novalidate>
        <header class="ui-head em-head">
          <div class="em-head__title">
            <h1 class="em-title">Empresa</h1>
            <p class="em-sub">Nome, logo, cores e dados que aparecem no PDV e no cupom.</p>
          </div>
          <div class="ui-head__actions">
            <button class="ui-btn ui-btn--ghost" type="button" data-action="restore-defaults">Restaurar padrão</button>
            <button class="ui-btn ui-btn--primary" type="submit">Salvar</button>
          </div>
        </header>

        <p class="form-error em-error" data-company-settings-error hidden></p>

        <div class="em-cols">
          <section class="ui-panel">
            <h2 class="ui-head">Logo e cores</h2>

            <div class="em-logo-row">
              <div class="em-logo">${renderBrandMark(settings)}</div>
              <div class="em-logo-info">
                <b>Logo da empresa</b>
                <small>PNG, JPG, WebP ou SVG, até 2 MB</small>
              </div>
              <label class="ui-btn ui-btn--sm em-file">
                ${hasLogo ? 'Trocar logo' : 'Enviar logo'}
                <input class="em-file__input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" data-field="logoFile" aria-label="Logo da empresa">
              </label>
            </div>
            <div class="em-logo-actions">
              <button class="ui-btn ui-btn--sm" type="button" data-action="remove-logo"${hasLogo ? '' : ' disabled'}>Remover logo</button>
            </div>

            <div class="em-swatches">
              ${COLOR_FIELDS.map((field) => renderColorField(field, brand[field.brandKey])).join('')}
            </div>
          </section>

          <section class="ui-panel">
            <h2 class="ui-head">Dados da empresa</h2>

            ${renderTextField('nomeSistema', 'Nome do programa', settings.nomeSistema, 'Ex.: Zelo PDV', true)}
            ${renderTextField('nomeFantasia', 'Nome fantasia', settings.nomeFantasia, 'Ex.: Lanchonete Central', true)}
            ${renderTextField('razaoSocial', 'Razão social', settings.razaoSocial, 'Razão social completa')}
            <div class="em-row2">
              ${renderTextField('cnpj', 'CNPJ', settings.cnpj, 'Somente números')}
              ${renderTextField('telefone', 'Telefone', settings.telefone, '(00) 0000-0000')}
            </div>
            <div class="em-row2">
              ${renderTextField('whatsapp', 'WhatsApp', settings.whatsapp, '(00) 00000-0000')}
              ${renderTextField('email', 'E-mail', settings.email, 'contato@empresa.com', false, 'email')}
            </div>
            ${renderTextField('endereco', 'Endereço', settings.endereco, 'Rua, número, bairro e cidade')}
          </section>

          <section class="ui-panel em-preview-panel">
            <h2 class="ui-head">Prévia</h2>
            ${renderPreview(settings)}
          </section>
        </div>
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

  // Previa ao vivo: cores e nomes digitados valem so no elemento da previa
  // (nunca na raiz) ate o usuario salvar.
  workspace.addEventListener('input', (event) => {
    const form = event.target.closest?.('[data-company-settings-form]');

    if (form) {
      updateLivePreview(workspace, form);
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
  const id = `em-field-${name}`;

  return `
    <div class="ui-field">
      <label for="${id}">${escapeHtml(label)}</label>
      <input
        id="${id}"
        class="ui-input"
        type="${escapeAttribute(type)}"
        name="${escapeAttribute(name)}"
        data-field="${escapeAttribute(name)}"
        value="${escapeAttribute(value)}"
        placeholder="${escapeAttribute(placeholder)}"${requiredAttribute}
      >
    </div>
  `;
}

function renderColorField({ name, label, hint }, color) {
  return `
    <label class="em-swatch">
      <input
        class="em-swatch__input"
        type="color"
        name="${escapeAttribute(name)}"
        data-field="${escapeAttribute(name)}"
        value="${escapeAttribute(color)}"
      >
      <span class="em-swatch__text">
        <b>${escapeHtml(label)}</b>
        <small>${escapeHtml(hint)} · <span data-color-hex="${escapeAttribute(name)}">${escapeHtml(color)}</span></small>
      </span>
    </label>
  `;
}

// As cores da empresa viram variaveis so no elemento da previa. O texto sobre a
// cor principal e o texto sobre o fundo suave seguem a mesma regra de contraste do app.
export function buildPreviewVars(colors = {}) {
  const brand = resolveBrandColors(colors);

  return {
    '--accent': brand.accent,
    '--accent-strong': brand.accentStrong,
    '--accent-soft': brand.accentSoft,
    '--accent-ink': brand.accentInk,
    '--accent-soft-ink': pickReadableInk(brand.accentSoft)
  };
}

function renderPreview(settings) {
  const vars = buildPreviewVars(settings);
  const style = Object.entries(vars).map(([name, value]) => `${name}: ${value}`).join('; ');

  return `
    <div class="em-preview" data-company-preview style="${escapeAttribute(style)};">
      <div class="em-brand">
        <div class="em-logo em-logo--sm">${renderBrandMark(settings, true)}</div>
        <div class="em-brand__text">
          <b data-preview-name>${escapeHtml(settings.nomeSistema)}</b>
          <small data-preview-sub>${escapeHtml(settings.nomeFantasia)}</small>
        </div>
      </div>
      <div class="em-pay" aria-hidden="true"><span>Receber</span><span>R$ 74,00</span></div>
      <div class="em-item" style="--c: var(--cat-lanches);">
        <span class="em-item__name">X-Burger</span>
        <span class="em-item__meta">14 em estoque</span>
        <span class="em-item__price">R$ 16,00</span>
      </div>
      <p class="em-note">A prévia mostra as cores escolhidas. Elas só valem no PDV depois de salvar.</p>
    </div>
  `;
}

function renderBrandMark(settings, live = false) {
  if (isSafePreviewLogoUrl(settings.logoUrl)) {
    return `
      <img
        class="em-logo__image"
        src="${escapeAttribute(settings.logoUrl)}"
        alt="${escapeAttribute(settings.nomeFantasia || settings.nomeSistema || 'Logo da empresa')}"
      >
    `;
  }

  const initial = Array.from(String(settings.nomeSistema || '').trim())[0]?.toLocaleUpperCase('pt-BR') || 'P';
  const hook = live ? ' data-preview-initial' : '';

  return `<span class="em-logo__initial"${hook}>${escapeHtml(initial)}</span>`;
}

function updateLivePreview(workspace, form) {
  const read = (name) => form.querySelector?.(`[name="${name}"]`)?.value ?? '';
  const colors = {
    corPrimaria: read('corPrimaria'),
    corSecundaria: read('corSecundaria'),
    corDestaque: read('corDestaque')
  };
  const preview = workspace.querySelector?.('[data-company-preview]');

  if (preview?.style) {
    Object.entries(buildPreviewVars(colors)).forEach(([name, value]) => preview.style.setProperty(name, value));
  }

  const brand = resolveBrandColors(colors);
  COLOR_FIELDS.forEach(({ name, brandKey }) => {
    const hex = workspace.querySelector?.(`[data-color-hex="${name}"]`);

    if (hex) {
      hex.textContent = brand[brandKey];
    }
  });

  const systemName = String(read('nomeSistema')).trim();
  const nameTarget = workspace.querySelector?.('[data-preview-name]');
  const subTarget = workspace.querySelector?.('[data-preview-sub]');
  const initialTarget = workspace.querySelector?.('[data-preview-initial]');

  if (nameTarget) {
    nameTarget.textContent = systemName;
  }

  if (subTarget) {
    subTarget.textContent = String(read('nomeFantasia')).trim();
  }

  if (initialTarget) {
    initialTarget.textContent = Array.from(systemName)[0]?.toLocaleUpperCase('pt-BR') || 'P';
  }
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
