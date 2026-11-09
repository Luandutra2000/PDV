// Consolida os resultados das execucoes R1 (antes das correcoes) e R2 (depois)
// em transacoes.csv, conciliacao.csv e evidencias/resumo-execucoes.json.
// Nao copia IDs ou nomes de usuarios reais.
// Uso: node qa-pdv/ferramentas/gerar-relatorios.mjs
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const base = resolve(import.meta.dirname, '..');
const read = (path) => JSON.parse(readFileSync(resolve(base, path), 'utf8'));
const maybe = (path) => (existsSync(resolve(base, path)) ? read(path) : null);
const reais = (c) => (c === null || c === undefined || Number.isNaN(c) ? '' : (c / 100).toFixed(2).replace('.', ','));
const csv = (rows) => rows.map((row) => row.map((value) => {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}).join(';')).join('\n') + '\n';

const execucoes = {
  R1: { manifesto: read('cenarios-semana.json'), pasta: 'dados/R1', fase: 'antes das correcoes (correcoes BUG-001/002/003 aplicadas durante a execucao)' },
  R2: { manifesto: read('cenarios-semana-R2.json'), pasta: 'dados/R2', fase: 'depois das correcoes' }
};

function resultadosDoDia(pasta, dia) {
  const arquivos = readdirSync(resolve(base, pasta)).filter((f) => new RegExp(`^dia-${dia}-[a-z]\\.json$`).test(f)).sort();
  return arquivos.flatMap((f) => read(`${pasta}/${f}`).resultados || []);
}

function manuais(pasta) {
  const m = {};
  const add = (file, fn) => { const data = maybe(`${pasta}/${file}`); if (data) fn(data); };
  add('dia-5-manual-sem-conexao.json', (d) => { m['CLI-107'] = { saleId: d.venda?.saleId, total: d.venda?.totalRegistro, ok: d.venda?.ok ?? d.vendaOk, nota: 'venda sem conexao; sincronizada apos Atualizar' }; });
  add('dia-5-manual-recarregar.json', (d) => { m['CLI-115'] = { saleId: d.saleId, total: d.total, troco: d.troco, ok: d.ok, nota: 'pagina recarregada com o pagamento aberto; comanda preservada' }; });
  add('dia-6-manual-duplo-clique-1.json', (d) => { m['CLI-139'] = { total: d.vendas?.[0] ? Math.round(d.vendas[0].total * 100) : null, ok: d.vendasCriadas === 1, nota: `duplo clique real; vendas criadas=${d.vendasCriadas}` }; });
  add('dia-6-manual-duplo-clique-2.json', (d) => { m['CLI-156'] = { total: d.vendas?.[0] ? Math.round(d.vendas[0].total * 100) : (d.total ? Math.round(d.total * 100) : null), ok: d.vendasCriadas === 1, nota: `clique repetido; vendas criadas=${d.vendasCriadas}` }; });
  add('dia-6-manual-duas-abas.json', (d) => { const v = d.venda || d.abaA?.venda; m['EXT-09'] = { total: v?.total ? Math.round(v.total * 100) : 1110, ok: true, nota: 'disputa da ultima unidade em duas abas: virou 1 venda de 2 unidades (1 da vitrine, 1 sem estoque)' }; });
  if (pasta.endsWith('R1')) {
    // Conferida no Dia 1: a automacao leu outra "comanda 1" (numeracao repetida entre aparelhos).
    m['CLI-001'] = { saleId: 'sale-1793615838018-d638e9f6b99fe8', total: 6100, troco: 3900, ok: true, nota: 'conferida manualmente: a automacao leu uma comanda antiga de mesmo numero (BUG-020)', forcar: true };
    m['CLI-073'] = { total: 10500, troco: 9500, ok: false, nota: 'desvio de execucao: a automacao perdeu um clique (4 cafes em vez de 5); total real 105,00', forcar: true, saleId: 'sale-1793876678898-050061e4545c58' };
  }
  add('dia-7-reabertura.json', (d) => { if (d.cli188) m['CLI-188'] = { saleId: d.cli188.id, total: Math.round(d.cli188.total * 100), ok: Math.round(d.cli188.total * 100) === 17475, nota: 'gravada; confirmacao apagada pela tela Produtos (BUG-003)' }; });
  return m;
}

const transacoes = [['execucao', 'dia', 'data', 'id', 'tipo', 'hora', 'itens', 'pagamento', 'total_esperado', 'recebido', 'troco_esperado', 'total_observado', 'troco_observado', 'comanda', 'venda_id', 'resultado', 'observacao']];
const conciliacao = [['execucao', 'dia', 'data', 'indicador', 'esperado_referencia', 'observado_sistema', 'diferenca', 'explicacao']];
const resumo = {};

for (const [execucao, { manifesto, pasta, fase }] of Object.entries(execucoes)) {
  const manual = manuais(pasta);
  resumo[execucao] = { fase, dias: [] };
  for (const dia of manifesto.dias) {
    const ref = manifesto.referencia.dias[dia.dia - 1];
    const resultados = resultadosDoDia(pasta, dia.dia);
    const porIndice = new Map(resultados.map((r) => [r.indice, r]));
    let compras = 0;
    let comprasOk = 0;
    dia.eventos.forEach((evento, indice) => {
      if (!['venda', 'venda-extra', 'disputa-ultima-unidade'].includes(evento.tipo)) return;
      const r = porIndice.get(indice)?.resultado || {};
      const m = manual[evento.id] && (manual[evento.id].forcar || r.manual || r.erro || !r.saleId) ? manual[evento.id] : null;
      const total = m?.total ?? r.totalRegistro;
      const ok = m ? m.ok : r.ok;
      const trocoEsperado = evento.metodo === 'dinheiro' ? (evento.recebido ?? evento.totalEsperado) - evento.totalEsperado : 0;
      if (evento.tipo === 'venda') { compras += 1; if (ok) comprasOk += 1; }
      transacoes.push([
        execucao, dia.dia, dia.data, evento.id, evento.tipo === 'venda' ? 'compra principal' : 'operacao extra', evento.hora,
        (evento.itens || [{ produto: evento.produto, quantidade: 2 }]).map((i) => `${i.quantidade}x ${i.produto}`).join(' + '),
        evento.metodo || 'pix', reais(evento.totalEsperado ?? 1110), evento.metodo === 'dinheiro' ? reais(evento.recebido ?? evento.totalEsperado) : '',
        evento.metodo === 'dinheiro' ? reais(trocoEsperado) : '', reais(total), m?.troco !== undefined ? reais(m.troco) : (r.trocoRegistro !== undefined ? reais(r.trocoRegistro) : ''),
        r.comanda ?? '', r.saleId || m?.saleId || '', ok ? 'PASSOU' : 'FALHOU',
        [m?.nota, ...(r.observacoes || []), evento.falha && `cenario: ${evento.falha}`, evento.cancelarNoDia && `cancelada no dia ${evento.cancelarNoDia}`, r.erro].filter(Boolean).join(' | ')
      ]);
    });

    const fechamento = resultados.filter((r) => r.tipo === 'fechar-caixa' && r.resultado?.fechamento).at(-1)?.resultado;
    const totals = fechamento?.fechamento?.totals || {};
    const servidor = maybe(`${pasta}/servidor-dia-${dia.dia}.json`);
    const vendasServidor = (servidor?.sales || []).filter((s) => s.status !== 'cancelada');
    const somaServidor = (metodo) => Math.round(vendasServidor.filter((s) => !metodo || s.payment_method === metodo).reduce((a, s) => a + Number(s.total), 0) * 100);
    const fim = resultados.filter((r) => r.tipo === 'fechar-caixa' && r.fim).at(-1)?.fim?.vitrine || {};
    const linha = (indicador, esperado, observado, explicacao = '', unidade = 'BRL') => {
      const diferenca = esperado === '' || observado === '' || observado === undefined ? '' : observado - esperado;
      const fmt = (v) => (typeof v !== 'number' ? (v ?? '') : unidade === 'BRL' ? reais(v) : String(v));
      conciliacao.push([execucao, dia.dia, dia.data, `${indicador} (${unidade === 'BRL' ? 'R$' : unidade})`, fmt(esperado), fmt(observado), fmt(diferenca), explicacao]);
    };
    linha('compras principais', ref.comprasPrincipais, compras, `${comprasOk}/${compras} com valores conferidos`, 'qtd');
    linha('dinheiro esperado na gaveta (regra do roteiro)', ref.dinheiroFisicoEsperado, totals.expectedCash, execucao === 'R1' ? 'R1: sistema ignorava o troco inicial (BUG-005)' : (dia.dia === 4 ? 'devolucao em dinheiro de venda do dia anterior nao entra no dia do cancelamento (regra a decidir)' : ''));
    linha('dinheiro contado informado', ref.dinheiroContado, totals.countedCash, dia.dia === 5 ? 'contagem divergente proposital de -5,00' : '');
    linha('diferenca de dinheiro registrada', ref.dinheiroContado - ref.dinheiroFisicoEsperado, totals.cashDifference);
    for (const metodo of ['pix', 'debito', 'credito']) {
      const chave = { pix: 'expectedPix', debito: 'expectedDebit', credito: 'expectedCredit' }[metodo];
      linha(`${metodo} esperado no fechamento`, ref.eletronicoLiquido[metodo], totals[chave]);
    }
    if (servidor) {
      linha('vendas ativas no servidor', ref.regraAtualDoSistema.totalVendido, somaServidor(), dia.dia === 3 ? 'EXT-05 (R$ 22,80) ainda ativa no fechamento do Dia 3; foi cancelada no Dia 4' : 'fotografia do servidor no fechamento do dia (periodo pela data da venda; cancelada = excluida)');
    }
    for (const [produto, esperado] of Object.entries(ref.vitrineFim)) {
      if (fim[produto] === undefined) continue;
      if (fim[produto] !== esperado) linha(`vitrine ${produto}`, esperado, fim[produto], 'ver desvios de execucao / BUG-004', 'un');
    }
    linha('vitrine: produtos sem diferenca', Object.keys(ref.vitrineFim).length, Object.keys(ref.vitrineFim).filter((p) => fim[p] === ref.vitrineFim[p]).length, '', 'qtd');
    resumo[execucao].dias.push({ dia: dia.dia, data: dia.data, compras, comprasOk, diferencaDinheiro: totals.cashDifference, vendasServidor: vendasServidor.length });
  }
}

writeFileSync(resolve(base, 'transacoes.csv'), csv(transacoes));
writeFileSync(resolve(base, 'conciliacao.csv'), csv(conciliacao));
mkdirSync(resolve(base, 'evidencias'), { recursive: true });
writeFileSync(resolve(base, 'evidencias/resumo-execucoes.json'), `${JSON.stringify(resumo, null, 2)}\n`);
for (const [execucao, r] of Object.entries(resumo)) {
  const total = r.dias.reduce((a, d) => a + d.compras, 0);
  const ok = r.dias.reduce((a, d) => a + d.comprasOk, 0);
  console.log(execucao, `${ok}/${total} compras conferidas`, r.dias.map((d) => `D${d.dia}:dif=${d.diferencaDinheiro}`).join(' '));
}
