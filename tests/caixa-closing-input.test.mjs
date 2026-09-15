import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const { initCaixaModule } = await import('../src/modules/caixa/caixa.module.js?v=20260804-06');
const listeners = new Map();
const difference = { textContent: '', className: '' };
let replacements = 0;
const container = {
  set innerHTML(value) { replacements += 1; this.markup = value; },
  addEventListener: (type, handler) => listeners.set(type, handler),
  querySelector: (selector) => selector === '[data-crm-closing-difference]' ? difference : null
};
initCaixaModule(container);
const field = {
  dataset: { crmClosingInput: 'countedCash' },
  closest: () => true,
  matches: (selector) => selector === '[data-crm-closing-input]',
  value: ''
};
for (const value of ['6', '65', '65.', '65.3', '65.35']) {
  field.value = value;
  listeners.get('input')({ target: field });
  assert.equal(replacements, 1, 'typing must preserve existing input nodes, focus and decimal edits');
}
assert.match(difference.textContent, /65,35/, 'live difference follows the typed amount');
assert.equal(difference.className, 'money-negative');
field.dataset.crmClosingInput = 'note';
for (const value of ['C', 'Conferido', 'Conferido no caixa']) {
  field.value = value;
  listeners.get('input')({ target: field });
}
assert.equal(replacements, 1, 'typing an observation must preserve the field and caret');
assert.match(difference.textContent, /65,35/);
console.log('caixa closing input regression ok');
