import { getSupabaseClient } from './supabase-client.service.js';

let authClientForTests = null;

export function setAuthClientForTests(client) {
  authClientForTests = client;
}

export async function login({ email, password }) {
  const client = await getAuthClient();
  const { data, error } = await client.signInWithPassword({ email, password });

  if (error) {
    throw new Error(error.message || 'Falha ao entrar.');
  }

  return data;
}

export async function logout() {
  const client = await getAuthClient();
  const { error } = await client.signOut();

  if (error) {
    throw new Error(error.message || 'Falha ao sair.');
  }
}

export async function getCurrentUser() {
  const session = await getCurrentSession();
  return session?.user || null;
}

export async function getCurrentSession() {
  const client = await getAuthClient();
  const { data, error } = await client.getSession();

  if (error) {
    throw new Error(error.message || 'Falha ao ler sessao.');
  }

  return data.session || null;
}

async function getAuthClient() {
  if (authClientForTests) {
    return authClientForTests;
  }

  return (await getSupabaseClient()).auth;
}
