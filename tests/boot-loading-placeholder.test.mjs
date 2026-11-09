// Regressao (QA 2026-11, BUG-023): durante o carregamento (~7,6 s medidos) a
// pagina mostrava um formulario de login estatico mesmo com sessao ativa.
// O login estatico continua para quem nao tem sessao (decisao anterior).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /data-login-form/, 'login estatico continua para quem nao tem sessao');
assert.match(html, /data-boot-loading hidden[\s\S]*Carregando o PDV/, 'estado de carregamento existe, oculto por padrao');
assert.match(html, /localStorage\.getItem\('pdv\.currentSession'\)[\s\S]*\[data-login-form\]'\)\.hidden = true[\s\S]*\[data-boot-loading\]'\)\.hidden = false/, 'com sessao salva, mostra Carregando no lugar do login');
console.log('boot loading placeholder ok');
assert.match(fs.readFileSync(new URL('../src/styles/login-b.css', import.meta.url), 'utf8'), /\.lg-card\[hidden\] \{ display: none; \}/, 'cartao oculto nao aparece');
