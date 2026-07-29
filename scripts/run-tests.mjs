import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const testsDirectory = resolve(projectRoot, 'tests');
const testFiles = readdirSync(testsDirectory)
  .filter((fileName) => fileName.endsWith('.test.mjs'))
  .sort();

const startedAt = Date.now();
const results = [];

for (const testFile of testFiles) {
  const testStartedAt = Date.now();
  const execution = spawnSync(
    process.execPath,
    [resolve(testsDirectory, testFile)],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    }
  );

  const passed = execution.status === 0 && !execution.error;
  results.push({
    file: testFile,
    passed,
    durationMs: Date.now() - testStartedAt
  });

  if (passed) {
    process.stdout.write(`PASS ${testFile}\n`);
    continue;
  }

  process.stderr.write(`FAIL ${testFile}\n`);
  if (execution.stdout) {
    process.stderr.write(execution.stdout);
  }
  if (execution.stderr) {
    process.stderr.write(execution.stderr);
  }
  if (execution.error) {
    process.stderr.write(`${execution.error.stack || execution.error.message}\n`);
  }
}

const failed = results.filter((result) => !result.passed);
const durationMs = Date.now() - startedAt;

process.stdout.write('\n');
process.stdout.write(`Testes: ${results.length}\n`);
process.stdout.write(`Aprovados: ${results.length - failed.length}\n`);
process.stdout.write(`Reprovados: ${failed.length}\n`);
process.stdout.write(`Duracao: ${durationMs} ms\n`);

if (failed.length) {
  process.stderr.write(`Falhas: ${failed.map((result) => result.file).join(', ')}\n`);
  process.exitCode = 1;
}
