// Gera a massa reproduzivel da semana simulada (semente fixa) e grava
// qa-pdv/cenarios-semana.json. Nao usa nenhuma funcao do sistema.
// Uso: node qa-pdv/ferramentas/gerar-cenarios.mjs [RUN_ID] [DATA_DIA1]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcularReferencia } from './referencia.mjs';

const RUN_ID = process.argv[2] || 'R1';
const DAY1 = process.argv[3] || '2026-11-02';
const SEED = 20261102;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const pick = (list) => list[Math.floor(rand() * list.length)];
const weighted = (entries) => {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) { roll -= weight; if (roll <= 0) return value; }
  return entries[entries.length - 1][0];
};
const shuffle = (list) => { for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };

// Catalogo de teste (precos em centavos) — cadastrado pela tela Produtos.
export const CATALOGO = {
  'qa-coxinha': { nome: 'QA Coxinha', preco: 750, peso: 18 },
  'qa-pao-de-queijo': { nome: 'QA Pão de Queijo', preco: 425, peso: 15 },
  'qa-esfiha': { nome: 'QA Esfiha', preco: 690, peso: 8 },
  'qa-misto-quente': { nome: 'QA Misto Quente', preco: 1290, peso: 8 },
  'qa-x-salada': { nome: 'QA X-Salada', preco: 1850, peso: 6 },
  'qa-brigadeiro': { nome: 'QA Brigadeiro', preco: 375, peso: 10 },
  'qa-bolo-de-cenoura-fatia': { nome: 'QA Bolo de Cenoura (fatia)', preco: 890, peso: 6 },
  'qa-cafe': { nome: 'QA Café', preco: 450, peso: 14 },
  'qa-agua-500ml': { nome: 'QA Água 500ml', preco: 300, peso: 7 },
  'qa-suco-de-laranja': { nome: 'QA Suco de Laranja', preco: 990, peso: 5 },
  'qa-refrigerante-lata': { nome: 'QA Refrigerante Lata', preco: 650, peso: 8 },
  'qa-ultimo-item': { nome: 'QA Último Item', preco: 555, peso: 0 },
  'qa-inativo': { nome: 'QA Inativo', preco: 200, peso: 0 }
};
export const ESTOQUE_INICIAL = { 'qa-agua-500ml': 48, 'qa-refrigerante-lata': 36, 'qa-ultimo-item': 1, 'qa-inativo': 5 };

const DIAS = [
  { n: 1, clientes: 20, fundo: 15000, metodos: { dinheiro: 10, pix: 10, debito: 0, credito: 0 }, enfase: 'Abertura, vendas basicas, dinheiro, Pix e primeiro fechamento' },
  { n: 2, clientes: 25, fundo: 12000, metodos: { dinheiro: 5, pix: 4, debito: 9, credito: 7 }, enfase: 'Cartoes, variedade de itens e edicao do carrinho' },
  { n: 3, clientes: 25, fundo: 10000, metodos: { dinheiro: 9, pix: 7, debito: 5, credito: 4 }, enfase: 'Lancamentos de vitrine, reposicoes, sobras e estoque' },
  { n: 4, clientes: 30, fundo: 15000, metodos: { dinheiro: 11, pix: 8, debito: 6, credito: 5 }, enfase: 'Descontos (nao suportado) e cancelamentos' },
  { n: 5, clientes: 30, fundo: 10000, metodos: { dinheiro: 10, pix: 8, debito: 7, credito: 5 }, enfase: 'Pagamento dividido (nao suportado), permissoes e recuperacao de falhas' },
  { n: 6, clientes: 40, fundo: 20000, metodos: { dinheiro: 13, pix: 10, debito: 10, credito: 7 }, enfase: 'Movimento maior, sessoes simultaneas e duplicidade' },
  { n: 7, clientes: 30, fundo: 15000, metodos: { dinheiro: 9, pix: 8, debito: 8, credito: 5 }, enfase: 'Estoque final, fechamento e conferencia semanal' }
];

// Producao/abastecimento lancado na vitrine as 07:10 de cada dia.
const PRODUCAO = {
  1: { 'qa-coxinha': 25, 'qa-pao-de-queijo': 30, 'qa-esfiha': 12, 'qa-misto-quente': 10, 'qa-x-salada': 6, 'qa-brigadeiro': 20, 'qa-bolo-de-cenoura-fatia': 8, 'qa-cafe': 30, 'qa-suco-de-laranja': 10 },
  2: { 'qa-coxinha': 25, 'qa-pao-de-queijo': 25, 'qa-esfiha': 10, 'qa-misto-quente': 10, 'qa-x-salada': 8, 'qa-brigadeiro': 15, 'qa-bolo-de-cenoura-fatia': 8, 'qa-cafe': 30, 'qa-suco-de-laranja': 10 },
  3: { 'qa-coxinha': 20, 'qa-pao-de-queijo': 25, 'qa-esfiha': 10, 'qa-misto-quente': 8, 'qa-x-salada': 3, 'qa-brigadeiro': 15, 'qa-bolo-de-cenoura-fatia': 10, 'qa-cafe': 25, 'qa-suco-de-laranja': 8 },
  4: { 'qa-coxinha': 30, 'qa-pao-de-queijo': 30, 'qa-esfiha': 12, 'qa-misto-quente': 12, 'qa-x-salada': 8, 'qa-brigadeiro': 20, 'qa-bolo-de-cenoura-fatia': 8, 'qa-cafe': 35, 'qa-suco-de-laranja': 10, 'qa-agua-500ml': 24 },
  5: { 'qa-coxinha': 30, 'qa-pao-de-queijo': 30, 'qa-esfiha': 12, 'qa-misto-quente': 12, 'qa-x-salada': 8, 'qa-brigadeiro': 20, 'qa-bolo-de-cenoura-fatia': 10, 'qa-cafe': 35, 'qa-suco-de-laranja': 12 },
  6: { 'qa-coxinha': 40, 'qa-pao-de-queijo': 40, 'qa-esfiha': 15, 'qa-misto-quente': 15, 'qa-x-salada': 10, 'qa-brigadeiro': 25, 'qa-bolo-de-cenoura-fatia': 12, 'qa-cafe': 45, 'qa-suco-de-laranja': 15, 'qa-refrigerante-lata': 24 },
  7: { 'qa-coxinha': 25, 'qa-pao-de-queijo': 25, 'qa-esfiha': 10, 'qa-misto-quente': 10, 'qa-x-salada': 6, 'qa-brigadeiro': 15, 'qa-bolo-de-cenoura-fatia': 8, 'qa-cafe': 30, 'qa-suco-de-laranja': 10 }
};

// Movimentos de caixa (centavos). tipo: entrada (suprimento), saida (despesa em dinheiro), sangria.
const MOVIMENTOS = {
  2: [{ hora: '10:05', tipo: 'entrada', valor: 5000, descricao: 'QA suprimento de troco' }],
  3: [{ hora: '11:40', tipo: 'saida', valor: 2340, descricao: 'QA despesa gelo (dinheiro)' }],
  4: [{ hora: '15:20', tipo: 'sangria', valor: 20000, descricao: 'QA sangria para cofre' }],
  5: [{ hora: '13:10', tipo: 'saida', valor: 1575, descricao: 'QA despesa entrega (dinheiro)' }],
  6: [{ hora: '12:30', tipo: 'entrada', valor: 3000, descricao: 'QA suprimento moedas' }, { hora: '16:45', tipo: 'sangria', valor: 30000, descricao: 'QA sangria fim de tarde' }],
  7: [{ hora: '14:00', tipo: 'saida', valor: 1230, descricao: 'QA despesa guardanapos (dinheiro)' }]
};

const PERDAS = {
  3: [{ hora: '17:50', produto: 'qa-bolo-de-cenoura-fatia', quantidade: 2, motivo: 'vencido' }],
  7: [{ hora: '17:50', produto: 'qa-brigadeiro', quantidade: 3, motivo: 'consumo' }]
};

function horarios(quantidade, dia) {
  // Distribui as vendas entre 07:30 e 18:30 com picos no cafe e no almoco.
  const minutos = [];
  for (let i = 0; i < quantidade; i += 1) {
    const faixa = weighted([[[450, 570], 4], [[570, 690], 2], [[690, 840], 4], [[840, 1000], 2], [[1000, 1110], 2]]);
    minutos.push(faixa[0] + Math.floor(rand() * (faixa[1] - faixa[0])));
  }
  minutos.sort((a, b) => a - b);
  // Garante minutos distintos para ordenar as vendas de forma estavel.
  for (let i = 1; i < minutos.length; i += 1) if (minutos[i] <= minutos[i - 1]) minutos[i] = minutos[i - 1] + 1;
  return minutos.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

function gerarItens(grande) {
  const produtos = Object.entries(CATALOGO).filter(([, p]) => p.peso > 0).map(([id, p]) => [id, p.peso]);
  const linhas = grande ? 3 + Math.floor(rand() * 3) : weighted([[1, 5], [2, 4], [3, 2]]);
  const itens = new Map();
  while (itens.size < linhas) {
    const id = weighted(produtos);
    const qtd = grande ? 2 + Math.floor(rand() * 5) : weighted([[1, 7], [2, 3], [3, 1]]);
    itens.set(id, (itens.get(id) || 0) + qtd);
  }
  return [...itens.entries()].map(([produto, quantidade]) => ({ produto, quantidade }));
}

function recebidoEmDinheiro(totalCentavos) {
  const modo = weighted([['exato', 3], ['nota', 7]]);
  if (modo === 'exato') return { recebido: totalCentavos, modo };
  const notas = [500, 1000, 2000, 5000, 10000, 20000];
  const nota = notas.find((valor) => valor >= totalCentavos && rand() < 0.75) || Math.ceil(totalCentavos / 1000) * 1000 + (rand() < 0.5 ? 0 : 1000);
  return { recebido: Math.max(nota, totalCentavos), modo: 'nota' };
}

const precos = Object.fromEntries(Object.entries(CATALOGO).map(([id, p]) => [id, p.preco]));
const totalItens = (itens) => itens.reduce((sum, item) => sum + item.quantidade * precos[item.produto], 0);

let cliente = 0;
const dias = [];
for (const dia of DIAS) {
  const data = new Date(`${DAY1}T12:00:00`);
  data.setDate(data.getDate() + dia.n - 1);
  const dataIso = data.toISOString().slice(0, 10);
  const metodos = shuffle(Object.entries(dia.metodos).flatMap(([m, q]) => Array(q).fill(m)));
  const horas = horarios(dia.clientes, dia.n);
  const eventos = [];
  eventos.push({ tipo: 'abrir-caixa', hora: '07:00', fundo: dia.fundo });
  eventos.push({ tipo: 'abrir-caixa-duplicado', hora: '07:01' });
  for (const [produto, quantidade] of Object.entries(PRODUCAO[dia.n])) eventos.push({ tipo: 'lancar-vitrine', hora: '07:10', produto, quantidade });
  const vendas = [];
  for (let i = 0; i < dia.clientes; i += 1) {
    cliente += 1;
    const grande = rand() < 0.12;
    const itens = gerarItens(grande);
    const metodo = metodos[i];
    const total = totalItens(itens);
    const venda = { tipo: 'venda', id: `CLI-${String(cliente).padStart(3, '0')}`, hora: horas[i], itens, metodo, totalEsperado: total };
    if (metodo === 'dinheiro') Object.assign(venda, recebidoEmDinheiro(total));
    vendas.push(venda);
  }
  // Cenarios especificos marcados em vendas principais (sem mudar a contagem).
  if (dia.n === 2) { vendas[3].edicoes = ['aumentar', 'diminuir', 'remover-extra']; vendas[10].edicoes = ['aumentar']; vendas[17].edicoes = ['remover-extra']; }
  if (dia.n === 5) { vendas[6].falha = 'sem-conexao'; vendas[14].falha = 'recarregar-no-pagamento'; }
  if (dia.n === 6) { vendas[8].falha = 'duplo-clique'; vendas[25].falha = 'duplo-clique'; }
  if (dia.n === 1) { vendas[2].falha = 'dinheiro-insuficiente-antes'; }
  eventos.push(...vendas);
  for (const mov of MOVIMENTOS[dia.n] || []) eventos.push({ tipo: 'movimento', tipoMovimento: mov.tipo, hora: mov.hora, valor: mov.valor, descricao: mov.descricao });
  for (const perda of PERDAS[dia.n] || []) eventos.push({ tipo: 'perda', ...perda });

  // Operacoes extras (fora das 200 compras principais).
  if (dia.n === 2) eventos.push({ tipo: 'carrinho-abandonado', id: 'EXT-01', hora: '09:15', itens: [{ produto: 'qa-coxinha', quantidade: 2 }, { produto: 'qa-cafe', quantidade: 1 }] });
  if (dia.n === 3) {
    eventos.push({ tipo: 'editar-lancamento', id: 'EXT-02', hora: '07:20', produto: 'qa-coxinha', de: 20, para: 22 });
    eventos.push({ tipo: 'lancar-vitrine', id: 'EXT-03', hora: '07:25', produto: 'qa-esfiha', quantidade: 5, cancelar: true });
    eventos.push({ tipo: 'lancar-vitrine', id: 'EXT-04', hora: '12:00', produto: 'qa-pao-de-queijo', quantidade: 10, reposicao: true });
    eventos.push({ tipo: 'venda-extra', id: 'EXT-05', hora: '17:30', itens: [{ produto: 'qa-misto-quente', quantidade: 1 }, { produto: 'qa-suco-de-laranja', quantidade: 1 }], metodo: 'dinheiro', recebido: 2500, cancelarNoDia: 4, motivo: 'QA cancelamento de venda do dia anterior' });
  }
  if (dia.n === 4) {
    eventos.push({ tipo: 'venda-extra', id: 'EXT-06', hora: '10:30', itens: [{ produto: 'qa-coxinha', quantidade: 2 }], metodo: 'dinheiro', recebido: 2000, cancelarNoDia: 4, motivo: 'QA cliente desistiu (dinheiro devolvido)' });
    eventos.push({ tipo: 'venda-extra', id: 'EXT-07', hora: '12:15', itens: [{ produto: 'qa-x-salada', quantidade: 1 }, { produto: 'qa-refrigerante-lata', quantidade: 1 }], metodo: 'pix', cancelarNoDia: 4, motivo: 'QA pix estornado' });
    eventos.push({ tipo: 'venda-extra', id: 'EXT-08', hora: '15:40', itens: [{ produto: 'qa-brigadeiro', quantidade: 4 }], metodo: 'debito', cancelarNoDia: 4, motivo: 'QA lancado na forma errada' });
    eventos.push({ tipo: 'cancelar', id: 'EXT-05', hora: '08:05' });
    eventos.push({ tipo: 'cancelar', id: 'EXT-06', hora: '10:45' });
    eventos.push({ tipo: 'cancelar', id: 'EXT-07', hora: '12:30' });
    eventos.push({ tipo: 'cancelar', id: 'EXT-08', hora: '15:50' });
  }
  if (dia.n === 6) {
    eventos.push({ tipo: 'disputa-ultima-unidade', id: 'EXT-09', hora: '11:00', produto: 'qa-ultimo-item' });
  }
  if (dia.n === 7) {
    eventos.push({ tipo: 'alterar-preco', id: 'EXT-10', hora: '13:00', produto: 'qa-cafe', de: 450, para: 480 });
    eventos.push({ tipo: 'venda-extra', id: 'EXT-11', hora: '16:00', itens: [{ produto: 'qa-inativo', quantidade: 1 }], metodo: 'pix' });
  }
  const fechamento = { tipo: 'fechar-caixa', hora: '18:45' };
  if (dia.n === 5) fechamento.divergenciaDinheiro = -500;
  eventos.push(fechamento);
  eventos.sort((a, b) => a.hora.localeCompare(b.hora) || ordemTipo(a) - ordemTipo(b));
  dias.push({ dia: dia.n, data: dataIso, enfase: dia.enfase, clientes: dia.clientes, eventos });
}

function ordemTipo(evento) {
  return ['abrir-caixa', 'abrir-caixa-duplicado', 'lancar-vitrine', 'editar-lancamento'].includes(evento.tipo) ? 0 : 1;
}

// A partir do Dia 7 13:00 o cafe custa 4,80; recalcula o total esperado das vendas posteriores.
for (const dia of dias) {
  let preco = { ...precos };
  for (const evento of dia.eventos) {
    if (evento.tipo === 'alterar-preco') preco = { ...preco, [evento.produto]: evento.para };
    if (evento.tipo === 'venda' || evento.tipo === 'venda-extra') {
      evento.totalEsperado = evento.itens.reduce((sum, item) => sum + item.quantidade * preco[item.produto], 0);
      if (evento.metodo === 'dinheiro' && evento.recebido < evento.totalEsperado) evento.recebido = Math.ceil(evento.totalEsperado / 1000) * 1000;
    }
  }
  if (dia.dia === 7) {
    // Precos posteriores a alteracao: mantem dinheiro coerente.
  }
}

const manifesto = {
  execucao: RUN_ID,
  semente: SEED,
  geradoEm: new Date().toISOString(),
  arredondamento: 'Valores em centavos inteiros; total = soma(quantidade x preco unitario em centavos). Sem descontos/acrescimos (o sistema nao possui). Troco = recebido - total.',
  adaptacaoPagamentos: 'O PDV nao possui pagamento dividido: as 20 compras divididas foram redistribuidas (+7 dinheiro, +5 pix, +5 debito, +3 credito). Distribuicao final: 67 dinheiro, 55 pix, 45 debito, 33 credito.',
  catalogo: CATALOGO,
  estoqueInicial: ESTOQUE_INICIAL,
  dias
};
manifesto.referencia = calcularReferencia(manifesto);

const destino = resolve(import.meta.dirname, '..', RUN_ID === 'R1' ? 'cenarios-semana.json' : `cenarios-semana-${RUN_ID}.json`);
writeFileSync(destino, `${JSON.stringify(manifesto, null, 2)}\n`);
const contagem = dias.reduce((sum, d) => sum + d.eventos.filter((e) => e.tipo === 'venda').length, 0);
const porMetodo = {};
dias.forEach((d) => d.eventos.filter((e) => e.tipo === 'venda').forEach((e) => { porMetodo[e.metodo] = (porMetodo[e.metodo] || 0) + 1; }));
console.log(`Manifesto ${RUN_ID}: ${contagem} compras principais`, porMetodo, '->', destino);
