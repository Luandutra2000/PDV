// Referencia independente da semana simulada. Calcula, em centavos inteiros e
// sem reutilizar codigo do PDV, o resultado financeiro e de estoque esperado.
//
// Regras (conforme o roteiro de QA):
// - TOTAL DA VENDA = soma(quantidade x preco). Sem descontos/acrescimos.
// - DINHEIRO FISICO ESPERADO = fundo + vendas em dinheiro (liquidas de troco)
//   + suprimentos - sangrias - despesas em dinheiro - devolucoes em dinheiro
//   pagas no dia (cancelamento de venda em dinheiro).
// - Pix/debito/credito nao entram na gaveta; estorno no dia reduz o recebido do dia.
// - VITRINE: inicial + lancamentos - min(estoque, vendido) - perdas
//   + estorno das unidades realmente baixadas quando a venda e cancelada.
//   Venda acima do estoque e permitida pelo PDV e gera "venda sem estoque".
//
// Tambem calcula "regraAtualDoSistema": o que a tela Caixa deveria mostrar se a
// regra implementada (vendas ativas do dia + entradas - saidas, sem fundo e
// sem devolucao no dia do cancelamento) fosse aplicada corretamente. Isso
// separa erro de calculo de erro de regra.

export function calcularReferencia(manifesto) {
  const estoque = { ...manifesto.estoqueInicial };
  const vendasRegistradas = new Map();
  const dias = [];

  for (const dia of manifesto.dias) {
    const inicioVitrine = { ...estoque };
    const r = {
      dia: dia.dia,
      data: dia.data,
      fundo: 0,
      comprasPrincipais: 0,
      vendasExtras: 0,
      vendasCanceladasNoDia: 0,
      recebido: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
      devolucoes: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
      trocoTotal: 0,
      entradas: 0,
      saidas: 0,
      sangrias: 0,
      vendidoUnidades: {},
      lancado: {},
      perdas: {},
      semEstoque: {},
      divergenciaDinheiro: 0
    };
    const fechamentoEvento = dia.eventos.find((evento) => evento.tipo === 'fechar-caixa');
    r.divergenciaDinheiro = fechamentoEvento?.divergenciaDinheiro || 0;

    for (const evento of dia.eventos) {
      switch (evento.tipo) {
        case 'abrir-caixa':
          r.fundo = evento.fundo;
          break;
        case 'lancar-vitrine': {
          estoque[evento.produto] = (estoque[evento.produto] || 0) + evento.quantidade;
          r.lancado[evento.produto] = (r.lancado[evento.produto] || 0) + evento.quantidade;
          if (evento.cancelar) {
            estoque[evento.produto] = Math.max(0, estoque[evento.produto] - evento.quantidade);
            r.lancado[evento.produto] -= evento.quantidade;
          }
          break;
        }
        case 'editar-lancamento': {
          const delta = evento.para - evento.de;
          estoque[evento.produto] = Math.max(0, (estoque[evento.produto] || 0) + delta);
          r.lancado[evento.produto] = (r.lancado[evento.produto] || 0) + delta;
          break;
        }
        case 'venda':
        case 'venda-extra': {
          registrarVenda(evento, r, estoque, vendasRegistradas, dia.dia);
          if (evento.tipo === 'venda') r.comprasPrincipais += 1; else r.vendasExtras += 1;
          break;
        }
        case 'disputa-ultima-unidade': {
          for (const sufixo of ['a', 'b']) {
            const venda = { tipo: 'venda-extra', id: `${evento.id}${sufixo}`, itens: [{ produto: evento.produto, quantidade: 1 }], metodo: 'pix', totalEsperado: manifesto.catalogo[evento.produto].preco };
            registrarVenda(venda, r, estoque, vendasRegistradas, dia.dia);
            r.vendasExtras += 1;
          }
          break;
        }
        case 'cancelar': {
          const venda = vendasRegistradas.get(evento.id);
          venda.canceladaNoDia = dia.dia;
          r.vendasCanceladasNoDia += 1;
          r.devolucoes[venda.metodo] += venda.totalEsperado;
          for (const [produto, baixado] of Object.entries(venda.baixado)) {
            estoque[produto] = (estoque[produto] || 0) + baixado;
            r.vendidoUnidades[produto] = (r.vendidoUnidades[produto] || 0) - (venda.quantidades[produto] || 0);
          }
          for (const [produto, falta] of Object.entries(venda.faltante)) {
            r.semEstoque[produto] = (r.semEstoque[produto] || 0) - falta;
          }
          break;
        }
        case 'perda':
          estoque[evento.produto] = Math.max(0, (estoque[evento.produto] || 0) - evento.quantidade);
          r.perdas[evento.produto] = (r.perdas[evento.produto] || 0) + evento.quantidade;
          break;
        default:
          break;
      }
    }

    // Movimentos de caixa ficam com o tipo original em evento.tipoMovimento.
    for (const evento of dia.eventos.filter((item) => item.tipo === 'movimento')) {
      if (evento.tipoMovimento === 'entrada') r.entradas += evento.valor;
      if (evento.tipoMovimento === 'saida') r.saidas += evento.valor;
      if (evento.tipoMovimento === 'sangria') r.sangrias += evento.valor;
    }

    r.dinheiroFisicoEsperado = r.fundo + r.recebido.dinheiro + r.entradas - r.saidas - r.sangrias - r.devolucoes.dinheiro;
    r.dinheiroContado = r.dinheiroFisicoEsperado + r.divergenciaDinheiro;
    r.eletronicoLiquido = {
      pix: r.recebido.pix - r.devolucoes.pix,
      debito: r.recebido.debito - r.devolucoes.debito,
      credito: r.recebido.credito - r.devolucoes.credito
    };
    r.faturamentoBrutoDoDia = Object.values(r.recebido).reduce((a, b) => a + b, 0);
    r.vitrineInicio = inicioVitrine;
    r.vitrineFim = { ...estoque };
    dias.push(r);
  }

  // Regra atual do sistema: vendas ativas (nao canceladas, em qualquer data) do dia.
  for (const r of dias) {
    const ativas = [...vendasRegistradas.values()].filter((venda) => venda.dia === r.dia && !venda.canceladaNoDia);
    const porMetodo = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
    ativas.forEach((venda) => { porMetodo[venda.metodo] += venda.totalEsperado; });
    r.regraAtualDoSistema = {
      vendasAtivas: ativas.length,
      totalVendido: Object.values(porMetodo).reduce((a, b) => a + b, 0),
      porMetodo,
      dinheiroEsperadoSemFundo: porMetodo.dinheiro + r.entradas - r.saidas - r.sangrias,
      dinheiroEsperadoComFundo: r.fundo + porMetodo.dinheiro + r.entradas - r.saidas - r.sangrias
    };
  }

  const semana = {
    comprasPrincipais: dias.reduce((a, d) => a + d.comprasPrincipais, 0),
    vendasExtras: dias.reduce((a, d) => a + d.vendasExtras, 0),
    cancelamentos: dias.reduce((a, d) => a + d.vendasCanceladasNoDia, 0),
    recebidoLiquido: ['dinheiro', 'pix', 'debito', 'credito'].reduce((acc, metodo) => {
      acc[metodo] = dias.reduce((a, d) => a + d.recebido[metodo] - d.devolucoes[metodo], 0);
      return acc;
    }, {}),
    vitrineFinal: dias.at(-1)?.vitrineFim || {}
  };
  semana.faturamentoLiquido = Object.values(semana.recebidoLiquido).reduce((a, b) => a + b, 0);
  return { dias, semana };
}

function registrarVenda(venda, r, estoque, vendasRegistradas, dia) {
  const baixado = {};
  const faltante = {};
  const quantidades = {};
  for (const item of venda.itens) {
    quantidades[item.produto] = (quantidades[item.produto] || 0) + item.quantidade;
  }
  for (const [produto, quantidade] of Object.entries(quantidades)) {
    const disponivel = estoque[produto] || 0;
    const baixa = Math.min(disponivel, quantidade);
    estoque[produto] = disponivel - baixa;
    baixado[produto] = baixa;
    if (quantidade > baixa) {
      faltante[produto] = quantidade - baixa;
      r.semEstoque[produto] = (r.semEstoque[produto] || 0) + quantidade - baixa;
    }
    r.vendidoUnidades[produto] = (r.vendidoUnidades[produto] || 0) + quantidade;
  }
  r.recebido[venda.metodo] += venda.totalEsperado;
  if (venda.metodo === 'dinheiro') r.trocoTotal += (venda.recebido ?? venda.totalEsperado) - venda.totalEsperado;
  vendasRegistradas.set(venda.id, { ...venda, dia, baixado, faltante, quantidades });
}
