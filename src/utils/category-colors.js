// Cor estavel por categoria. Devolve uma referencia CSS (var(--cat-*)) definida em src/styles/tokens.css.

const FIXED_CATEGORIES = ['lanches', 'porcoes', 'bebidas', 'combos'];
const EXTRA_COLORS = 4;
const INTERNAL_PREFIX = '__';

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fixedKey(category) {
  const byId = normalize(category?.id);
  if (FIXED_CATEGORIES.includes(byId)) {
    return byId;
  }
  const byName = normalize(category?.name);
  return FIXED_CATEGORIES.includes(byName) ? byName : null;
}

function isInternal(category) {
  return String(category?.id ?? '').startsWith(INTERNAL_PREFIX);
}

export function getCategoryColorVar(category, allCategories = []) {
  if (isInternal(category)) {
    return 'var(--muted)';
  }

  const fixed = fixedKey(category);
  if (fixed) {
    return `var(--cat-${fixed})`;
  }

  const id = String(category?.id ?? '');
  const extraIds = new Set(
    (Array.isArray(allCategories) ? allCategories : [])
      .filter((item) => item && !isInternal(item) && !fixedKey(item))
      .map((item) => String(item.id ?? ''))
  );
  extraIds.add(id);

  const position = [...extraIds].sort().indexOf(id);
  return `var(--cat-extra-${(position % EXTRA_COLORS) + 1})`;
}
