import { getRuntimeConfig, isSupabaseEnabled } from './app-config.service.js';

let clientPromise = null;

export async function getSupabaseClient() {
  if (!isSupabaseEnabled()) {
    return null;
  }

  if (!clientPromise) {
    clientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) => {
      const config = getRuntimeConfig();
      return createClient(config.supabaseUrl, config.supabaseAnonKey);
    });
  }

  return clientPromise;
}
