// Regressao (QA 2026-11, BUG-006): a tela Vitrine e redesenhada por inteiro
// quando chega uma sincronizacao da vitrine (outra venda, outro aparelho).
// O produto e a quantidade ja escolhidos em "Novo lancamento" eram apagados
// e o operador podia achar que tinha lancado a producao.
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};
globalThis.window = { location: { href: '', pathname: '/' }, confirm: () => false, prompt: () => '' };
globalThis.document = { documentElement: { dataset: {} } };

const storage = await import('../src/services/storage.service.js?v=20261109-01');
const schema = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const { emit } = await import('../src/services/event-bus.service.js?v=20260804-06');
const { initEstoqueModule } = await import('../src/modules/estoque/estoque.module.js?v=20261109-01');

seedTestAdmin(storage, schema.STORAGE_KEYS);
storage.setItem(schema.STORAGE_KEYS.categories, [{ id: 'qa', name: 'QA', showInShowcase: true }]);
storage.setItem(schema.STORAGE_KEYS.products, [
  { id: 'qa-coxinha', name: 'QA Coxinha', categoryId: 'qa', price: 7.5, stock: 0, active: true },
  { id: 'qa-esfiha', name: 'QA Esfiha', categoryId: 'qa', price: 6.9, stock: 0, active: true }
]);

const listeners = {};
const screen = {
  innerHTML: '',
  addEventListener: (type, handler) => { (listeners[type] ||= []).push(handler); },
  querySelector: (selector) => (selector === '[data-estoque-screen]' ? {} : null)
};
const dispatch = (type, target) => (listeners[type] || []).forEach((handler) => handler({ target }));
const fakeForm = { elements: { valorUnitario: { value: '' } }, querySelector: () => ({ textContent: '' }) };
const field = (name, value) => ({
  value,
  closest: (selector) => (selector === 'form' ? fakeForm : {}),
  matches: (selector) => selector.includes(`[name="${name}"]`)
});

initEstoqueModule(screen);
await new Promise((resolve) => setTimeout(resolve, 0));

dispatch('change', field('produtoId', 'qa-esfiha'));
dispatch('input', field('quantidade', '12'));

// Atualizacao vinda da sincronizacao da vitrine redesenha a tela.
emit(schema.UI_EVENTS.showcaseDataChanged, { origem: 'outro aparelho' });

const formMarkup = screen.innerHTML.match(/<form class="vt-form" data-stock-form>[\s\S]*?<\/form>/)?.[0] || '';
assert.match(formMarkup, /<option value="qa-esfiha"\s+selected>/, 'produto escolhido continua selecionado apos o redesenho');
assert.match(formMarkup, /name="quantidade"[^>]*value="12"/, 'quantidade digitada continua no campo apos o redesenho');
assert.match(formMarkup, /name="valorUnitario"[^>]*value="6,90"|name="valorUnitario"[^>]*value="6.90"/, 'valor unitario do produto escolhido continua visivel');

console.log('vitrine form draft ok');
