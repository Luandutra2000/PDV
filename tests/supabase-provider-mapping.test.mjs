const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const { mapProductFromSupabase, mapProductToSupabase } = await import('../src/services/providers/supabase.provider.js');

const localProduct = {
  id: 'x-burger',
  name: 'X Burger',
  categoryId: 'lanches',
  price: 16,
  cost: 8,
  stock: 10,
  active: true,
  aliases: ['burger'],
  favorite: true
};

const row = mapProductToSupabase(localProduct);
assert(row.category_id === 'lanches', 'product category should map to snake case');
assert(row.aliases[0] === 'burger', 'aliases should map');

const mapped = mapProductFromSupabase(row);
assert(mapped.categoryId === 'lanches', 'product category should map to camel case');
assert(mapped.favorite === true, 'favorite should map');

console.log('supabase provider mapping ok');
