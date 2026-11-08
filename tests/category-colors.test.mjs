const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { getCategoryColorVar } = await import('../src/utils/category-colors.js?v=20260807-07');

const list = [
  { id: 'lanches', name: 'Lanches' },
  { id: 'porcoes', name: 'Porções' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'combos', name: 'Combos' },
  { id: 'sobremesas', name: 'Sobremesas' },
  { id: 'cafes', name: 'Cafés' },
  { id: '__favoritos', name: 'Favoritos' },
  { id: '__mais-vendidos', name: 'Mais vendidos' }
];

// Categorias fixas por id
assert(getCategoryColorVar(list[0], list) === 'var(--cat-lanches)', 'lanches por id');
assert(getCategoryColorVar(list[1], list) === 'var(--cat-porcoes)', 'porcoes por id');
assert(getCategoryColorVar(list[2], list) === 'var(--cat-bebidas)', 'bebidas por id');
assert(getCategoryColorVar(list[3], list) === 'var(--cat-combos)', 'combos por id');

// Identifica pelo nome (minusculas, sem acento)
assert(getCategoryColorVar({ id: 'x1', name: 'Porções' }, list) === 'var(--cat-porcoes)', 'porcoes pelo nome com acento');
assert(getCategoryColorVar({ id: 'x2', name: 'BEBIDAS' }, list) === 'var(--cat-bebidas)', 'bebidas pelo nome em caixa alta');
assert(getCategoryColorVar({ id: 'x3', name: 'Lanches' }, list) === 'var(--cat-lanches)', 'lanches pelo nome');

// Categoria criada pelo usuario: cor estavel dentro de --cat-extra-1..4
const extra = getCategoryColorVar({ id: 'sobremesas', name: 'Sobremesas' }, list);
assert(extra.startsWith('var(--cat-extra-'), 'categoria extra usa --cat-extra-N');
assert(extra === getCategoryColorVar({ id: 'sobremesas', name: 'Sobremesas' }, list), 'cor extra estavel entre chamadas');
assert(/^var\(--cat-extra-[1-4]\)$/.test(extra), 'N entre 1 e 4');

// Posicao entre as nao fixas, ordenadas por id: cafes = 1o, sobremesas = 2o
assert(getCategoryColorVar({ id: 'cafes', name: 'Cafés' }, list) === 'var(--cat-extra-1)', 'primeira extra');
assert(extra === 'var(--cat-extra-2)', 'segunda extra');

// Ordem da lista nao muda a cor
const reversed = [...list].reverse();
assert(getCategoryColorVar({ id: 'sobremesas', name: 'Sobremesas' }, reversed) === extra, 'independe da ordem da lista');

// Modulo 4
const many = Array.from({ length: 6 }, (_, i) => ({ id: `cat-${i}`, name: `Categoria ${i}` }));
assert(getCategoryColorVar(many[4], many) === 'var(--cat-extra-1)', 'quinta extra volta ao 1');
assert(getCategoryColorVar(many[5], many) === 'var(--cat-extra-2)', 'sexta extra volta ao 2');

// Categoria fora da lista continua com cor valida
assert(/^var\(--cat-extra-[1-4]\)$/.test(getCategoryColorVar({ id: 'nova', name: 'Nova' }, list)), 'fora da lista tem cor');
assert(/^var\(--cat-extra-[1-4]\)$/.test(getCategoryColorVar({ id: 'nova', name: 'Nova' }, undefined)), 'sem lista tem cor');

// Categorias internas
assert(getCategoryColorVar({ id: '__favoritos' }, list) === 'var(--muted)', 'favoritos usa --muted');
assert(getCategoryColorVar({ id: '__mais-vendidos', name: 'Mais vendidos' }, list) === 'var(--muted)', 'mais vendidos usa --muted');

// Internas nao deslocam a posicao das extras
const withoutInternal = list.filter((c) => !c.id.startsWith('__'));
assert(getCategoryColorVar({ id: 'sobremesas', name: 'Sobremesas' }, withoutInternal) === extra, 'internas nao contam');

// Pseudo-categoria "todos" (filtro Todos) e interna: --muted e nao ocupa cor da paleta
assert(getCategoryColorVar({ id: 'todos', name: 'Todos' }, list) === 'var(--muted)', 'todos usa --muted');
const withTodos = [{ id: 'todos', name: 'Todos' }, ...list];
assert(getCategoryColorVar({ id: 'sobremesas', name: 'Sobremesas' }, withTodos) === extra, 'todos nao desloca as extras');
assert(getCategoryColorVar({ id: 'cafes', name: 'Cafés' }, withTodos) === 'var(--cat-extra-1)', 'todos nao ocupa a primeira cor extra');

console.log('category-colors tests passed');
