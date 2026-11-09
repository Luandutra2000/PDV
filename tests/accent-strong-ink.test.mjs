// Regressao (QA 2026-11, BUG-009): no hover os botoes principais usam a cor
// secundaria da empresa (--accent-strong) como fundo, mas o texto continuava
// com a cor escolhida para a primaria (--accent-ink). Com a configuracao real
// (primaria #eb4224, secundaria #0f172a) o texto ficava #1C2331 sobre #0F172A
// (contraste ~1,1:1): "Finalizar venda", "Fechar caixa" e o "OK" da venda sumiam.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const props = new Map();
globalThis.document = { documentElement: { style: { setProperty: (n, v) => props.set(n, v), removeProperty: (n) => props.delete(n) } } };
const company = await import('../src/services/empresa-config.service.js?v=20260807-21');

company.applyCompanyIdentity({ corPrimaria: '#eb4224', corSecundaria: '#0f172a', corDestaque: '#f97316' });
const strongInk = props.get('--accent-strong-ink');
assert.ok(strongInk, 'secundaria personalizada define --accent-strong-ink');
assert.ok(company.getContrastRatio(strongInk, '#0f172a') >= 4.5, 'texto do hover legivel sobre a secundaria (WCAG AA)');

company.applyCompanyIdentity(company.getDefaultCompanySettings());
assert.ok(!props.has('--accent-strong-ink'), 'cores padrao deixam o token do tema valer');

const read = (file) => fs.readFileSync(new URL(`../src/styles/${file}`, import.meta.url), 'utf8');
assert.match(read('tokens.css'), /--accent-strong-ink:\s*#1C2331/, 'token padrao do texto sobre a secundaria');
assert.match(read('components.css'), /\.ui-btn--primary:hover:not\(:disabled\)\s*\{[^}]*color:\s*var\(--accent-strong-ink/, 'ui-btn primario usa o texto da secundaria no hover');
assert.match(read('buttons.css'), /\.button:hover\s*\{[^}]*color:\s*var\(--accent-strong-ink/, '.button usa o texto da secundaria no hover');
assert.match(read('modal-b.css'), /background:\s*var\(--accent-strong\);[^}]*color:\s*var\(--accent-strong-ink|color:\s*var\(--accent-strong-ink[^}]*background:\s*var\(--accent-strong\)/, 'botao do modal usa o texto da secundaria no hover');

console.log('accent strong ink ok');

// O OK da confirmacao ignora o segundo clique de um duplo clique em "Finalizar venda".
const vendasSource = fs.readFileSync(new URL('../src/modules/vendas/vendas.module.js', import.meta.url), 'utf8');
assert.match(vendasSource, /state\.saleSuccessShownAt = performance\.now\(\);/, 'registra quando a confirmacao abriu');
assert.match(vendasSource, /if \(action === 'close-sale-success'\) \{\s*if \(performance\.now\(\) - \(state\.saleSuccessShownAt \|\| 0\) < SALE_SUCCESS_CLICK_GUARD_MS\)/, 'OK ignora cliques logo apos abrir');
console.log('sale success click guard ok');
