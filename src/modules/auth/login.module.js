import { login } from '../../services/auth.service.js?v=20260804-04';

export function renderLoginModule(container, onSuccess, options = {}) {
  container.innerHTML = `
    <section class="login-screen">
      <form class="login-card" data-login-form>
        <div>
          <p class="module-subtitle">PDV</p>
          <h1 class="pdv-title">Entrar no PDV</h1>
        </div>
        ${options.message ? `<p class="form-error">${options.message}</p>` : ''}
        <label class="field-group">
          <span>Usuario</span>
          <input class="field" type="text" name="username" required autocomplete="username">
        </label>
        <label class="field-group">
          <span>Senha</span>
          <input class="field" type="password" name="password" required autocomplete="current-password">
        </label>
        <button class="button" type="submit">Entrar</button>
        <p class="form-error" data-login-error hidden></p>
      </form>
    </section>
  `;

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
