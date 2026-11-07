const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};
globalThis.document = { documentElement: { dataset: {} } };

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { getThemeLabel, initTheme, toggleTheme } = await import('../src/services/theme.service.js?v=20260807-05');

// Sem escolha salva, o tema padrao e o claro.
store.clear();
assert(initTheme() === 'light', 'initTheme deve devolver light sem escolha salva');
assert(document.documentElement.dataset.theme === 'light', 'initTheme deve aplicar light no documento');
assert(getThemeLabel() === 'Modo escuro', 'No tema claro o rotulo deve ser Modo escuro');

// Escolha salva e respeitada.
store.clear();
localStorage.setItem('pdv.theme', 'dark');
assert(initTheme() === 'dark', 'initTheme deve respeitar a escolha salva dark');
assert(document.documentElement.dataset.theme === 'dark', 'initTheme deve aplicar dark salvo');
assert(getThemeLabel() === 'Modo claro', 'No tema escuro o rotulo deve ser Modo claro');

// toggleTheme parte do claro quando nada esta aplicado.
store.clear();
document.documentElement.dataset = {};
assert(getThemeLabel() === 'Modo escuro', 'Sem tema aplicado o rotulo assume o tema claro');
assert(toggleTheme() === 'dark', 'toggleTheme sem tema aplicado deve ir para dark');
assert(localStorage.getItem('pdv.theme') === 'dark', 'toggleTheme deve gravar a escolha');
assert(toggleTheme() === 'light', 'toggleTheme deve voltar para light');

console.log('theme-service.test.mjs ok');
