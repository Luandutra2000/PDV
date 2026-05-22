let authClientForTests = null;

export function setAuthClientForTests(client) {
  authClientForTests = client;
}

export async function login({ email, password }) {
  const client = getAuthClient();
  const { data, error } = await client.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message || 'Falha ao entrar.');
  }

  return data;
}

export async function logout() {
  const client = getAuthClient();
  const { error } = await client.signOut();

  if (error) {
    throw new Error(error.message || 'Falha ao sair.');
  }
}

export async function getCurrentUser() {
  const client = getAuthClient();
  const { data, error } = await client.getSession();

  if (error) {
    throw new Error(error.message || 'Falha ao ler sessao.');
  }

  return data.session?.user || null;
}

function getAuthClient() {
  if (!authClientForTests) {
    throw new Error('Cliente de autenticacao nao configurado.');
  }

  return authClientForTests;
}
