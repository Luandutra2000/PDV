// Regressao (QA 2026-11, BUG-016): em janelas baixas (1024x600) o painel da
// comanda esticava ate a altura da lista de produtos e o botao "Receber" ficava
// a 1.340 px do topo; era preciso rolar a tela inteira para cobrar.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../src/styles/${file}`, import.meta.url), 'utf8');
const pdv = read('pdv-b.css');
assert.match(pdv, /\.pdv-layout:has\(\.pdv-screen\.fc\)\s*\{[^}]*height:\s*100dvh;[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/, 'a linha da moldura fica limitada a altura da janela');
assert.match(pdv, /\.pdv-layout:has\(\.pdv-screen\.fc\) \.workspace\s*\{\s*min-height:\s*0;/, 'a area de trabalho pode encolher para a grade rolar por dentro');
const components = read('components.css');
assert.match(components, /\.rail \{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/, 'menu lateral rola na vertical sem barra horizontal');
console.log('frente de caixa layout height ok');

// BUG-025: em 375 px a faixa de indicadores empurrava a area de trabalho para 540 px.
assert.match(read('layout.css'), /\.workspace \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/, 'area de trabalho encolhe em telas estreitas');
console.log('frente de caixa narrow width ok');
