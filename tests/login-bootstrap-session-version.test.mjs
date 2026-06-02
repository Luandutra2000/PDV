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

console.log('login bootstrap session version ok');
