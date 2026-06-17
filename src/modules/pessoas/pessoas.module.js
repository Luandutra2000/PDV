import { getCurrentUser, getUsers } from '../../services/auth.service.js';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js';
import {
  createManagedUser,
  loadManagedUsers,
  updateManagedUser,
  saveManagedPermissionChecklist
} from '../../services/user-admin.service.js';
import {
  PERMISSIONS,
  getRolePermissions,
  getUserPermissionOverride,
  hasPermission,
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
  modalPermissions: {},
  modalDraft: createBlankUserDraft()
};
const boundContainers = new WeakSet();

export function initPessoasModule(container) {
  ensureSelectedUser();
  renderPeople(container);
  loadManagedUsers()
    .then(() => {
      ensureSelectedUser();
      renderPeople(container);
    })
    .catch((error) => {
      renderPeople(container, error.message || 'Nao foi possivel carregar usuarios.');
    });

  if (!boundContainers.has(container)) {
    bindPeopleEvents(container);
    boundContainers.add(container);
  }
}

function renderPeople(container, loadError = '') {
  const users = getUsers();
  const selectedUser = users.find((user) => user.id === peopleState.selectedUserId) || users[0] || null;
  const editingUser = users.find((user) => user.id === peopleState.editingUserId) || null;
  const permissions = getPeoplePermissions();

  container.innerHTML = `
    <section class="module-screen people-screen" data-people-screen>
      <header class="module-header">
        <div>
          <h1 class="pdv-title">Pessoas</h1>
          <p class="module-subtitle">Usuarios, perfis e permissoes individuais.</p>
        </div>
        ${permissions.canCreate ? '<button class="button" type="button" data-action="new-user">Novo usuario</button>' : ''}
      </header>

      <div class="people-grid">
        <section class="manager-section">
          <header class="manager-section__header">
            <strong>Usuarios</strong>
          </header>
          <div class="manager-list people-list">
            ${loadError ? `<p class="form-error">${escapeHtml(loadError)}</p>` : ''}
            ${renderUserList(users)}
          </div>
        </section>

        <section class="manager-section">
          <header class="manager-section__header">
            <strong>${editingUser ? 'Editar usuario' : 'Cadastrar usuario'}</strong>
          </header>
          ${permissions.canCreate || (editingUser && permissions.canEdit)
            ? renderUserForm(editingUser, permissions)
            : '<div class="empty-products">Sem permissao para cadastrar ou editar usuarios.</div>'}
        </section>
      </div>

      ${selectedUser ? renderPermissionPanel(selectedUser, permissions) : ''}
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
      if (!getPeoplePermissions().canCreate) {
        return;
      }

      peopleState.editingUserId = null;
      peopleState.modalRole = 'operador';
      peopleState.modalPermissions = buildRolePermissionState('operador');
      peopleState.modalDraft = createBlankUserDraft();
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'select-user') {
      peopleState.selectedUserId = button.dataset.userId;
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'edit-user') {
      if (!getPeoplePermissions().canEdit) {
        return;
      }

      peopleState.editingUserId = button.dataset.userId;
      peopleState.selectedUserId = button.dataset.userId;
      const user = getUsers().find((candidate) => candidate.id === button.dataset.userId);
      peopleState.modalRole = normalizeRole(user?.role || 'operador');
      peopleState.modalPermissions = buildUserPermissionState(user);
      peopleState.modalDraft = createUserDraft(user);
      renderPeople(container);
    }
  });

  container.addEventListener('submit', async (event) => {
    if (!event.target.closest('[data-people-screen]') || !event.target.matches('[data-user-form]')) {
      return;
    }

    event.preventDefault();
    const form = new FormData(event.target);
    const editingUserId = form.get('id') || '';
    const permissions = getPeoplePermissions();

    if ((!editingUserId && !permissions.canCreate) || (editingUserId && !permissions.canEdit)) {
      renderFormError(event.target, 'Usuario sem permissao para esta acao.');
      return;
    }

    const payload = {
      name: form.get('name'),
      username: form.get('username'),
      active: form.get('active') === 'on'
    };
    const canManagePermissions = permissions.canManagePermissions;

    if (canManagePermissions) {
      payload.role = normalizeRole(form.get('role'));
    }
    const password = String(form.get('password') || '').trim();

    if (password || !editingUserId) {
      payload.password = password;
    }

    try {
      const oldUser = editingUserId
        ? getUsers().find((candidate) => candidate.id === editingUserId)
        : null;
      const oldRole = normalizeRole(oldUser?.role || '');
      const user = editingUserId
        ? await updateManagedUser(editingUserId, payload)
        : await createManagedUser(payload);

      if (canManagePermissions) {
        await saveManagedPermissionChecklist(user, peopleState.modalPermissions);
      }

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

      if (editingUserId && oldRole && oldRole !== normalizeRole(user.role)) {
        recordAudit({
          action: 'user.role.change',
          entityType: 'user',
          entityId: user.id,
          metadata: {
            fromRole: oldRole,
            toRole: normalizeRole(user.role)
          }
        });
      }

      peopleState.editingUserId = user.id;
      peopleState.selectedUserId = user.id;
      peopleState.modalRole = normalizeRole(user.role);
      peopleState.modalPermissions = buildUserPermissionState(user);
      peopleState.modalDraft = createUserDraft(user);
      renderPeople(container);
    } catch (error) {
      renderFormError(event.target, error.message || 'Nao foi possivel salvar o usuario.');
    }
  });

  container.addEventListener('input', (event) => {
    if (!event.target.closest('[data-people-screen]') || !event.target.closest('[data-user-form]')) {
      return;
    }

    updateModalDraftField(event.target);
  });

  container.addEventListener('change', (event) => {
    const roleSelect = event.target.closest('[data-role-select]');

    if (roleSelect && event.target.closest('[data-people-screen]')) {
      if (!getPeoplePermissions().canManagePermissions) {
        return;
      }

      captureModalDraftFromForm(roleSelect.form);
      peopleState.modalRole = normalizeRole(event.target.value);
      peopleState.modalPermissions = buildRolePermissionState(peopleState.modalRole);
      renderPeople(container);
      return;
    }

    const permissionCheckbox = event.target.closest('[data-permission-checkbox]');

    if (permissionCheckbox && event.target.closest('[data-people-screen]')) {
      if (!getPeoplePermissions().canManagePermissions) {
        return;
      }

      peopleState.modalPermissions = {
        ...peopleState.modalPermissions,
        [permissionCheckbox.dataset.permissionId]: permissionCheckbox.checked
      };
      renderPeople(container);
      return;
    }

    if (event.target.closest('[data-user-form]') && event.target.closest('[data-people-screen]')) {
      updateModalDraftField(event.target);
      return;
    }

    const select = event.target.closest('[data-permission-select]');

    if (!select || !event.target.closest('[data-people-screen]')) {
      return;
    }

    if (!getPeoplePermissions().canManagePermissions) {
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
  const permissions = getPeoplePermissions();

  if (!users.length) {
    return '<div class="empty-products">Nenhum usuario cadastrado.</div>';
  }

  return users.map((user) => `
    <article class="people-row ${user.id === peopleState.selectedUserId ? 'is-selected' : ''}">
      <button class="people-row__main" type="button" data-action="select-user" data-user-id="${user.id}">
        <strong>${escapeHtml(user.name)}</strong>
        <span>${getRoleLabel(user.role)} - ${user.active ? 'Ativo' : 'Inativo'}</span>
      </button>
      ${permissions.canEdit ? `<button class="button button--ghost" type="button" data-action="edit-user" data-user-id="${user.id}">Editar</button>` : ''}
    </article>
  `).join('');
}

function renderUserForm(user, permissions = getPeoplePermissions()) {
  const role = peopleState.modalRole || normalizeRole(user?.role || 'operador');
  const draft = peopleState.modalDraft || createUserDraft(user);
  const active = typeof draft.active === 'boolean' ? draft.active : user?.active !== false;
  const canManagePermissions = permissions.canManagePermissions;

  return `
    <form class="product-form people-form" data-user-form>
      <input type="hidden" name="id" value="${user?.id || ''}">
      <p class="form-error" data-user-form-error hidden></p>
      <div class="form-grid">
        <label>
          Nome
          <input class="field" name="name" value="${escapeHtml(draft.name ?? user?.name ?? '')}" required>
        </label>
        <label>
          Usuario
          <input class="field" name="username" value="${escapeHtml(draft.username ?? user?.username ?? '')}" required>
        </label>
        <label>
          Senha
          <input class="field" name="password" type="password" value="${escapeHtml(draft.password || '')}" ${user ? 'placeholder="Preencha para alterar"' : 'required'}>
        </label>
        <label>
          Perfil
          <select class="field" name="role" data-role-select required ${canManagePermissions ? '' : 'disabled'}>
            ${ROLE_OPTIONS.map((option) => `
              <option value="${option.value}"${role === option.value ? ' selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
          ${canManagePermissions ? '' : `<input type="hidden" name="role" value="${role}">`}
        </label>
        <label class="checkbox-field">
          <input type="checkbox" name="active" ${active ? 'checked' : ''}>
          Usuario ativo
        </label>
      </div>
      ${canManagePermissions ? renderPermissionChecklist(role) : ''}
      <div class="form-actions">
        <button class="button" type="submit">${user ? 'Salvar usuario' : 'Cadastrar usuario'}</button>
      </div>
    </form>
  `;
}

function createBlankUserDraft() {
  return {
    name: '',
    username: '',
    password: '',
    active: true
  };
}

function createUserDraft(user) {
  return {
    name: user?.name || '',
    username: user?.username || '',
    password: '',
    active: user?.active !== false
  };
}

function updateModalDraftField(field) {
  if (!['name', 'username', 'password', 'active'].includes(field.name)) {
    return;
  }

  peopleState.modalDraft = {
    ...(peopleState.modalDraft || createBlankUserDraft()),
    [field.name]: field.type === 'checkbox' ? field.checked : field.value
  };
}

function captureModalDraftFromForm(form) {
  if (!form?.elements) {
    return;
  }

  const getField = (name) => {
    if (typeof form.elements.namedItem === 'function') {
      return form.elements.namedItem(name);
    }

    return form.elements[name] || null;
  };

  peopleState.modalDraft = {
    name: getField('name')?.value || '',
    username: getField('username')?.value || '',
    password: getField('password')?.value || '',
    active: getField('active')?.checked === true
  };
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

function renderPermissionPanel(user, permissions = getPeoplePermissions()) {
  const groups = groupPermissions();
  const rolePermissions = new Set(getRolePermissions(user.role));
  const isAdmin = user.role === 'admin';
  const canManagePermissions = permissions.canManagePermissions;

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
            ${permissions.map((permission) => renderPermissionRow(user, permission, rolePermissions, isAdmin, canManagePermissions)).join('')}
          </section>
        `).join('')}
      </div>
      ${permissions.canViewAudit ? renderUserAudit(user.id) : ''}
    </section>
  `;
}

function renderPermissionRow(user, permission, rolePermissions, isAdmin, canManagePermissions) {
  const override = getUserPermissionOverride(user.id, permission.id);
  const defaultState = isAdmin || rolePermissions.has(permission.id) ? 'Liberado no perfil' : 'Bloqueado no perfil';

  return `
    <label class="permission-row">
      <span>
        <strong>${escapeHtml(permission.label)}</strong>
        <small>${defaultState}</small>
      </span>
      <select class="field" data-permission-select data-user-id="${user.id}" data-permission-id="${permission.id}" ${isAdmin || !canManagePermissions ? 'disabled' : ''}>
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

function getPeoplePermissions() {
  const currentUser = getCurrentUser();

  return {
    canCreate: hasPermission(currentUser, 'users.manage'),
    canEdit: hasPermission(currentUser, 'users.edit') || hasPermission(currentUser, 'users.manage'),
    canManagePermissions: hasPermission(currentUser, 'permissions.manage'),
    canViewAudit: hasPermission(currentUser, 'audit.view')
  };
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
    'user.role.change': 'Perfil alterado',
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
