import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entrypoint = resolve(projectRoot, 'src/app.js');
const visited = new Set();
const importPattern = /(?:^|\n)\s*import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g;

async function visitModule(filePath) {
  const normalizedPath = resolve(filePath);
  if (visited.has(normalizedPath)) {
    return;
  }

  visited.add(normalizedPath);
  await access(normalizedPath);
  const source = await readFile(normalizedPath, 'utf8');

  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('.')) {
      throw new Error(`Startup module uses unsupported static import: ${specifier}`);
    }

    const withoutQuery = specifier.split('?')[0].split('#')[0];
    await visitModule(resolve(dirname(normalizedPath), withoutQuery));
  }
}

await visitModule(entrypoint);

const indexHtml = await readFile(resolve(projectRoot, 'index.html'), 'utf8');
const entryMatch = indexHtml.match(/import\(['"](\.\/src\/app\.js\?v=[^'"]+)['"]\)/);

if (!entryMatch) {
  throw new Error('index.html should load the versioned app entrypoint');
}

if (visited.size < 20) {
  throw new Error(`Startup graph is unexpectedly small: ${visited.size} modules`);
}

console.log(`startup module graph ok (${visited.size} modules)`);
