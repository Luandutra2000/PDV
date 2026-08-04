import { getCurrentUser, getUsers } from '../../services/auth.service.js?v=20260804-01';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js?v=20260804-01';
import {
  createManagedUser,
  deleteManagedUser,
  loadManagedUsers,
  updateManagedUser,
  saveManagedPermissionChecklist
} from '../../services/user-admin.service.js?v=20260804-01';
import {
  PERMISSIONS,
  getRolePermissions,
  getUserPermissionOverride,
  hasPermission,
  normalizeRole
} from '../../services/permission.service.js?v=20260804-01';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'operador', label: 'Operador/Caixa' },
  { value: 'dono', label: 'Visualizador/Dono' }
];

const peopleState = {
  editingUserId: null,
  selectedUserId: null,
  modalOpen: false,
  modalRole: 'operador',
  modalPermissions: {},
  modalDraft: createBlankUserDraft(),
  message: '',
  error: '',
  auditFilters: {
    user: '',
    action: '',
    module: '',
    dateStart: '',
    dateEnd: ''
  }
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
  const logs = getAuditRows();
  const error = loadError || peopleState.error;

  container.innerHTML = `
    <section class="module-screen people-screen" data-people-screen>
      <header class="module-header people-hero">
        <div>
          <span class="people-eyebrow">Equipe & seguranca</span>
          <h1 class="pdv-title">Pessoas e Permissoes</h1>
          <p class="module-subtitle">Gerencie acessos, perfis e acompanhe as acoes realizadas no sistema.</p>
        </div>
        ${permissions.canCreate ? '<button class="button people-new-button" type="button" data-action="new-user">+ Novo usuario</button>' : ''}
      </header>

      ${renderFeedback(error)}
      ${renderSummaryCards(users, logs)}

      <div class="people-main-grid">
        <section class="manager-section people-card-panel">
          <header class="manager-section__header">
            <strong>Usuarios</strong>
            <span>${users.length} cadastrado(s)</span>
          </header>
          <div class="manager-list people-list">
            ${renderUserList(users)}
          </div>
        </section>

        <section class="manager-section people-card-panel">
          <header class="manager-section__header">
            <div>
              <strong>Permissoes do usuario</strong>
              <span>${selectedUser ? escapeHtml(selectedUser.name) : 'Selecione um usuario'}</span>
            </div>
          </header>
          ${selectedUser ? renderSelectedPermissionPreview(selectedUser, permissions) : '<div class="empty-products">Nenhum usuario selecionado.</div>'}
        </section>
      </div>

      ${permissions.canManagePermissions || hasPermission(getCurrentUser(), 'audit.view') ? renderAuditPanel(users, logs) : ''}
      ${renderUserModal(editingUser, permissions)}
    </section>
  `;
}

function renderFeedback(error = '') {
  if (error) {
    return `<p class="form-error people-feedback">${escapeHtml(error)}</p>`;
  }

  if (peopleState.message) {
    return `<p class="people-feedback people-feedback--success">${escapeHtml(peopleState.message)}</p>`;
  }

  return '';
}

function renderSummaryCards(users, logs) {
  const activeUsers = users.filter((user) => user.active !== false);
  const admins = users.filter((user) => normalizeRole(user.role) === 'admin');
  const operators = users.filter((user) => normalizeRole(user.role) === 'operador');
  const lastActivity = logs[0]?.createdAt ? formatDate(logs[0].createdAt) : 'Sem registro';

  return `
    <div class="people-summary-grid">
      ${renderSummaryCard('Total de usuarios', users.length)}
      ${renderSummaryCard('Usuarios ativos', activeUsers.length)}
      ${renderSummaryCard('Administradores', admins.length)}
      ${renderSummaryCard('Operadores', operators.length)}
      ${renderSummaryCard('Ultima atividade', lastActivity)}
    </div>
  `;
}

function renderSummaryCard(label, value) {
  return `<article class="people-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
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
      peopleState.modalOpen = true;
      peopleState.error = '';
      peopleState.message = '';
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'close-user-modal') {
      peopleState.modalOpen = false;
      peopleState.editingUserId = null;
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
      peopleState.modalOpen = true;
      peopleState.error = '';
      peopleState.message = '';
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'delete-user') {
      handleDeleteUser(container, button.dataset.userId);
      return;
    }

    if (button.dataset.action === 'view-history') {
      const user = getUsers().find((candidate) => candidate.id === button.dataset.userId);
      peopleState.auditFilters.user = user?.name || '';
      peopleState.selectedUserId = button.dataset.userId;
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
      peopleState.modalOpen = false;
      peopleState.message = editingUserId ? 'Usuario atualizado com sucesso.' : 'Usuario cadastrado com sucesso.';
      peopleState.error = '';
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

    const auditFilter = event.target.closest('[data-audit-filter]');
    if (auditFilter && event.target.closest('[data-people-screen]')) {
      peopleState.auditFilters[auditFilter.dataset.auditFilter] = auditFilter.value;
      renderPeople(container);
    }
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
        <span class="people-avatar">${escapeHtml(getInitials(user.name))}</span>
        <span>
          <strong>${escapeHtml(user.name)}</strong>
          <small>${escapeHtml(user.username || 'E-mail nao informado')} · ${getRoleLabel(user.role)} - ${user.active === false ? 'Inativo' : 'Ativo'}</small>
        </span>
      </button>
      <div class="people-row__meta">
        <span class="status-pill ${user.active === false ? 'is-inactive' : 'is-active'}">${user.active === false ? 'Inativo' : 'Ativo'}</span>
      </div>
      <div class="people-row__actions">
        ${permissions.canEdit ? `<button class="button button--ghost" type="button" data-action="edit-user" data-user-id="${user.id}">Editar</button>` : ''}
        ${permissions.canDelete ? `<button class="button button--danger" type="button" data-action="delete-user" data-user-id="${user.id}">Excluir</button>` : ''}
        <button class="button button--ghost" type="button" data-action="view-history" data-user-id="${user.id}">Historico</button>
      </div>
    </article>
  `).join('');
}

function renderSelectedPermissionPreview(user, permissions) {
  const activePermissions = PERMISSIONS.filter((permission) => isPermissionAllowed(user, permission.id));
  const grouped = groupPermissions(activePermissions);

  return `
    <div class="people-selected-profile">
      <div>
        <strong>${getRoleLabel(user.role)}</strong>
        <span>${user.active === false ? 'Usuario inativo' : `${activePermissions.length} permissoes liberadas`}</span>
      </div>
      ${permissions.canEdit ? `<button class="button" type="button" data-action="edit-user" data-user-id="${user.id}">Editar permissoes</button>` : ''}
    </div>
    <div class="permission-preview-grid">
      ${grouped.map(([group, groupPermissions]) => `
        <section class="permission-preview-group">
          <h3>${escapeHtml(group)}</h3>
          ${groupPermissions.slice(0, 5).map((permission) => `<span>${escapeHtml(permission.label)}</span>`).join('')}
          ${groupPermissions.length > 5 ? `<small>+${groupPermissions.length - 5} permissoes</small>` : ''}
        </section>
      `).join('') || '<div class="empty-products">Nenhuma permissao liberada.</div>'}
    </div>
  `;
}

function renderUserModal(user, permissions) {
  const canRenderForm = permissions.canCreate || (user && permissions.canEdit);
  const title = user ? 'Editar usuario' : 'Novo usuario';

  return `
    <div class="people-modal-backdrop ${peopleState.modalOpen ? 'is-open' : ''}" data-user-modal aria-hidden="${peopleState.modalOpen ? 'false' : 'true'}">
      <section class="people-modal" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="people-modal__header">
          <div>
            <strong>${title}</strong>
            <span>${user ? 'Atualize dados, status e permissoes.' : 'Cadastre o acesso e defina as permissoes.'}</span>
          </div>
          <button class="button button--ghost" type="button" data-action="close-user-modal">Cancelar</button>
        </header>
        ${canRenderForm ? renderUserForm(user, permissions) : '<div class="empty-products">Sem permissao para cadastrar ou editar usuarios.</div>'}
      </section>
    </div>
  `;
}

async function handleDeleteUser(container, userId) {
  const permissions = getPeoplePermissions();

  if (!permissions.canDelete) {
    renderPeople(container, 'Usuario sem permissao para esta acao.');
    return;
  }

  const user = getUsers().find((candidate) => candidate.id === userId);

  if (!user) {
    renderPeople(container, 'Usuario nao encontrado.');
    return;
  }

  const confirmed = typeof globalThis.window?.confirm === 'function'
    ? globalThis.window.confirm(`Excluir o usuario ${user.name}? Esta acao nao pode ser desfeita.`)
    : true;

  if (!confirmed) {
    return;
  }

  try {
    const deletedUser = await deleteManagedUser(userId);
    recordAudit({
      action: 'user.delete',
      entityType: 'user',
      entityId: userId,
      metadata: {
        username: deletedUser?.username || user.username,
        role: deletedUser?.role || user.role
      }
    });

    if (peopleState.editingUserId === userId) {
      peopleState.editingUserId = null;
      peopleState.modalRole = 'operador';
      peopleState.modalPermissions = buildRolePermissionState('operador');
      peopleState.modalDraft = createBlankUserDraft();
    }

    peopleState.selectedUserId = null;
    ensureSelectedUser();
    peopleState.message = 'Usuario excluido com sucesso.';
    peopleState.error = '';
    renderPeople(container);
  } catch (error) {
    peopleState.message = '';
    peopleState.error = error.message || 'Nao foi possivel excluir o usuario.';
    renderPeople(container);
  }
}

function renderUserForm(user, permissions = getPeoplePermissions()) {
  const role = peopleState.modalRole || normalizeRole(user?.role || 'operador');
  const draft = peopleState.modalDraft || createUserDraft(user);
  const active = typeof draft.active === 'boolean' ? draft.active : user?.active !== false;
  const canManagePermissions = permissions.canManagePermissions;

  return `
    <form class="product-form people-form people-modal__body" data-user-form>
      <input type="hidden" name="id" value="${user?.id || ''}">
      <p class="form-error" data-user-form-error hidden></p>
      <div class="form-grid">
        <label>
          Nome
          <input class="field" name="name" value="${escapeHtml(draft.name ?? user?.name ?? '')}" required>
        </label>
        <label>
          Usuario/e-mail
          <input class="field" type="email" name="username" value="${escapeHtml(draft.username ?? user?.username ?? '')}" required>
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
      <div class="form-actions people-modal__footer">
        <button class="button button--ghost" type="button" data-action="close-user-modal">Cancelar</button>
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

function groupPermissions() {
  return Object.entries(PERMISSIONS.reduce((groups, permission) => {
    groups[permission.group] = groups[permission.group] || [];
    groups[permission.group].push(permission);
    return groups;
  }, {}));
}

function isPermissionAllowed(user, permissionId) {
  if (normalizeRole(user?.role) === 'admin') {
    return true;
  }

  const override = getUserPermissionOverride(user?.id, permissionId);
  if (override === 'allow') {
    return true;
  }
  if (override === 'deny') {
    return false;
  }

  return getRolePermissions(normalizeRole(user?.role)).includes(permissionId);
}

function getAuditRows() {
  return getAuditLogs()
    .map((entry) => ({
      ...entry,
      module: entry.metadata?.module || getAuditModule(entry.action),
      details: entry.metadata?.details || getAuditDetails(entry)
    }))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

function renderAuditPanel(users, logs) {
  const rows = filterAuditRows(logs);
  const modules = [...new Set(logs.map((entry) => entry.module).filter(Boolean))];
  const actions = [...new Set(logs.map((entry) => entry.action).filter(Boolean))];

  return `
    <section class="manager-section people-audit-panel">
      <header class="manager-section__header">
        <div>
          <strong>Historico de acoes</strong>
          <span>Auditoria da equipe, organizada por usuario, modulo e data.</span>
        </div>
      </header>
      <div class="people-audit-filters">
        ${renderAuditSelect('user', 'Usuario', users.map((user) => ({ value: user.name, label: user.name })))}
        ${renderAuditSelect('action', 'Tipo de acao', actions.map((action) => ({ value: action, label: getAuditLabel(action) })))}
        ${renderAuditSelect('module', 'Modulo', modules.map((moduleName) => ({ value: moduleName, label: moduleName })))}
        <label>Data inicial<input class="field" type="date" value="${peopleState.auditFilters.dateStart}" data-audit-filter="dateStart"></label>
        <label>Data final<input class="field" type="date" value="${peopleState.auditFilters.dateEnd}" data-audit-filter="dateEnd"></label>
      </div>
      <div class="people-audit-table">
        <div class="people-audit-table__head"><span>Usuario</span><span>Acao</span><span>Modulo</span><span>Data</span><span>Hora</span><span>Detalhes</span></div>
        ${rows.map((entry) => `
          <div class="people-audit-row">
            <span>${escapeHtml(entry.userName)}</span>
            <span>${escapeHtml(getAuditLabel(entry.action))}</span>
            <span>${escapeHtml(entry.module)}</span>
            <span>${formatOnlyDate(entry.createdAt)}</span>
            <span>${formatOnlyTime(entry.createdAt)}</span>
            <span>${escapeHtml(entry.details)}</span>
          </div>
        `).join('') || '<div class="empty-products">Nenhuma acao encontrada para estes filtros.</div>'}
      </div>
    </section>
  `;
}

function renderAuditSelect(key, label, options) {
  const legacyUserHook = key === 'user' ? ' data-audit-user-filter' : '';
  return `
    <label>
      ${label}
      <select class="field" data-audit-filter="${key}"${legacyUserHook}>
        <option value="">Todos</option>
        ${options.map((option) => `<option value="${escapeHtml(option.value)}" ${peopleState.auditFilters[key] === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function filterAuditRows(logs) {
  return logs.filter((entry) => {
    const createdAt = new Date(entry.createdAt);
    const dateStart = peopleState.auditFilters.dateStart ? new Date(`${peopleState.auditFilters.dateStart}T00:00:00`) : null;
    const dateEnd = peopleState.auditFilters.dateEnd ? new Date(`${peopleState.auditFilters.dateEnd}T23:59:59`) : null;

    return (!peopleState.auditFilters.user || entry.userName === peopleState.auditFilters.user)
      && (!peopleState.auditFilters.action || entry.action === peopleState.auditFilters.action)
      && (!peopleState.auditFilters.module || entry.module === peopleState.auditFilters.module)
      && (!dateStart || createdAt >= dateStart)
      && (!dateEnd || createdAt <= dateEnd);
  });
}

function getAuditModule(action = '') {
  if (action.startsWith('sale.')) return 'Vendas';
  if (action.startsWith('cash.')) return 'Caixa';
  if (action.startsWith('showcase.') || action.startsWith('stock.')) return 'Vitrine/Estoque';
  if (action.startsWith('financial.')) return 'Financeiro/Despesas';
  if (action.startsWith('product.') || action.startsWith('category.')) return 'Gestao';
  return 'Sistema';
}

function getAuditLabel(action) {
  const labels = {
    'user.create': 'Usuario criado',
    'user.update': 'Usuario editado',
    'user.delete': 'Usuario excluido',
    'user.role.change': 'Perfil alterado',
    'permission.override': 'Permissoes alteradas',
    'sale.create': 'Venda finalizada',
    'sale.cancel': 'Venda cancelada',
    'cash.movement': 'Movimento de caixa',
    'showcase.launch': 'Producao lancada',
    'product.stock.adjust': 'Estoque ajustado manualmente',
    'financial.bill.pay': 'Conta paga'
  };
  return labels[action] || action;
}

function getAuditDetails(entry) {
  return entry.metadata?.details
    || entry.metadata?.reason
    || entry.metadata?.description
    || entry.metadata?.username
    || 'Acao registrada no sistema';
}

function formatDate(value) {
  if (!value) return 'Sem registro';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatOnlyDate(value) {
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatOnlyTime(value) {
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  return String(name || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U';
}

function getPeoplePermissions() {
  const currentUser = getCurrentUser();

  return {
    canCreate: hasPermission(currentUser, 'users.manage'),
    canEdit: hasPermission(currentUser, 'users.edit') || hasPermission(currentUser, 'users.manage'),
    canDelete: hasPermission(currentUser, 'users.delete'),
    canManagePermissions: hasPermission(currentUser, 'permissions.manage')
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
