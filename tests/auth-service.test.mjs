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
