import { readFile } from 'node:fs/promises';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const { renderFechamentoRapidoModal } = await import('../src/components/fechamento-rapido-modal.component.js?v=20260807-21');

const summary = {
  salesTotal: 250,
  entriesTotal: 20,
  outputsTotal: 10,
  estimatedProfit: 260,
  paymentTotals: { dinheiro: 100, pix: 80, debito: 40, credito: 30 }
};
const closingSummary = {
  payments: { generalDifference: -5 },
  outOfStockSales: [{
    productName: 'Pastel', categoryName: 'Lanches', quantity: 1, unitPrice: 8, totalPrice: 8,
    commandReference: 'C-7', userName: 'Operador'
  }]
};
const showcase = [
  { productId: 'p1', productName: 'Coxinha', expectedLeftoverQuantity: 3, differenceQuantity: -1 },
  { productId: 'p2', productName: 'Kibe', expectedLeftoverQuantity: 2, differenceQuantity: 0 }
];
const baseState = {
  quickClosing: { note: 'ok', countedCash: '110', checkedPix: '80', checkedDebit: '40', checkedCredit: '30', leftovers: { p1: '2' } }
};
const render = (tab) => renderFechamentoRapidoModal({ summary, closingSummary, showcase, state: { ...baseState, quickClosingTab: tab } });

const resumo = render('resumo');
const pagamentos = render('pagamentos');
const vitrine = render('vitrine');
const all = resumo + pagamentos + vitrine;

// Texto com acentos
['Fechamento rápido', 'conferência de pagamentos', 'Cartões esperados', 'Diferença geral', 'Divergências na vitrine',
  'Observação do fechamento', 'Obrigatória se houver sobra, falta ou diferença', 'Saídas', 'Unitário', 'Usuário']
  .forEach((text) => assert(all.includes(text), `fechamento rapido deve mostrar "${text}"`));
assert(pagamentos.includes('Débito conferido') && pagamentos.includes('Crédito conferido'), 'pagamentos com acentos');
['Fechamento rapido', 'conferencia', 'Cartoes', 'Diferenca', 'Divergencias', 'Observacao', 'Obrigatoria', 'Debito', 'Credito', 'Unitario', 'Usuario', 'lancado']
  .forEach((text) => assert(!all.includes(text), `texto sem acento nao deve sobrar: "${text}"`));

// Padroes do visual B
assert(resumo.includes('class="ui-stats quick-closing-summary"') && (resumo.match(/class="ui-stat quick-closing-card"/g) || []).length === 4, 'quatro indicadores ui-stat');
assert(resumo.includes('class="ui-seg quick-closing-tabs"'), 'abas usam o seletor segmentado');
assert(/data-quick-closing-tab="resumo" aria-pressed="true"/.test(resumo) && resumo.includes('quick-closing-tab is-on'), 'aba ativa marcada');
assert(/data-quick-closing-tab="vitrine" aria-pressed="false"/.test(resumo), 'aba inativa sem marca');
assert(resumo.includes('class="ui-table"'), 'vendas sem estoque usam ui-table');

// Ganchos data-* preservados
assert(all.includes('data-action="close-modal"'), 'fechar modal');
['resumo', 'pagamentos', 'vitrine'].forEach((tab) => assert(resumo.includes(`data-quick-closing-tab="${tab}"`), `aba ${tab}`));
assert(resumo.includes('data-quick-note value="ok"'), 'observacao ligada ao estado');
assert(resumo.includes('data-action="confirm-quick-closing"'), 'confirmar fechamento');
['countedCash', 'checkedPix', 'checkedDebit', 'checkedCredit'].forEach((name) => assert(pagamentos.includes(`data-quick-payment="${name}"`), `campo ${name}`));
assert(vitrine.includes('data-quick-leftover="p1"') && vitrine.includes('value="2"') && vitrine.includes('data-quick-leftover="p2"'), 'sobras da vitrine');

// Calculos inalterados: dinheiro esperado = dinheiro + entradas - saidas; cartoes = debito + credito
const brl = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
assert(resumo.includes(brl(110)), 'dinheiro esperado 100 + 20 - 10');
assert(resumo.includes(brl(70)), 'cartoes esperados 40 + 30');
assert(resumo.includes('1 produto(s)'), 'uma divergencia na vitrine');
assert(resumo.includes('money-negative'), 'diferenca geral negativa em vermelho');
assert(vitrine.includes('money-positive'), 'linha sem diferenca em verde');

// Diferenca geral com a mesma regra do Caixa: so a falta (negativa) em vermelho.
const generalDifferenceClass = (markup) => markup.match(/<span>Diferença geral<\/span>\s*<strong class="([^"]*)"/)?.[1];
for (const [difference, expected] of [[-5, 'money-negative'], [0, 'money-positive'], [5, 'money-positive']]) {
  for (const tab of ['resumo', 'pagamentos']) {
    const markup = renderFechamentoRapidoModal({
      summary,
      closingSummary: { ...closingSummary, payments: { generalDifference: difference } },
      showcase,
      state: { ...baseState, quickClosingTab: tab }
    });
    assert(generalDifferenceClass(markup) === expected, `diferenca ${difference} na aba ${tab} deve usar ${expected}`);
  }
}

// CSS do fechamento rapido saiu do legado e usa tokens
const modalB = await readFile(new URL('../src/styles/modal-b.css', import.meta.url), 'utf8');
const quickCss = modalB.slice(modalB.indexOf('.quick-closing-modal {'), modalB.indexOf('@media (max-width: 760px)', modalB.indexOf('.quick-closing-modal {')));
assert(quickCss.includes('.quick-closing-card') && !/#[0-9a-f]{3,6}\b/i.test(quickCss), 'fechamento rapido sem cores fixas');
assert(!/uppercase|gradient/.test(quickCss), 'fechamento rapido sem caixa alta e sem degrade');

console.log('fechamento-rapido-markup.test.mjs ok');
