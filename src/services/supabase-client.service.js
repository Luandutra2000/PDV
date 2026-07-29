import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js?v=20260729-12';

let clientPromise = null;
let clientOverride = null;

export function configureSupabaseClientForTests({ client } = {}) {
  clientOverride = client || null;
  clientPromise = null;
}

export async function getSupabaseClient() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  if (clientOverride) {
    return clientOverride;
  }

  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const config = getRuntimeConfig();
      return createClient(config.supabaseUrl, config.supabaseAnonKey);
    });
  }

  return clientPromise;
}

export async function setSupabaseAuthSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    return;
  }

  const client = await getSupabaseClient();

  if (!client?.auth?.setSession) {
    return;
  }

  await client.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });
}
