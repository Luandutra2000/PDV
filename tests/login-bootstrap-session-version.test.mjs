import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/app.js?v=20260729-13', import.meta.url), 'utf8');

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(
  appSource.includes('renderLoginModule(app, () => bootstrap({ skipFreshLoginCheck: true })'),
  'login success bootstrap should not clear the session it just created'
);
assert(!appSource.includes('loginFromQueryString'), 'app should not accept credentials from query parameters');
assert(appSource.includes("params.delete('password')"), 'app should remove legacy password query parameters');
assert(appSource.includes('restoreSessionInBackground(app)'), 'login should restore a valid Supabase session in the background');
assert(!appSource.includes('await restoreSupabaseSession()'), 'session restore should not block rendering the login screen');

console.log('login bootstrap session version ok');
