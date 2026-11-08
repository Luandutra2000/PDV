// Cor da diferenca do fechamento (contado - esperado), igual em todas as telas:
// falta (negativa) em vermelho; zero ou sobra em verde. Meio centavo conta como zero.
export function getDifferenceTone(value) {
  return Number(value) < -0.005 ? 'minus' : 'plus';
}
