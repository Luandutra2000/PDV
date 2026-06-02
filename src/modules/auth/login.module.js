import { login } from '../../services/auth.service.js';

export function renderLoginModule(container, onSuccess, options = {}) {
  container.innerHTML = `
    <section class="login-screen">
      <form class="login-card" data-login-form>
        <div class="login-mark" aria-hidden="true">PDV</div>
        <header class="login-header">
          <span>Zelo Lanchonete</span>
          <h1>Entrar no PDV</h1>
        </header>
        <label class="login-field">
          <span>Email</span>
          <input class="field" type="email" name="email" required autocomplete="username" placeholder="seu@email.com">
        </label>
        <label class="login-field">
          <span>Senha</span>
          <input class="field" type="password" name="password" required autocomplete="current-password" placeholder="Sua senha">
        </label>
        <button class="button login-button" type="submit">Entrar</button>
        <p class="form-error login-error" data-login-error ${options.message ? '' : 'hidden'}>${options.message || ''}</p>
      </form>
    </section>
  `;

  container.querySelector('[data-login-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const loginForm = event.currentTarget;
    const form = new FormData(loginForm);
    const error = container.querySelector('[data-login-error]');
    const button = loginForm.querySelector?.('[type="submit"]');
    const originalButtonText = button?.textContent || 'Entrar';

    error.hidden = true;
    error.textContent = '';
    if (button) {
      button.disabled = true;
      button.textContent = 'Entrando...';
    }

    try {
      await login({
        email: form.get('email'),
        password: form.get('password')
      });
      await onSuccess();
    } catch (loginError) {
      error.hidden = false;
      error.textContent = loginError.message;
      if (button) {
        button.disabled = false;
        button.textContent = originalButtonText;
      }
    }
  });
}
