import { login } from '../../services/auth.service.js?v=20260807-03';
import { bindBubbleBackground, renderBubbleBackground } from '../../components/ui/components-backgrounds-bubble.js?v=20260804-06';

export function renderLoginModule(container, onSuccess, options = {}) {
  container.innerHTML = `
    ${renderBubbleBackground({ interactive: true })}
    <section class="login-screen">
      <form class="login-card" data-login-form>
        <div class="login-card__brand">
          <span class="login-card__logo" aria-hidden="true">S</span>
          <h1 aria-label="Entrar no PDV">Welcome Back</h1>
          <p>Sign in to continue to PDV Lanchonete</p>
        </div>
        ${options.message ? `<p class="form-error">${options.message}</p>` : ''}
        <label class="field-group">
          <span class="login-field-label">Usuario</span>
          <span class="login-input-wrap">
            <span class="login-input-icon" aria-hidden="true">✉</span>
            <input class="field" type="text" name="username" placeholder="Email address" required autocomplete="username">
          </span>
        </label>
        <label class="field-group">
          <span class="login-field-label">Senha</span>
          <span class="login-input-wrap">
            <span class="login-input-icon" aria-hidden="true">♙</span>
            <input class="field" type="password" name="password" placeholder="Password" required autocomplete="current-password">
          </span>
        </label>
        <div class="login-card__options">
          <label class="login-remember"><input type="checkbox" name="remember"> <span>Remember me</span></label>
          <span class="login-link login-link--muted">Forgot password?</span>
        </div>
        <button class="button login-submit" type="submit">Entrar</button>
        <div class="login-divider"><span></span><small>or</small><span></span></div>
        <button class="login-google" type="button"><strong>G</strong><span>Sign in with Google</span></button>
        <p class="login-signup">Don&apos;t have an account? <span class="login-link">Sign up</span></p>
        <p class="form-error" data-login-error hidden></p>
      </form>
    </section>
  `;

  bindBubbleBackground(container);

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
