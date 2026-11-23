import { getSupabaseClient } from './supabase-client.service.js';
import { buildProfile } from './permission.service.js';

let authClientForTests = null;
let profileClientForTests = null;

export function setProfileClientForTests(client) {
  profileClientForTests = client;
}

export async function loadCurrentProfile(user) {
  const client = profileClientForTests || await getSupabaseClient();
  const { data, error } = await client
    .from('profiles')
    .select('id, name, role, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Falha ao carregar perfil.');
  }

  if (!data || data.is_active === false) {
    throw new Error('Usuario sem perfil ativo. Fale com o administrador.');
  }

  return buildProfile(data);
}

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
