const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { renderSidebar } = await import('../src/components/sidebar.component.js');

const html = renderSidebar();

assert(html.includes('data-action="logout"'), 'sidebar exit button should expose logout action');
assert(html.includes('Sair'), 'sidebar should render exit label');

console.log('sidebar component ok');
