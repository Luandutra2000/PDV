import { login } from '../../services/auth.service.js?v=20260807-03';
import { loadCompanySettingsLocal } from '../../services/empresa-config.service.js?v=20260807-05';
import { escapeHtml } from '../../utils/dom.js?v=20260804-06';
import { isAllowedLogoUrl } from '../../utils/logo-url.js?v=20260807-11';

const DEFAULT_COMPANY_NAME = 'Lanchonete';

export function renderLoginModule(container, onSuccess, options = {}) {
  const companyName = readCompanyName();
  const logoUrl = readCompanyLogoUrl();

  container.innerHTML = `
    <section class="lg" aria-label="Entrar no PDV">
      <aside class="lg-side">
        ${renderBrandMark(logoUrl, companyName)}
        <div class="lg-side__text">
          <p class="lg-side__name">${escapeHtml(companyName)}</p>
          <p class="lg-side__tagline">Frente de caixa, vitrine e financeiro num lugar só.</p>
        </div>
        <div class="lg-side__cats" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      </aside>
      <div class="lg-main">
        <form class="lg-card" data-login-form>
          <h1 class="lg-card__title">Entrar no PDV</h1>
          <p class="lg-card__hint">Use o e-mail e a senha que o administrador cadastrou.</p>
          ${options.message ? `<p class="lg-error" role="alert">${escapeHtml(options.message)}</p>` : ''}
          <div class="ui-field">
            <label for="lg-username">E-mail</label>
            <input class="ui-input lg-input" id="lg-username" type="text" name="username" required autocomplete="username" autocapitalize="none" spellcheck="false">
          </div>
          <div class="ui-field">
            <label for="lg-password">Senha</label>
            <div class="ui-input lg-input lg-pass">
              <input class="lg-pass__field" id="lg-password" type="password" name="password" required autocomplete="current-password">
              <button class="lg-pass__toggle" type="button" data-login-toggle-password aria-label="Mostrar senha">Mostrar</button>
            </div>
          </div>
          <button class="ui-btn ui-btn--primary lg-submit" type="submit">Entrar</button>
          <p class="lg-error" data-login-error role="alert" hidden></p>
          <p class="lg-card__help">Esqueceu a senha? Fale com o administrador.</p>
        </form>
      </div>
    </section>
  `;

  bindPasswordToggle(container);

  container.querySelector('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const form = new FormData(event.currentTarget);
    const error = container.querySelector('[data-login-error]');
    const originalLabel = button?.textContent || 'Entrar';

    try {
      if (button) {
        button.disabled = true;
        button.textContent = 'Entrando...';
      }
      error.hidden = true;
      await login({
        username: form.get('username'),
        password: form.get('password')
      });
      onSuccess();
    } catch (loginError) {
      error.hidden = false;
      error.textContent = loginError.message;
      if (button) {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    }
  });
}

function bindPasswordToggle(container) {
  const toggle = container.querySelector('[data-login-toggle-password]');
  const field = container.querySelector('input[name="password"]');

  if (!toggle || !field) {
    return;
  }

  toggle.addEventListener('click', () => {
    const reveal = field.type === 'password';
    field.type = reveal ? 'text' : 'password';
    toggle.textContent = reveal ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', reveal ? 'Ocultar senha' : 'Mostrar senha');
  });
}

function readCompanySettings() {
  try {
    return loadCompanySettingsLocal();
  } catch (error) {
    return {};
  }
}

function readCompanyName() {
  const settings = readCompanySettings();
  return String(settings.nomeFantasia || '').trim() || DEFAULT_COMPANY_NAME;
}

function readCompanyLogoUrl() {
  const logoUrl = readCompanySettings().logoUrl;
  return isAllowedLogoUrl(logoUrl) ? logoUrl.trim() : '';
}

function renderBrandMark(logoUrl, companyName) {
  if (logoUrl) {
    return `<span class="lg-brand"><img class="lg-brand__logo" src="${escapeHtml(logoUrl)}" alt=""></span>`;
  }

  const initial = Array.from(companyName.trim())[0]?.toLocaleUpperCase('pt-BR') || 'P';
  return `<span class="lg-brand" aria-hidden="true">${escapeHtml(initial)}</span>`;
}
