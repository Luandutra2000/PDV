import { readFile } from 'node:fs/promises';

const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

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

console.log('login bootstrap session version ok');
