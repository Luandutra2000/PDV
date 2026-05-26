import { isSupabaseEnabled } from '../../services/app-config.service.js';
import { createPersonUser, listPeople } from '../../services/people.service.js';
import { showNotification } from '../../services/notification.service.js';

const pessoasState = {
  loading: false,
  submitting: false,
  people: [],
  error: '',
  loadId: 0
};
const boundContainers = new WeakSet();

export function initPessoasModule(container) {
  renderPessoas(container);

  if (!boundContainers.has(container)) {
    bindPessoasEvents(container);
    boundContainers.add(container);
  }

  loadPeople(container);
}

function renderPessoas(container) {
  container.innerHTML = `
    <section class="module-screen pessoas-screen" data-pessoas-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Pessoas</h1>
          <p class="module-subtitle">Cadastre operadores e administradores para acessar o PDV online.</p>
        </div>
      </header>
      ${isSupabaseEnabled() ? renderOnlinePeople() : renderLocalWarning()}
    </section>
  `;
}

function renderOnlinePeople() {
  return `
    <section class="crm-panel people-panel">
      <header class="crm-panel__header">
        <h3>Novo usuario</h3>
        <span>Use uma senha inicial com pelo menos 6 caracteres</span>
      </header>
      <form class="people-form" data-people-form>
        <div class="form-grid">
          <label>
            Nome
            <input class="field" name="name" autocomplete="name" required>
          </label>
          <label>
            Email
            <input class="field" name="email" type="email" autocomplete="email" required>
          </label>
          <label>
            Senha inicial
            <input class="field" name="password" type="password" autocomplete="new-password" minlength="6" required>
          </label>
          <label>
            Perfil
            <select class="field" name="role">
              <option value="operador">Operador</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>
        <div class="form-actions">
          <button class="button" type="submit" ${pessoasState.submitting ? 'disabled' : ''}>
            ${pessoasState.submitting ? 'Criando...' : 'Criar usuario'}
          </button>
        </div>
      </form>
    </section>

    <section class="crm-panel people-panel">
      <header class="crm-panel__header">
        <h3>Usuarios cadastrados</h3>
        <span>${pessoasState.loading ? 'Carregando...' : `${pessoasState.people.length} pessoa(s)`}</span>
      </header>
      ${renderPeopleList()}
    </section>
  `;
}

function renderPeopleList() {
  if (pessoasState.error) {
    return `<div class="empty-products">${pessoasState.error}</div>`;
  }

  if (pessoasState.loading) {
    return '<div class="empty-products">Carregando usuarios...</div>';
  }

  if (!pessoasState.people.length) {
    return '<div class="empty-products">Nenhum usuario cadastrado ainda.</div>';
  }

  return `
    <div class="people-list">
      ${pessoasState.people.map((person) => `
        <article class="people-row">
          <div>
            <strong>${person.name}</strong>
            <span>${person.role === 'admin' ? 'Administrador' : 'Operador'}</span>
          </div>
          <span class="people-status ${person.active ? 'is-active' : ''}">${person.active ? 'Ativo' : 'Inativo'}</span>
        </article>
      `).join('')}
    </div>
  `;
}

function renderLocalWarning() {
  return `
    <div class="empty-products">
      Criacao de usuarios fica disponivel quando o PDV esta publicado em modo Supabase.
    </div>
  `;
}

function bindPessoasEvents(container) {
  container.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-people-form]');

    if (!form) {
      return;
    }

    event.preventDefault();
    await submitPersonForm(container, form);
  });
}

async function loadPeople(container) {
  if (!isSupabaseEnabled()) {
    return;
  }

  const loadId = pessoasState.loadId + 1;
  pessoasState.loadId = loadId;
  pessoasState.loading = true;
  pessoasState.error = '';
  renderPessoas(container);

  try {
    pessoasState.people = await listPeople();
  } catch (error) {
    pessoasState.error = error.message || 'Nao foi possivel carregar usuarios.';
  } finally {
    if (pessoasState.loadId !== loadId || !container.querySelector?.('[data-pessoas-screen]')) {
      return;
    }

    pessoasState.loading = false;
    renderPessoas(container);
  }
}

async function submitPersonForm(container, form) {
  const formData = new FormData(form);

  pessoasState.submitting = true;
  renderPessoas(container);

  try {
    await createPersonUser({
      name: formData.get('name'),
      email: formData.get('email'),
      password: formData.get('password'),
      role: formData.get('role')
    });
    showNotification({
      title: 'Usuario criado',
      message: 'A pessoa ja pode entrar no PDV online.',
      type: 'success'
    });
    await loadPeople(container);
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel criar',
      message: error.message || 'Confira os dados do usuario.',
      type: 'danger'
    });
  } finally {
    pessoasState.submitting = false;
    renderPessoas(container);
  }
}
