const THEME_KEY = 'pdv.theme';

export function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  applyTheme(savedTheme);
  return savedTheme;
}

export function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || 'dark';
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
  return nextTheme;
}

export function getThemeLabel() {
  return (document.documentElement.dataset.theme || 'dark') === 'dark' ? 'Modo claro' : 'Modo escuro';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
