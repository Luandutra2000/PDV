import { createUser, getUsers, updateUser } from '../../services/auth.service.js';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js';
import {
  PERMISSIONS,
  getRolePermissions,
  getUserPermissionOverride,
  setUserPermissionOverride
} from '../../services/permission.service.js';

const peopleState = {
  editingUserId: null,
  selectedUserId: null
};
const boundContainers = new WeakSet();

export function initPessoasModule(container) {
  ensureSelectedUser();
  renderPeople(container);

  if (!boundContainers.has(container)) {
    bindPeopleEvents(container);
    boundContainers.add(container);
  }
}

function renderPeople(container) {
  const users = getUsers();
  const selectedUser = users.find((user) => user.id === peopleState.selectedUserId) || users[0] || null;
  const editingUser = users.find((user) => user.id === peopleState.editingUserId) || null;

  container.innerHTML = `
    <section class="module-screen people-screen" data-people-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Pessoas</h1>
          <p class="module-subtitle">Usuarios, perfis e permissoes individuais.</p>
        </div>
        <button class="button" type="button" data-action="new-user">Novo usuario</button>
      </header>

      <div class="people-grid">
        <section class="manager-section">
          <header class="manager-section__header">
            <strong>Usuarios</strong>
          </header>
          <div class="manager-list people-list">
            ${renderUserList(users)}
          </div>
        </section>

        <section class="manager-section">
          <header class="manager-section__header">
            <strong>${editingUser ? 'Editar usuario' : 'Cadastrar usuario'}</strong>
          </header>
          ${renderUserForm(editingUser)}
        </section>
      </div>

      ${selectedUser ? renderPermissionPanel(selectedUser) : ''}
    </section>
  `;
}

function bindPeopleEvents(container) {
  container.addEventListener('click', (event) => {
    if (!event.target.closest('[data-people-screen]')) {
      return;
    }

    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    if (button.dataset.action === 'new-user') {
      peopleState.editingUserId = null;
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'select-user') {
      peopleState.selectedUserId = button.dataset.userId;
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'edit-user') {
      peopleState.editingUserId = button.dataset.userId;
      peopleState.selectedUserId = button.dataset.userId;
      renderPeople(container);
    }
  });

  container.addEventListener('submit', (event) => {
    if (!event.target.closest('[data-people-screen]') || !event.target.matches('[data-user-form]')) {
      return;
    }

    event.preventDefault();
    const form = new FormData(event.target);
    const editingUserId = form.get('id') || '';
    const payload = {
      name: form.get('name'),
      username: form.get('username'),
      role: form.get('role'),
      active: form.get('active') === 'on'
    };
    const password = String(form.get('password') || '').trim();

    if (password || !editingUserId) {
      payload.password = password;
    }

    try {
      const user = editingUserId
        ? updateUser(editingUserId, payload)
        : createUser(payload);

      recordAudit({
        action: editingUserId ? 'user.update' : 'user.create',
        entityType: 'user',
        entityId: user.id,
        metadata: {
          username: user.username,
          role: user.role,
          active: user.active
        }
      });

      peopleState.editingUserId = user.id;
      peopleState.selectedUserId = user.id;
      renderPeople(container);
    } catch (error) {
      renderFormError(event.target, error.message || 'Nao foi possivel salvar o usuario.');
    }
  });

  container.addEventListener('change', (event) => {
    const select = event.target.closest('[data-permission-select]');

    if (!select || !event.target.closest('[data-people-screen]')) {
      return;
    }

    const userId = select.dataset.userId;
    const permissionId = select.dataset.permissionId;
    const state = select.value;

    setUserPermissionOverride(userId, permissionId, state);
    recordAudit({
      action: 'permission.override',
      entityType: 'user',
      entityId: userId,
      metadata: { permissionId, state }
    });
    renderPeople(container);
  });
}

function renderUserList(users) {
  if (!users.length) {
    return '<div class="empty-products">Nenhum usuario cadastrado.</div>';
  }

  return users.map((user) => `
    <article class="people-row ${user.id === peopleState.selectedUserId ? 'is-selected' : ''}">
      <button class="people-row__main" type="button" data-action="select-user" data-user-id="${user.id}">
        <strong>${escapeHtml(user.name)}</strong>
        <span>${getRoleLabel(user.role)} - ${user.active ? 'Ativo' : 'Inativo'}</span>
      </button>
      <button class="button button--ghost" type="button" data-action="edit-user" data-user-id="${user.id}">Editar</button>
    </article>
  `).join('');
}

function renderUserForm(user) {
  return `
    <form class="product-form people-form" data-user-form>
      <input type="hidden" name="id" value="${user?.id || ''}">
      <p class="form-error" data-user-form-error hidden></p>
      <div class="form-grid">
        <label>
          Nome
          <input class="field" name="name" value="${escapeHtml(user?.name || '')}" required>
        </label>
        <label>
          Usuario
          <input class="field" name="username" value="${escapeHtml(user?.username || '')}" required>
        </label>
        <label>
          Senha
          <input class="field" name="password" type="password" ${user ? 'placeholder="Preencha para alterar"' : 'required'}>
        </label>
        <label>
          Perfil
          <select class="field" name="role" required>
            <option value="operator" ${user?.role === 'operator' ? 'selected' : ''}>Operador</option>
            <option value="admin" ${user?.role === 'admin' ? 'selected' : ''}>Administrador</option>
          </select>
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="active" ${user?.active === false ? '' : 'checked'}>
          Usuario ativo
        </label>
      </div>
      <div class="form-actions">
        <button class="button" type="submit">${user ? 'Salvar usuario' : 'Cadastrar usuario'}</button>
      </div>
    </form>
  `;
}

function renderPermissionPanel(user) {
  const groups = groupPermissions();
  const rolePermissions = new Set(getRolePermissions(user.role));
  const isAdmin = user.role === 'admin';

  return `
    <section class="manager-section permission-panel">
      <header class="manager-section__header">
        <div>
          <strong>Permissoes de ${escapeHtml(user.name)}</strong>
          <span>${isAdmin ? 'Administrador tem acesso total nesta versao.' : 'Ajustes individuais vencem o perfil base.'}</span>
        </div>
      </header>
      <div class="permission-grid">
        ${groups.map(([group, permissions]) => `
          <section class="permission-group">
            <h3>${group}</h3>
            ${permissions.map((permission) => renderPermissionRow(user, permission, rolePermissions, isAdmin)).join('')}
          </section>
        `).join('')}
      </div>
      ${renderUserAudit(user.id)}
    </section>
  `;
}

function renderPermissionRow(user, permission, rolePermissions, isAdmin) {
  const override = getUserPermissionOverride(user.id, permission.id);
  const defaultState = isAdmin || rolePermissions.has(permission.id) ? 'Liberado no perfil' : 'Bloqueado no perfil';

  return `
    <label class="permission-row">
      <span>
        <strong>${escapeHtml(permission.label)}</strong>
        <small>${defaultState}</small>
      </span>
      <select class="field" data-permission-select data-user-id="${user.id}" data-permission-id="${permission.id}" ${isAdmin ? 'disabled' : ''}>
        <option value="default" ${override === 'default' ? 'selected' : ''}>Padrao</option>
        <option value="allow" ${override === 'allow' ? 'selected' : ''}>Liberado</option>
        <option value="deny" ${override === 'deny' ? 'selected' : ''}>Bloqueado</option>
      </select>
    </label>
  `;
}

function renderUserAudit(userId) {
  const logs = getAuditLogs()
    .filter((entry) => entry.entityType === 'user' && entry.entityId === userId)
    .slice(0, 6);

  if (!logs.length) {
    return '<div class="empty-products">Nenhuma alteracao registrada para este usuario.</div>';
  }

  return `
    <div class="user-audit-list">
      ${logs.map((entry) => `
        <div>
          <strong>${getAuditLabel(entry.action)}</strong>
          <span>${formatDate(entry.createdAt)} - ${escapeHtml(entry.userName)}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function groupPermissions() {
  return Object.entries(PERMISSIONS.reduce((groups, permission) => {
    groups[permission.group] = groups[permission.group] || [];
    groups[permission.group].push(permission);
    return groups;
  }, {}));
}

function ensureSelectedUser() {
  const users = getUsers();

  if (!peopleState.selectedUserId || !users.some((user) => user.id === peopleState.selectedUserId)) {
    peopleState.selectedUserId = users[0]?.id || null;
  }
}

function renderFormError(form, message) {
  const target = form.querySelector('[data-user-form-error]');

  if (!target) {
    return;
  }

  target.hidden = false;
  target.textContent = message;
}

function getRoleLabel(role) {
  return role === 'admin' ? 'Administrador' : 'Operador';
}

function getAuditLabel(action) {
  const labels = {
    'user.create': 'Usuario criado',
    'user.update': 'Usuario editado',
    'permission.override': 'Permissao alterada'
  };

  return labels[action] || action;
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
