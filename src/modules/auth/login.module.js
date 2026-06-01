import { login } from '../../services/auth.service.js';

export function renderLoginModule(container, onSuccess, options = {}) {
  container.innerHTML = `
    <section class="login-screen">
      <form class="login-card" data-login-form>
        <div>
          <p class="module-subtitle">PDV Lanchonete</p>
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

  container.querySelector('[data-login-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = container.querySelector('[data-login-error]');

    try {
      login({
        username: form.get('username'),
        password: form.get('password')
      });
      onSuccess();
    } catch (loginError) {
      error.hidden = false;
      error.textContent = loginError.message;
    }
  });
}
