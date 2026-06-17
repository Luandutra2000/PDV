import { createUser, getUsers, updateUser } from '../../services/auth.service.js';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js';
import {
  PERMISSIONS,
  getRolePermissions,
  getUserPermissionOverride,
  setUserPermissionOverride,
  normalizeRole
} from '../../services/permission.service.js';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'operador', label: 'Operador/Caixa' },
  { value: 'dono', label: 'Visualizador/Dono' }
];

const peopleState = {
  editingUserId: null,
  selectedUserId: null,
  modalRole: 'operador',
  modalPermissions: {}
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
      peopleState.modalRole = 'operador';
      peopleState.modalPermissions = buildRolePermissionState('operador');
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
      const user = getUsers().find((candidate) => candidate.id === button.dataset.userId);
      peopleState.modalRole = normalizeRole(user?.role || 'operador');
      peopleState.modalPermissions = buildUserPermissionState(user);
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
      role: normalizeRole(form.get('role')),
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
    const roleSelect = event.target.closest('[data-role-select]');

    if (roleSelect && event.target.closest('[data-people-screen]')) {
      peopleState.modalRole = normalizeRole(event.target.value);
      peopleState.modalPermissions = buildRolePermissionState(peopleState.modalRole);
      renderPeople(container);
      return;
    }

    const permissionCheckbox = event.target.closest('[data-permission-checkbox]');

    if (permissionCheckbox && event.target.closest('[data-people-screen]')) {
      peopleState.modalPermissions = {
        ...peopleState.modalPermissions,
        [permissionCheckbox.dataset.permissionId]: permissionCheckbox.checked
      };
      renderPeople(container);
      return;
    }

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
  const role = peopleState.modalRole || normalizeRole(user?.role || 'operador');

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
          <select class="field" name="role" data-role-select required>
            ${ROLE_OPTIONS.map((option) => `
              <option value="${option.value}"${role === option.value ? ' selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="active" ${user?.active === false ? '' : 'checked'}>
          Usuario ativo
        </label>
      </div>
      ${renderPermissionChecklist(role)}
      <div class="form-actions">
        <button class="button" type="submit">${user ? 'Salvar usuario' : 'Cadastrar usuario'}</button>
      </div>
    </form>
  `;
}

function renderPermissionChecklist(role) {
  const groups = groupPermissions();

  return `
    <div class="permission-grid">
      ${groups.map(([group, permissions]) => `
        <section class="permission-group">
          <h3>${group}</h3>
          ${permissions.map((permission) => renderPermissionCheckbox(role, permission)).join('')}
        </section>
      `).join('')}
    </div>
  `;
}

function renderPermissionCheckbox(role, permission) {
  const normalizedRole = normalizeRole(role);
  const checked = getModalPermissionValue(normalizedRole, permission.id);
  const isAdmin = normalizedRole === 'admin';

  return `
    <label class="permission-row">
      <span>
        <strong>${escapeHtml(permission.label)}</strong>
        <small>${checked ? 'Liberado no perfil' : 'Bloqueado no perfil'}</small>
      </span>
      <input
        type="checkbox"
        data-permission-checkbox
        data-permission-id="${permission.id}"
        ${checked ? 'checked' : ''}
        ${isAdmin ? 'disabled' : ''}
      >
    </label>
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

function buildRolePermissionState(role) {
  const normalizedRole = normalizeRole(role);
  const rolePermissions = new Set(getRolePermissions(normalizedRole));

  return PERMISSIONS.reduce((state, permission) => {
    state[permission.id] = normalizedRole === 'admin' || rolePermissions.has(permission.id);
    return state;
  }, {});
}

function buildUserPermissionState(user) {
  const normalizedRole = normalizeRole(user?.role || 'operador');
  const state = buildRolePermissionState(normalizedRole);

  if (!user || normalizedRole === 'admin') {
    return state;
  }

  PERMISSIONS.forEach((permission) => {
    const override = getUserPermissionOverride(user.id, permission.id);

    if (override === 'allow') {
      state[permission.id] = true;
    }

    if (override === 'deny') {
      state[permission.id] = false;
    }
  });

  return state;
}

function getModalPermissionValue(role, permissionId) {
  if (role === 'admin') {
    return true;
  }

  if (Object.hasOwn(peopleState.modalPermissions, permissionId)) {
    return peopleState.modalPermissions[permissionId];
  }

  return getRolePermissions(role).includes(permissionId);
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
  const normalizedRole = normalizeRole(role);
  const option = ROLE_OPTIONS.find((candidate) => candidate.value === normalizedRole);

  return option?.label || 'Operador/Caixa';
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
