// Servidor estatico de QA. Serve o PDV a partir da raiz do repositorio e
// injeta, somente nesta copia servida, um relogio de teste controlado por
// localStorage ("qa.clockOffsetMs"). Nao altera nenhum arquivo do app.
// Tambem aceita POST /__qa/save?file=<pasta>/<arquivo> para gravar backups e
// evidencias dentro de qa-pdv/.
import { createServer } from 'node:http';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const port = Number(process.env.QA_PORT || 5510);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

// Date.now() = relogio real + deslocamento (ms). O deslocamento fica em
// localStorage e pode ser alterado sem recarregar: window.__QA_CLOCK__.set('2026-11-02T08:00:00').
const clockShim = `<script>(() => {
  const RealDate = Date;
  const clock = window.__QA_CLOCK__ = {
    offset: Number(localStorage.getItem('qa.clockOffsetMs') || 0),
    set(target) {
      this.offset = new RealDate(target).getTime() - RealDate.now();
      localStorage.setItem('qa.clockOffsetMs', String(this.offset));
      return new QADate().toString();
    },
    reset() { this.offset = 0; localStorage.removeItem('qa.clockOffsetMs'); }
  };
  class QADate extends RealDate {
    constructor(...args) { if (args.length === 0) { super(RealDate.now() + clock.offset); } else { super(...args); } }
    static now() { return RealDate.now() + clock.offset; }
  }
  window.__QA_REAL_DATE__ = RealDate;
  globalThis.Date = QADate;
  if (clock.offset) console.info('[QA] relogio de teste ativo:', new QADate().toString());
})();</script>`;

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === 'POST' && url.pathname === '/__qa/save') {
      const target = String(url.searchParams.get('file') || '');
      if (!/^(backup-inicial|backup-final|evidencias|dados)\/[\w.\-\/]+$/.test(target) || target.includes('..')) {
        response.writeHead(400).end('arquivo invalido');
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const destination = join(root, 'qa-pdv', target);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await writeFile(destination, Buffer.concat(chunks));
      response.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/favicon.ico') pathname = '/src/assets/pwa-icon.svg';
    let filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end();
      return;
    }
    const info = await stat(filePath).catch(() => null);
    if (!info || info.isDirectory()) {
      const candidate = info?.isDirectory() ? join(filePath, 'index.html') : null;
      const exists = candidate && await stat(candidate).catch(() => null);
      filePath = exists ? candidate : join(root, 'index.html');
    }
    let body = await readFile(filePath);
    if (filePath.endsWith('index.html')) {
      body = Buffer.from(body.toString('utf8').replace('<head>', `<head>\n  ${clockShim}`));
    }
    response.writeHead(200, { 'Content-Type': types[extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(500).end(String(error?.message || error));
  }
}).listen(port, '127.0.0.1', () => console.log(`QA server em http://127.0.0.1:${port}/`));
