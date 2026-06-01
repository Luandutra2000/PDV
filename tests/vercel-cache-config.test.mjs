import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const srcHeader = config.headers.find((entry) => entry.source === '/src/(.*)');
const cacheControl = srcHeader?.headers.find((header) => header.key.toLowerCase() === 'cache-control')?.value || '';

assert(srcHeader, 'vercel config should define cache headers for source modules');
assert(!cacheControl.includes('immutable'), 'source modules should not be immutable because URLs are not content-hashed');
assert(cacheControl.includes('max-age=0'), 'source modules should revalidate so fixes appear after deploy');

console.log('vercel cache config ok');
