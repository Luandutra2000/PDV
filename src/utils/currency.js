const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

// Arredonda valores em reais para centavos (evita 621.9999999999999 em somas).
export function roundMoney(value) {
  const number = Number(value) || 0;
  // Arredondamento simetrico (meio centavo se afasta de zero), igual para sobra e falta.
  return (Math.sign(number) * Math.round((Math.abs(number) + Number.EPSILON) * 100)) / 100 || 0;
}

export function formatCurrency(value) {
  return brlFormatter.format(Number(value) || 0);
}
