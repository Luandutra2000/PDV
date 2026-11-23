import test from 'node:test';

test('auth service preserves authentication behavior', async () => {
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const auth = await import('../src/services/auth.service.js');

auth.setAuthClientForTests({
  async signInWithPassword({ email, password }) {
    return {
      data: {
        user: { id: 'user-1', email },
        session: { access_token: `token-${password}` }
      },
      error: null
    };
  },
  async signOut() {
    return { error: null };
  },
  async getSession() {
    return {
      data: { session: { user: { id: 'user-1', email: 'admin@pdv.local' } } },
      error: null
    };
  }
});

const session = await auth.login({ email: 'admin@pdv.local', password: '123456' });
assert(session.user.email === 'admin@pdv.local', 'login should return user');

const currentUser = await auth.getCurrentUser();
assert(currentUser.id === 'user-1', 'current user should come from session');

await auth.logout();

console.log('auth service ok');
});

test('auth service loads the profile and permissions of the logged user', async () => {
  const assert = await import('node:assert/strict');
  const auth = await import('../src/services/auth.service.js');
  const rows = {
    'op-1': { id: 'op-1', name: 'Caixa', role: 'operador', is_active: true },
    'off-1': { id: 'off-1', name: 'Antigo', role: 'operador', is_active: false }
  };
  auth.setProfileClientForTests({
    from: () => ({
      select: () => ({
        eq: (_column, id) => ({ maybeSingle: async () => ({ data: rows[id] || null, error: null }) })
      })
    })
  });

  const profile = await auth.loadCurrentProfile({ id: 'op-1' });
  assert.equal(profile.role, 'operador');
  assert.ok(profile.permissions.includes('sale.create'));
  assert.ok(!profile.permissions.includes('sale.cancel'));
  await assert.rejects(() => auth.loadCurrentProfile({ id: 'off-1' }), /perfil ativo/);
  await assert.rejects(() => auth.loadCurrentProfile({ id: 'missing' }), /perfil ativo/);
});
