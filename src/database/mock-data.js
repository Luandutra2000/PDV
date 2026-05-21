export const mockCategories = [
  { id: 'todos', name: 'Todos' },
  { id: 'lanches', name: 'Lanches' },
  { id: 'bebidas', name: 'Bebidas' },
  { id: 'porcoes', name: 'Porcoes' },
  { id: 'combos', name: 'Combos' }
];

export const mockProducts = [
  { id: 'x-burger', name: 'X-Burger', categoryId: 'lanches', price: 16, cost: 8.5, stock: 24, active: true, aliases: ['xb', 'hamburguer'], favorite: true },
  { id: 'x-salada', name: 'X-Salada', categoryId: 'lanches', price: 18, cost: 9.5, stock: 22, active: true },
  { id: 'x-bacon', name: 'X-Bacon', categoryId: 'lanches', price: 22, cost: 12, stock: 16, active: true },
  { id: 'misto-quente', name: 'Misto Quente', categoryId: 'lanches', price: 10, cost: 4.8, stock: 30, active: true },
  { id: 'batata-frita', name: 'Batata Frita', categoryId: 'porcoes', price: 14, cost: 6, stock: 18, active: true, aliases: ['batata', 'porcao'], favorite: true },
  { id: 'frango-passarinho', name: 'Frango a Passarinho', categoryId: 'porcoes', price: 28, cost: 16, stock: 10, active: true },
  { id: 'refrigerante-lata', name: 'Refrigerante Lata', categoryId: 'bebidas', price: 6, cost: 3.2, stock: 48, active: true, aliases: ['refri', 'lata'], favorite: true },
  { id: 'suco-natural', name: 'Suco Natural', categoryId: 'bebidas', price: 8, cost: 3.5, stock: 20, active: true },
  { id: 'agua', name: 'Agua Mineral', categoryId: 'bebidas', price: 4, cost: 1.8, stock: 35, active: true },
  { id: 'combo-casal', name: 'Combo Casal', categoryId: 'combos', price: 48, cost: 25, stock: 8, active: true, aliases: ['combo'], favorite: true },
  { id: 'combo-familia', name: 'Combo Familia', categoryId: 'combos', price: 72, cost: 38, stock: 6, active: true }
];

export const mockCaixa = {
  id: 'caixa-atual',
  status: 'aberto',
  openedAt: new Date().toISOString(),
  initialAmount: 0,
  currentAmount: 0,
  payments: {
    dinheiro: 0,
    pix: 0,
    debito: 0,
    credito: 0
  }
};

export const mockActiveComanda = {
  id: 'comanda-local',
  number: 1,
  status: 'aberta',
  items: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};
