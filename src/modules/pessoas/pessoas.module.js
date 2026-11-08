import { getCurrentUser, getUsers } from '../../services/auth.service.js?v=20260804-06';
import { getAuditLogs, recordAudit } from '../../services/audit.service.js?v=20260804-06';
import {
  createManagedUser,
  deleteManagedUser,
  loadManagedUsers,
  updateManagedUser,
  saveManagedPermissionChecklist
} from '../../services/user-admin.service.js?v=20260804-06';
import {
  PERMISSIONS,
  getRolePermissions,
  getUserPermissionOverride,
  hasPermission,
  normalizeRole
} from '../../services/permission.service.js?v=20260804-06';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'operador', label: 'Operador/Caixa' },
  { value: 'dono', label: 'Visualizador/Dono' }
];

const peopleState = {
  editingUserId: null,
  selectedUserId: null,
  deletingUserId: null,
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

// Os nomes de grupo e de permissao vem do servico sem acento; aqui so o texto exibido
// ganha acento. Ids, valores e filtros continuam os mesmos.
const DISPLAY_WORD_FIXES = {
  Gestao: 'Gestão',
  saida: 'saída',
  Lancar: 'Lançar',
  producao: 'produção',
  relatorios: 'relatórios',
  lancamentos: 'lançamentos',
  usuarios: 'usuários',
  permissoes: 'permissões'
};

function displayText(text) {
  return String(text ?? '').replace(/[A-Za-z]+/g, (word) => DISPLAY_WORD_FIXES[word] || word);
}

export function initPessoasModule(container) {
  ensureSelectedUser();
  renderPeople(container);
  loadManagedUsers()
    .then(() => {
      ensureSelectedUser();
      renderPeople(container);
    })
    .catch((error) => {
      renderPeople(container, error.message || 'Não foi possível carregar os usuários.');
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
  const deletingUser = users.find((user) => user.id === peopleState.deletingUserId) || null;
  const permissions = getPeoplePermissions();
  const logs = getAuditRows();
  const error = loadError || peopleState.error;

  const canSeeAudit = permissions.canManagePermissions || hasPermission(getCurrentUser(), 'audit.view');

  container.innerHTML = `
    <section class="ui-screen ps" data-people-screen>
      <header class="ui-head ps-head">
        <div class="ps-head__title">
          <h1 class="ps-title">Pessoas e permissões</h1>
          <p class="ps-sub">Acessos, perfis e o histórico do que cada pessoa fez no sistema.</p>
        </div>
        <div class="ui-head__actions">
          ${canSeeAudit ? '<button class="ui-btn" type="button" data-action="show-audit">Histórico de ações</button>' : ''}
          ${permissions.canCreate ? '<button class="ui-btn ui-btn--primary" type="button" data-action="new-user">Novo usuário</button>' : ''}
        </div>
      </header>

      ${renderFeedback(error)}
      ${renderSummaryCards(users, logs)}

      <div class="ps-cols">
        <section class="ui-panel ps-team">
          <h2 class="ui-head">
            Equipe
            <span>${users.length} ${users.length === 1 ? 'pessoa' : 'pessoas'}</span>
          </h2>
          <div class="ps-people">
            ${renderUserList(users)}
          </div>
        </section>

        <section class="ui-panel ps-perms">
          ${selectedUser ? renderSelectedPermissionPreview(selectedUser, permissions) : '<h2 class="ui-head">Permissões</h2><p class="ps-empty">Nenhuma pessoa selecionada.</p>'}
        </section>
      </div>

      ${canSeeAudit ? renderAuditPanel(users, logs) : ''}
      ${renderUserModal(editingUser, permissions)}
      ${renderDeleteConfirmation(deletingUser)}
    </section>
  `;
}

function renderFeedback(error = '') {
  if (error) {
    return `<p class="form-error ps-feedback">${escapeHtml(error)}</p>`;
  }

  if (peopleState.message) {
    return `<p class="ps-feedback ps-feedback--ok">${escapeHtml(peopleState.message)}</p>`;
  }

  return '';
}

function renderSummaryCards(users, logs) {
  const activeUsers = users.filter((user) => user.active !== false);
  const admins = users.filter((user) => normalizeRole(user.role) === 'admin');
  const operators = users.filter((user) => normalizeRole(user.role) === 'operador');
  const lastActivity = logs[0]?.createdAt ? formatDate(logs[0].createdAt) : 'Sem registro';

  return `
    <div class="ui-stats">
      ${renderSummaryCard('Total de usuários', users.length)}
      ${renderSummaryCard('Ativos', activeUsers.length)}
      ${renderSummaryCard('Administradores', admins.length)}
      ${renderSummaryCard('Operadores', operators.length)}
      ${renderSummaryCard('Última atividade', lastActivity)}
    </div>
  `;
}

function renderSummaryCard(label, value) {
  return `<div class="ui-stat"><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></div>`;
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
      openDeleteConfirmation(container, button.dataset.userId);
      return;
    }

    if (button.dataset.action === 'cancel-delete-user') {
      peopleState.deletingUserId = null;
      renderPeople(container);
      return;
    }

    if (button.dataset.action === 'confirm-delete-user') {
      const deletingUserId = peopleState.deletingUserId;
      if (deletingUserId) {
        handleDeleteUser(container, deletingUserId);
      }
      return;
    }

    if (button.dataset.action === 'view-history') {
      const user = getUsers().find((candidate) => candidate.id === button.dataset.userId);
      peopleState.auditFilters.user = user?.name || '';
      peopleState.selectedUserId = button.dataset.userId;
      renderPeople(container);
      scrollToAudit(container);
      return;
    }

    if (button.dataset.action === 'show-audit') {
      scrollToAudit(container);
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
      renderFormError(event.target, 'Usuário sem permissão para esta ação.');
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
      peopleState.message = editingUserId ? 'Usuário atualizado com sucesso.' : 'Usuário cadastrado com sucesso.';
      peopleState.error = '';
      renderPeople(container);
    } catch (error) {
      renderFormError(event.target, error.message || 'Não foi possível salvar o usuário.');
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
      restorePermissionFocus(container, permissionCheckbox.dataset.permissionId);
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

// A tela inteira e redesenhada a cada clique; devolve o foco ao marcador alterado.
function restorePermissionFocus(container, permissionId) {
  container.querySelector?.(`[data-permission-checkbox][data-permission-id="${permissionId}"]`)?.focus?.();
}

function scrollToAudit(container) {
  container.querySelector?.('[data-audit-panel]')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

function renderUserList(users) {
  const permissions = getPeoplePermissions();

  if (!users.length) {
    return '<p class="ps-empty">Nenhum usuário cadastrado.</p>';
  }

  return users.map((user) => {
    const isSelected = user.id === peopleState.selectedUserId;
    const isInactive = user.active === false;

    return `
    <article class="ps-person${isSelected ? ' is-selected' : ''}" data-user-id="${user.id}"${isSelected ? ' aria-current="true"' : ''}>
      <button class="ps-person__main" type="button" data-action="select-user" data-user-id="${user.id}">
        <span class="ps-avatar" aria-hidden="true">${escapeHtml(getInitials(user.name))}</span>
        <span class="ps-person__text">
          <b>${escapeHtml(user.name)}</b>
          <small>${getRoleLabel(user.role)}</small>
        </span>
      </button>
      <span class="ui-pill${isInactive ? '' : ' ui-pill--ok'}">${isInactive ? 'Inativo' : 'Ativo'}</span>
      <div class="ps-person__actions">
        ${permissions.canEdit ? `<button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-action="edit-user" data-user-id="${user.id}">Editar</button>` : ''}
        ${permissions.canDelete ? `<button class="ui-btn ui-btn--ghost ui-btn--sm ps-danger" type="button" data-action="delete-user" data-user-id="${user.id}">Excluir</button>` : ''}
        <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-action="view-history" data-user-id="${user.id}">Histórico</button>
      </div>
    </article>
  `;
  }).join('');
}

function renderSelectedPermissionPreview(user, permissions) {
  const grouped = groupPermissions();
  const allowedCount = PERMISSIONS.filter((permission) => isPermissionAllowed(user, permission.id)).length;
  const isAdmin = normalizeRole(user.role) === 'admin';

  return `
    <div class="ps-perms__head">
      <h2 class="ui-head">
        Permissões de ${escapeHtml(user.name)}
        <span>${user.active === false ? 'Usuário inativo' : `${allowedCount} de ${PERMISSIONS.length} liberadas`}</span>
      </h2>
      ${permissions.canEdit ? `<button class="ui-btn ui-btn--sm" type="button" data-action="edit-user" data-user-id="${user.id}">Editar permissões</button>` : ''}
    </div>
    ${isAdmin ? '<p class="ps-note">Administrador tem acesso a tudo e as permissões não podem ser retiradas.</p>' : ''}
    <div class="ps-groups">
      ${grouped.map(([group, groupItems]) => `
        <div class="ps-group">
          <b>${renderGroupLabel(group)}</b>
          <div class="ps-perms-list">
            ${groupItems.map((permission) => renderPermissionChip(user, permission)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Permite quebrar a linha depois da barra ("Financeiro/Despesas") sem partir a palavra.
function renderGroupLabel(group) {
  return escapeHtml(displayText(group)).replaceAll('/', '/<wbr>');
}

function renderPermissionChip(user, permission) {
  const allowed = isPermissionAllowed(user, permission.id);

  return `<span class="ps-perm${allowed ? '' : ' ps-perm--off'}" data-perm-view="${permission.id}" data-state="${allowed ? 'on' : 'off'}"><span class="ps-sr">${allowed ? 'Liberado: ' : 'Bloqueado: '}</span>${escapeHtml(displayText(permission.label))}</span>`;
}

function renderUserModal(user, permissions) {
  const canRenderForm = permissions.canCreate || (user && permissions.canEdit);
  const title = user ? 'Editar usuário' : 'Novo usuário';

  return `
    <div class="people-modal-backdrop ${peopleState.modalOpen ? 'is-open' : ''}" data-user-modal aria-hidden="${peopleState.modalOpen ? 'false' : 'true'}">
      <section class="people-modal" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="people-modal__header">
          <div>
            <strong>${title}</strong>
            <span>${user ? 'Atualize dados, status e permissões.' : 'Cadastre o acesso e defina as permissões.'}</span>
          </div>
          <button class="ui-btn ui-btn--ghost ui-btn--sm" type="button" data-action="close-user-modal">Cancelar</button>
        </header>
        ${canRenderForm ? renderUserForm(user, permissions) : '<p class="ps-empty">Sem permissão para cadastrar ou editar usuários.</p>'}
      </section>
    </div>
  `;
}

function renderDeleteConfirmation(user) {
  if (!user) {
    return '';
  }

  return `
    <div class="people-modal-backdrop is-open" data-delete-user-modal aria-hidden="false">
      <section class="people-modal" role="dialog" aria-modal="true" aria-label="Confirmar exclusão de usuário">
        <header class="people-modal__header">
          <div>
            <strong>Excluir usuário</strong>
            <span>Esta ação não pode ser desfeita.</span>
          </div>
        </header>
        <div class="people-modal__body">
          <p>Confirma a exclusão de <strong>${escapeHtml(user.name)}</strong>?</p>
          <div class="form-actions ps-actions">
            <button class="ui-btn" type="button" data-action="cancel-delete-user">Cancelar exclusão</button>
            <button class="ui-btn ps-btn-danger" type="button" data-action="confirm-delete-user">Confirmar exclusão</button>
          </div>
        </div>
      </section>
    </div>
  `;
}

function openDeleteConfirmation(container, userId) {
  const permissions = getPeoplePermissions();

  if (!permissions.canDelete) {
    renderPeople(container, 'Usuário sem permissão para esta ação.');
    return;
  }

  const user = getUsers().find((candidate) => candidate.id === userId);
  if (!user) {
    renderPeople(container, 'Usuário não encontrado.');
    return;
  }

  peopleState.deletingUserId = userId;
  peopleState.error = '';
  peopleState.message = '';
  renderPeople(container);
}

async function handleDeleteUser(container, userId) {
  const permissions = getPeoplePermissions();

  if (!permissions.canDelete) {
    renderPeople(container, 'Usuário sem permissão para esta ação.');
    return;
  }

  const user = getUsers().find((candidate) => candidate.id === userId);

  if (!user) {
    renderPeople(container, 'Usuário não encontrado.');
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
    peopleState.deletingUserId = null;
    ensureSelectedUser();
    peopleState.message = 'Usuário excluído com sucesso.';
    peopleState.error = '';
    renderPeople(container);
  } catch (error) {
    peopleState.deletingUserId = null;
    peopleState.message = '';
    peopleState.error = error.message || 'Não foi possível excluir o usuário.';
    renderPeople(container);
  }
}

function renderUserForm(user, permissions = getPeoplePermissions()) {
  const role = peopleState.modalRole || normalizeRole(user?.role || 'operador');
  const draft = peopleState.modalDraft || createUserDraft(user);
  const active = typeof draft.active === 'boolean' ? draft.active : user?.active !== false;
  const canManagePermissions = permissions.canManagePermissions;

  return `
    <form class="people-form people-modal__body" data-user-form>
      <input type="hidden" name="id" value="${user?.id || ''}">
      <p class="form-error" data-user-form-error hidden></p>
      <div class="ps-form-grid">
        <label class="ui-field">
          Nome
          <input class="ui-input" name="name" value="${escapeHtml(draft.name ?? user?.name ?? '')}" required>
        </label>
        <label class="ui-field">
          Usuário/e-mail
          <input class="ui-input" type="email" name="username" value="${escapeHtml(draft.username ?? user?.username ?? '')}" required>
        </label>
        <label class="ui-field">
          Senha
          <input class="ui-input" name="password" type="password" value="${escapeHtml(draft.password || '')}" ${user ? 'placeholder="Preencha para alterar"' : 'required'}>
        </label>
        <label class="ui-field">
          Perfil
          <select class="ui-input" name="role" data-role-select required ${canManagePermissions ? '' : 'disabled'}>
            ${ROLE_OPTIONS.map((option) => `
              <option value="${option.value}"${role === option.value ? ' selected' : ''}>${option.label}</option>
            `).join('')}
          </select>
          ${canManagePermissions ? '' : `<input type="hidden" name="role" value="${role}">`}
        </label>
        <label class="ps-check">
          <input type="checkbox" name="active" ${active ? 'checked' : ''}>
          Usuário ativo
        </label>
      </div>
      ${canManagePermissions ? renderPermissionChecklist(role) : ''}
      <div class="form-actions people-modal__footer">
        <button class="ui-btn" type="button" data-action="close-user-modal">Cancelar</button>
        <button class="ui-btn ui-btn--primary" type="submit">${user ? 'Salvar usuário' : 'Cadastrar usuário'}</button>
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
    <div class="ps-checklist">
      <h3 class="ps-checklist__title">Permissões</h3>
      ${groups.map(([group, permissions]) => `
        <section class="ps-group">
          <b>${renderGroupLabel(group)}</b>
          <div class="ps-perms-list">
            ${permissions.map((permission) => renderPermissionCheckbox(role, permission)).join('')}
          </div>
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
    <label class="ps-toggle${checked ? ' is-on' : ''}">
      <input
        type="checkbox"
        data-permission-checkbox
        data-permission-id="${permission.id}"
        ${checked ? 'checked' : ''}
        ${isAdmin ? 'disabled' : ''}
      >
      <span class="ps-toggle__label">${escapeHtml(displayText(permission.label))}</span>
      <small class="ps-sr">${checked ? 'Liberado no perfil' : 'Bloqueado no perfil'}</small>
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
    <section class="ui-panel ps-audit" data-audit-panel>
      <h2 class="ui-head">
        Histórico de ações
        <span>Auditoria da equipe, organizada por usuário, módulo e data.</span>
      </h2>
      <div class="ps-audit__filters">
        ${renderAuditSelect('user', 'Usuário', users.map((user) => ({ value: user.name, label: user.name })))}
        ${renderAuditSelect('action', 'Tipo de ação', actions.map((action) => ({ value: action, label: getAuditLabel(action) })))}
        ${renderAuditSelect('module', 'Módulo', modules.map((moduleName) => ({ value: moduleName, label: displayText(moduleName) })))}
        <label class="ui-field">Data inicial<input class="ui-input" type="date" value="${peopleState.auditFilters.dateStart}" data-audit-filter="dateStart"></label>
        <label class="ui-field">Data final<input class="ui-input" type="date" value="${peopleState.auditFilters.dateEnd}" data-audit-filter="dateEnd"></label>
      </div>
      <div class="ps-audit__scroll">
        <table class="ui-table ps-audit__table">
          <thead>
            <tr><th>Usuário</th><th>Ação</th><th>Módulo</th><th>Data</th><th>Hora</th><th>Detalhes</th></tr>
          </thead>
          <tbody>
            ${rows.map((entry) => `
              <tr class="ps-audit__row">
                <td>${escapeHtml(entry.userName)}</td>
                <td>${escapeHtml(getAuditLabel(entry.action))}</td>
                <td>${escapeHtml(displayText(entry.module))}</td>
                <td>${formatOnlyDate(entry.createdAt)}</td>
                <td>${formatOnlyTime(entry.createdAt)}</td>
                <td class="ps-audit__details">${escapeHtml(entry.details)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${rows.length ? '' : '<p class="ps-empty">Nenhuma ação encontrada para estes filtros.</p>'}
      </div>
    </section>
  `;
}

function renderAuditSelect(key, label, options) {
  const legacyUserHook = key === 'user' ? ' data-audit-user-filter' : '';
  return `
    <label class="ui-field">
      ${label}
      <select class="ui-input" data-audit-filter="${key}"${legacyUserHook}>
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
    'user.create': 'Usuário criado',
    'user.update': 'Usuário editado',
    'user.delete': 'Usuário excluído',
    'user.role.change': 'Perfil alterado',
    'permission.override': 'Permissões alteradas',
    'sale.create': 'Venda finalizada',
    'sale.cancel': 'Venda cancelada',
    'cash.movement': 'Movimento de caixa',
    'showcase.launch': 'Produção lançada',
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
    || 'Ação registrada no sistema';
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
