import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { initPessoasModule } = await import('../src/modules/pessoas/pessoas.module.js?v=20260807-16');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs');

seedTestAdmin(storage, STORAGE_KEYS);
const now = new Date().toISOString();
storage.setItem(STORAGE_KEYS.users, [
  ...storage.getItem(STORAGE_KEYS.users, []),
  { id: 'u-marina', name: 'Marina', username: 'marina@loja.com', role: 'operador', active: true, createdAt: now, updatedAt: now },
  { id: 'u-caio', name: 'Caio', username: 'caio@loja.com', role: 'operador', active: false, createdAt: now, updatedAt: now }
]);
storage.ensureSeedData();

const handlers = {};
const container = {
  innerHTML: '',
  addEventListener: (event, handler) => { handlers[event] = handler; },
  querySelector: () => null
};
initPessoasModule(container);
await new Promise((resolve) => setTimeout(resolve, 0));

const click = (dataset) => handlers.click({
  target: { closest: (selector) => (selector === '[data-people-screen]' ? {} : selector === '[data-action]' ? { dataset } : null) }
});
const tagsWith = (html, pattern) => [...html.matchAll(/<[a-z]+\s[^>]*>/g)].map((m) => m[0]).filter((tag) => pattern.test(tag));
const permState = (html, id) => tagsWith(html, new RegExp(`data-perm-view="${id}"`))[0] || '';

// Cabecalho e textos
let html = container.innerHTML;
assert.match(html, /<h1[^>]*>Pessoas e permissões<\/h1>/, 'screen title');
assert.match(html, /class="[^"]*\bui-head\b/, 'header uses ui-head');
assert.match(html, /Acessos, perfis e o histórico do que cada pessoa fez no sistema\./, 'one-line subtitle');
assert.doesNotMatch(html, /Equipe\s*&amp;\s*seguranca|EQUIPE & SEGURANCA|Equipe & seguranca|people-eyebrow/i, 'old eyebrow is gone');
assert.doesNotMatch(html, /Pessoas e Permissoes/, 'old title is gone');
assert.match(html, />Histórico de ações<\/button>/, 'audit shortcut button in the header');
assert.match(html, /data-action="show-audit"/, 'audit shortcut hook');
assert.match(html, />Novo usuário<\/button>/, 'new user button');
assert.match(html, /ui-btn ui-btn--primary[^>]*data-action="new-user"/, 'new user is the primary button');
assert.match(html, /class="[^"]*\bui-stats\b/, 'numbers use ui-stats');
['Total de usuários', 'Ativos', 'Administradores', 'Operadores', 'Última atividade'].forEach((label) => {
  assert.ok(html.includes(label), `stat "${label}"`);
});
assert.ok(html.includes('data-audit-panel'), 'audit panel stays on the screen');
assert.ok(html.includes('data-audit-user-filter'), 'audit filters stay');

// Equipe: avatar, perfil, status, selecao
assert.ok(html.includes('Equipe'), 'team panel title');
assert.match(html, /ps-avatar[^>]*>M</, 'avatar with the initial');
assert.ok(html.includes('Operador/Caixa'), 'profile label');
assert.match(html, /ui-pill ui-pill--ok[^>]*>Ativo</, 'active pill');
assert.match(html, /<span class="ui-pill">Inativo</, 'inactive pill is neutral');
const rowOf = (id) => tagsWith(html, new RegExp(`class="ps-person[^"]*"[^>]*data-user-id="${id}"`))[0] || '';
assert.match(rowOf('user-admin'), /is-selected/, 'first person starts selected');
assert.doesNotMatch(rowOf('u-marina'), /is-selected/, 'others are not selected');
['edit-user', 'delete-user', 'view-history'].forEach((action) => {
  assert.ok(html.includes(`data-action="${action}" data-user-id="u-marina"`), `${action} stays reachable`);
});

// Selecionar outra pessoa move a marcacao e mostra liga/desliga
click({ action: 'select-user', userId: 'u-marina' });
html = container.innerHTML;
assert.match(rowOf('u-marina'), /is-selected/, 'selected person is marked');
assert.doesNotMatch(rowOf('user-admin'), /is-selected/, 'previous selection is unmarked');
assert.ok(html.includes('Permissões de Marina'), 'permissions panel names the person');
assert.match(permState(html, 'sales.access'), /data-state="on"/, 'allowed permission renders as on');
assert.doesNotMatch(permState(html, 'sales.access'), /ps-perm--off/, 'allowed permission is not off');
assert.match(permState(html, 'cash.close'), /data-state="off"/, 'denied permission renders as off');
assert.match(permState(html, 'cash.close'), /ps-perm--off/, 'denied permission uses the off style');
['Vendas', 'Caixa', 'Vitrine/Estoque', 'Gestão', 'Financeiro/Despesas', 'Sistema'].forEach((group) => {
  assert.ok(html.includes(`>${group}</b>`), `group ${group}`);
});
assert.ok(html.includes('Fechar caixa'), 'denied permissions are listed too');
assert.doesNotMatch(html, /\+\d+ permiss/, 'no collapsed "+N permissoes"');
assert.doesNotMatch(html, /Historico de acoes|Usuario ativo<|Permissoes do usuario/, 'visible copy is accented');

// Editar permissoes: mesmos inputs, e o salvar continua pelo mesmo handler
click({ action: 'edit-user', userId: 'u-marina' });
html = container.innerHTML;
const checkboxOf = (id) => tagsWith(html, new RegExp(`data-permission-id="${id}"`)).find((tag) => tag.includes('data-permission-checkbox')) || '';
assert.ok(checkboxOf('cash.close'), 'modal keeps the permission checkbox');
assert.doesNotMatch(checkboxOf('cash.close'), /\schecked/, 'cash.close starts off for operador');
assert.match(checkboxOf('sales.access'), /\schecked/, 'sales.access starts on for operador');
assert.match(html, /class="ps-toggle/, 'permission toggles use the new chip style');

handlers.change({
  target: {
    closest: (selector) => {
      if (selector === '[data-permission-checkbox]') return { dataset: { permissionId: 'cash.close' }, checked: true };
      if (selector === '[data-people-screen]') return {};
      return null;
    }
  }
});
html = container.innerHTML;
assert.match(checkboxOf('cash.close'), /\schecked/, 'toggle updates the checklist');

// Salvar: o gerenciamento de usuarios exige a funcao central, entao ligamos o provedor
// remoto so aqui, com a chamada de rede trocada por um registro.
const supabaseClient = await import('../src/services/supabase-client.service.js?v=20260804-06');
globalThis.__PDV_RUNTIME_CONFIG__ = { dataProvider: 'supabase', supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key' };
supabaseClient.configureSupabaseClientForTests({
  client: {
    from: () => ({ upsert: async () => ({ error: null }) }),
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt', refresh_token: 'r' } }, error: null }) }
  }
});
const calls = [];
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  calls.push(body);
  return {
    ok: true,
    status: 200,
    json: async () => (body.action === 'updateUser'
      ? { user: { id: 'u-marina', name: 'Marina', username: 'marina@loja.com', role: 'operador', active: true } }
      : { ok: true })
  };
};
globalThis.FormData = class {
  constructor(form) { this.fields = form.fields; }
  get(key) { return this.fields[key] ?? null; }
};
await handlers.submit({
  preventDefault() {},
  target: {
    fields: { id: 'u-marina', name: 'Marina', username: 'marina@loja.com', role: 'operador', active: 'on', password: '' },
    closest: (selector) => (selector === '[data-people-screen]' ? {} : null),
    matches: (selector) => selector === '[data-user-form]',
    querySelector: () => ({ set textContent(value) { throw new Error(`form error: ${value}`); } })
  }
});
const saved = calls.find((call) => call.action === 'savePermissionOverrides');
assert.ok(saved, 'saving still sends the permission checklist through the same handler');
assert.equal(saved.payload.userId, 'u-marina', 'checklist belongs to the edited person');
assert.equal(saved.payload.overrides['cash.close'], 'allow', 'toggled permission is saved as allowed');
assert.equal(saved.payload.overrides['sales.access'], 'default', 'untouched permission stays default');
assert.ok(container.innerHTML.includes('Usuário atualizado com sucesso.'), 'success message is shown');

// Atalho do cabecalho nao quebra sem rolagem disponivel
click({ action: 'show-audit' });
assert.ok(container.innerHTML.includes('data-audit-panel'), 'audit panel still there after the shortcut');

console.log('pessoas markup ok');
