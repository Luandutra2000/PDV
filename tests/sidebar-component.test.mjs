import test from 'node:test';

test('sidebar component renders navigation behavior', async () => {
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { renderSidebar } = await import('../src/components/sidebar.component.js');

const html = renderSidebar();

assert(html.includes('data-action="logout"'), 'sidebar exit button should expose logout action');
assert(html.includes('Sair'), 'sidebar should render exit label');

console.log('sidebar component ok');
});

test('sidebar hides admin menus from operators', async () => {
  const assert = await import('node:assert/strict');
  const permissions = await import('../src/services/permission.service.js');
  const { renderSidebar, canAccessMenu } = await import('../src/components/sidebar.component.js');

  permissions.setCurrentProfileForTests(permissions.buildProfile({ id: 'op', name: 'Caixa', role: 'operador' }));
  const operatorHtml = renderSidebar();
  assert.ok(operatorHtml.includes('data-menu-id="frente-caixa"'));
  assert.ok(operatorHtml.includes('data-menu-id="estoque"'));
  for (const menuId of ['dashboard', 'produtos', 'pessoas', 'fechar-caixa']) {
    assert.ok(!operatorHtml.includes(`data-menu-id="${menuId}"`), `${menuId} should be hidden from operators`);
    assert.equal(canAccessMenu(menuId), false);
  }

  permissions.setCurrentProfileForTests(permissions.LOCAL_PROFILE);
  const adminHtml = renderSidebar();
  assert.ok(adminHtml.includes('data-menu-id="dashboard"'));
  assert.ok(adminHtml.includes('data-menu-id="fechar-caixa"'));
  assert.equal(canAccessMenu('nao-existe'), false);
});
