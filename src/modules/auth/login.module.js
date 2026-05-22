import { login } from '../../services/auth.service.js';

export function renderLoginModule(container, onSuccess) {
  container.innerHTML = `
    <section class="module-screen">
      <header class="module-header">
        <h1 class="pdv-title">Entrar no PDV</h1>
      </header>
      <form class="form-grid" data-login-form>
        <label class="field-group">
          <span>Email</span>
          <input class="field" type="email" name="email" required autocomplete="username">
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
    const form = new FormData(event.currentTarget);
    const error = container.querySelector('[data-login-error]');

    try {
      await login({
        email: form.get('email'),
        password: form.get('password')
      });
      onSuccess();
    } catch (loginError) {
      error.hidden = false;
      error.textContent = loginError.message;
    }
  });
}
