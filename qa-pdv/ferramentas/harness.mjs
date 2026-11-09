// Roteiro de automacao executado DENTRO da pagina do PDV (servidor de QA).
// Opera a interface real: clica em botoes, preenche formularios e dispara os
// mesmos eventos que o operador. Os servicos do app sao importados SOMENTE
// para leitura/verificacao (nunca para registrar venda ou caixa).
//
// Uso no console da pagina:
//   const H = await import('/qa-pdv/ferramentas/harness.mjs?v=1');
//   H.iniciarDia(manifesto, 1)  -> roda em segundo plano; ver window.__QA_RUN__
const V = 'v=20260804-06';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const centavos = (texto) => {
  const limpo = String(texto || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  return Math.round(Number(limpo) * 100);
};
const reais = (c) => (c / 100).toFixed(2);

async function waitFor(fn, { timeout = 8000, step = 80, label = 'condicao' } = {}) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    try {
      const value = fn();
      if (value) return value;
    } catch { /* tenta de novo */ }
    await sleep(step);
  }
  throw new Error(`Tempo esgotado aguardando ${label}`);
}

function setValue(el, value) {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : (el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype);
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function services() {
  const [tx, show, cash, closing, prod, fin, resumo, showSync] = await Promise.all([
    import(`/src/services/transaction.service.js?${V}`),
    import(`/src/services/showcase-stock.service.js?${V}`),
    import(`/src/services/cash-session.service.js?${V}`),
    import(`/src/services/cash-closing.service.js?${V}`),
    import(`/src/services/product.service.js?${V}`),
    import(`/src/services/financial-sync.service.js?${V}`),
    import(`/src/services/dashboard-resumo.service.js?${V}`),
    import(`/src/services/showcase-sync.service.js?${V}`)
  ]);
  return { tx, show, cash, closing, prod, fin, resumo, showSync };
}

export function relogio(data, hora, segundos = 0) {
  return window.__QA_CLOCK__.set(`${data}T${hora}:${String(segundos).padStart(2, '0')}`);
}

function toasts() {
  return $$('.toast-root > *').map((t) => t.innerText.replace(/\s+/g, ' ').trim());
}

async function fecharModais() {
  for (let i = 0; i < 3; i += 1) {
    const close = $('.modal-backdrop.is-open [data-action="close-modal"], .modal-backdrop.is-open [data-action="close-sale-success"], .modal-backdrop.is-open [data-action="close-cash-session-modal"]');
    if (!close) return;
    close.click();
    await sleep(150);
  }
}

export async function ir(menuId) {
  await fecharModais();
  const workspace = $('[data-workspace-body]');
  const marcadores = { 'frente-caixa': '.pdv-screen', estoque: '[data-estoque-screen]', 'fechar-caixa': '[data-caixa-screen]', produtos: '[data-produtos-screen]' };
  if (workspace?.dataset.activeRoute === menuId && workspace.children.length && (!marcadores[menuId] || $(marcadores[menuId]))) return;
  const button = $(`[data-menu-id="${menuId}"]`);
  if (!button) throw new Error(`Menu ${menuId} nao encontrado`);
  button.click();
  await waitFor(() => $('[data-workspace-body]')?.dataset.activeRoute === menuId, { label: `rota ${menuId}` });
  await sleep(250);
}

// ---------- Caixa ----------
export async function abrirCaixa(fundoCentavos) {
  const { cash } = await services();
  const antes = cash.getCashSessionStatus();
  if (antes.open) return { status: 'ja-aberto', sessao: antes.session };
  const botao = await waitFor(() => $('[data-action="open-cash-session"]'), { label: 'botao Abrir caixa' });
  botao.click();
  const form = await waitFor(() => $('[data-open-cash-form]'), { label: 'modal abrir caixa' });
  setValue(form.querySelector('[name="openingAmount"]'), reais(fundoCentavos));
  form.requestSubmit();
  await waitFor(() => cash.getCashSessionStatus().open, { label: 'caixa aberto' });
  await sleep(200);
  const depois = cash.getCashSessionStatus();
  return { status: 'aberto', fundo: Math.round(depois.session.openingAmount * 100), indicador: $('[data-cash-session-indicator]')?.innerText.trim() };
}

export async function abrirCaixaDuplicado() {
  const { cash } = await services();
  const sessao = cash.getCashSessionStatus().session;
  const botao = $('[data-action="open-cash-session"]');
  return { botaoAbrirVisivel: Boolean(botao), sessaoId: sessao?.id, aberto: cash.getCashSessionStatus().open };
}

// ---------- Vitrine ----------
export async function lancarVitrine(produto, quantidade) {
  const { show } = await services();
  await ir('estoque');
  const antes = show.getShowcaseStockByProductId(produto).quantityAvailable;
  const estoque = await import(`/src/services/estoque.service.js?${V}`);
  const lancamentosAntes = estoque.getStockLaunches({ period: 'all' }).length;
  let tentativas = 0;
  while (tentativas < 3) {
    tentativas += 1;
    await sleep(400);
    const form = await waitFor(() => $('[data-stock-form]'), { label: 'formulario vitrine' });
    setValue(form.querySelector('[name="produtoId"]'), produto);
    await sleep(120);
    const form2 = $('[data-stock-form]');
    setValue(form2.querySelector('[name="quantidade"]'), String(quantidade));
    if (!form2.isConnected) continue;
    form2.requestSubmit();
    const criado = await waitFor(() => estoque.getStockLaunches({ period: 'all' }).length > lancamentosAntes, { timeout: 2500, label: 'lancamento' }).catch(() => null);
    if (criado) break;
  }
  await sleep(300);
  const depois = show.getShowcaseStockByProductId(produto).quantityAvailable;
  return { produto, quantidade, antes, depois, tentativas, ok: depois === antes + quantidade, avisos: toasts().slice(-1) };
}

async function linhaLancamento(produto, quantidade, { ativo = true } = {}) {
  const { prod } = await services();
  const nome = prod.getProductById(produto)?.name;
  return $$('[data-estoque-screen] tr').find((tr) => tr.textContent.includes(nome) && tr.textContent.includes(`${quantidade} un.`) && (!ativo || !tr.classList.contains('is-canceled')));
}

export async function editarLancamento(produto, de, para) {
  const { show } = await services();
  await ir('estoque');
  const antes = show.getShowcaseStockByProductId(produto).quantityAvailable;
  const linha = await waitFor(() => linhaLancamento(produto, de), { label: 'linha do lancamento' });
  linha.querySelector('[data-action="edit-launch"]').click();
  await sleep(250);
  const form = $('[data-stock-form]');
  setValue(form.querySelector('[name="quantidade"]'), String(para));
  form.requestSubmit();
  await sleep(1200);
  const depois = show.getShowcaseStockByProductId(produto).quantityAvailable;
  return { produto, de, para, antes, depois, ok: depois === antes + (para - de), avisos: toasts().slice(-1) };
}

export async function cancelarLancamento(produto, quantidade) {
  const { show } = await services();
  await ir('estoque');
  const antes = show.getShowcaseStockByProductId(produto).quantityAvailable;
  const linha = await waitFor(() => linhaLancamento(produto, quantidade), { label: 'linha do lancamento' });
  linha.querySelector('[data-action="cancel-launch"]').click();
  await sleep(250);
  // segundo clique confirma (o botao vira "Confirmar cancelamento")
  (await waitFor(() => linhaLancamento(produto, quantidade), { label: 'linha do lancamento' })).querySelector('[data-action="cancel-launch"]').click();
  await sleep(1200);
  const depois = show.getShowcaseStockByProductId(produto).quantityAvailable;
  return { produto, quantidade, antes, depois, ok: depois === Math.max(0, antes - quantidade), avisos: toasts().slice(-1) };
}

export async function registrarPerda(produto, quantidade, motivo) {
  const { show } = await services();
  await ir('frente-caixa');
  const antes = show.getShowcaseStockByProductId(produto).quantityAvailable;
  $('[data-action="open-write-off"]').click();
  await sleep(250);
  const form = $('[data-write-off-form]');
  if (!form) return { produto, ok: false, erro: $('.modal-backdrop.is-open')?.innerText.replace(/\s+/g, ' ') };
  const select = form.querySelector('[name="productId"]');
  if (![...select.options].some((o) => o.value === produto)) {
    await fecharModais();
    return { produto, ok: false, erro: 'produto nao listado (sem lancamento hoje)' };
  }
  setValue(select, produto);
  setValue(form.querySelector('[name="quantity"]'), String(quantidade));
  setValue(form.querySelector('[name="reason"]'), motivo === 'consumo' ? 'consumo-interno' : motivo);
  setValue(form.querySelector('[name="note"]'), 'QA perda programada');
  form.requestSubmit();
  await sleep(1200);
  const depois = show.getShowcaseStockByProductId(produto).quantityAvailable;
  const aviso = toasts().slice(-1)[0];
  await fecharModais();
  return { produto, quantidade, antes, depois, ok: depois === Math.max(0, antes - quantidade), aviso };
}

// ---------- Movimentos de caixa ----------
export async function movimentoCaixa(tipoMovimento, valorCentavos, descricao) {
  const { tx } = await services();
  await ir('frente-caixa');
  const idsAntes = new Set(tx.getTransactions().map((t) => t.id));
  $(tipoMovimento === 'entrada' ? '[data-action="open-entry"]' : '[data-action="open-output"]').click();
  const form = await waitFor(() => $('[data-cash-form]'), { label: 'modal movimento' });
  setValue(form.querySelector('[name="amount"]'), reais(valorCentavos));
  const categoria = form.querySelector('[name="category"]');
  const desejada = tipoMovimento === 'entrada' ? 'Reforco de caixa' : (tipoMovimento === 'sangria' ? 'Retirada do dono' : 'Outros');
  const opcao = [...categoria.options].find((o) => o.textContent.trim() === desejada) || categoria.options[0];
  setValue(categoria, opcao.value);
  setValue(form.querySelector('[name="description"]'), descricao);
  form.requestSubmit();
  const registrado = await waitFor(() => tx.getTransactions().find((t) => !idsAntes.has(t.id) && t.type !== 'venda'), { label: 'movimento salvo' });
  await sleep(300);
  return { tipoMovimento, valor: valorCentavos, id: registrado.id, tipoRegistrado: registrado.type, categoria: registrado.category, ok: Math.round(registrado.amount * 100) === valorCentavos };
}

// ---------- Venda ----------
async function adicionarItem(produto, quantidade, modo) {
  const card = await waitFor(() => $(`.pdv-screen [data-action="add-product"][data-product-id="${produto}"]`), { label: `cartao ${produto}` });
  if (modo === 'busca') {
    const busca = $('#product-search');
    setValue(busca, card.querySelector('.fc-card__name').textContent.trim().slice(3, 12));
    await sleep(120);
    await waitFor(() => $(`.pdv-screen [data-action="add-product"][data-product-id="${produto}"]`), { label: 'cartao filtrado' });
    for (let i = 0; i < quantidade; i += 1) { $(`.pdv-screen [data-action="add-product"][data-product-id="${produto}"]`).click(); await sleep(40); }
    setValue($('#product-search'), '');
    await sleep(80);
    return;
  }
  if (quantidade === 1 || modo === 'cliques') {
    for (let i = 0; i < quantidade; i += 1) {
      $(`.pdv-screen [data-action="add-product"][data-product-id="${produto}"]`).click();
      await sleep(40);
    }
    return;
  }
  // Toque longo / botao direito abre "Adicionar quantidade".
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  const form = await waitFor(() => $('[data-quantity-form]'), { label: 'modal quantidade' });
  setValue(form.querySelector('[name="quantity"]'), String(quantidade));
  form.requestSubmit();
  await waitFor(() => !$('[data-quantity-form]'), { label: 'fechar quantidade' });
}

function totalPainel() {
  return centavos($('.fc-order__total strong')?.textContent);
}

export async function venda(evento, opcoes = {}) {
  const { tx, prod } = await services();
  const resultado = { id: evento.id, metodo: evento.metodo, totalEsperado: evento.totalEsperado, observacoes: [] };
  await ir('frente-caixa');
  if (!$('.pdv-screen')) throw new Error('Frente de caixa nao carregou');
  if ($$('.fc-line').length) {
    resultado.observacoes.push('comanda tinha itens antes da venda (limpos)');
    $('[data-action="clear-order"]').click();
    await sleep(150);
  }
  $('[data-category-id="todos"]')?.click();
  await sleep(100);

  const modos = ['quantidade', 'cliques', 'busca'];
  evento.itens.forEach((item, indice) => { item._modo = item.quantidade === 1 ? (indice % 3 === 2 ? 'busca' : 'cliques') : modos[(indice + evento.id.length) % 3]; });
  for (const item of evento.itens) {
    await adicionarItem(item.produto, item.quantidade, item._modo);
    const { getActiveComanda } = await import(`/src/services/comanda.service.js?${V}`);
    const naComanda = getActiveComanda().items.find((i) => i.productId === item.produto)?.quantity || 0;
    if (naComanda !== item.quantidade) resultado.observacoes.push(`quantidade divergente apos adicionar ${item.produto}: ${naComanda}/${item.quantidade}`);
  }

  for (const edicao of evento.edicoes || []) {
    const primeiro = evento.itens[0].produto;
    if (edicao === 'aumentar') { $(`[data-action="increase"][data-product-id="${primeiro}"]`).click(); await sleep(80); $(`[data-action="decrease"][data-product-id="${primeiro}"]`).click(); await sleep(80); }
    if (edicao === 'diminuir') { $(`[data-action="increase"][data-product-id="${primeiro}"]`).click(); await sleep(80); $(`[data-action="decrease"][data-product-id="${primeiro}"]`).click(); await sleep(80); }
    if (edicao === 'remover-extra') {
      const extra = evento.itens.some((i) => i.produto === 'qa-agua-500ml') ? 'qa-brigadeiro' : 'qa-agua-500ml';
      $(`.pdv-screen [data-action="add-product"][data-product-id="${extra}"]`).click(); await sleep(80);
      $(`[data-action="remove"][data-product-id="${extra}"]`).click(); await sleep(80);
    }
    resultado.observacoes.push(`edicao:${edicao}`);
  }

  resultado.totalPainel = totalPainel();
  const preco = Object.fromEntries(evento.itens.map((i) => [i.produto, Math.round(prod.getProductById(i.produto).price * 100)]));
  resultado.linhasPainel = $$('.fc-line').map((l) => `${l.querySelector('.fc-line__qty').textContent}x ${l.querySelector('.fc-line__name').textContent}`);

  $('[data-action="open-payment"]').click();
  let form = await waitFor(() => $('[data-payment-form]'), { label: 'modal pagamento' });
  resultado.totalModal = centavos($('.pay__due b')?.textContent);
  if (evento.metodo !== 'dinheiro') {
    $(`[name="paymentMethod"][value="${evento.metodo}"]`).click();
    await sleep(120);
    form = $('[data-payment-form]');
  } else {
    const recebido = evento.recebido ?? evento.totalEsperado;
    if (evento.falha === 'dinheiro-insuficiente-antes') {
      setValue($('[name="receivedAmount"]'), reais(evento.totalEsperado - 50).replace('.', ','));
      await sleep(80);
      resultado.insuficiente = { botaoDesabilitado: $('[data-pay-submit]').disabled, faltam: $('.pay__change b')?.textContent };
    }
    const rapido = $$('[data-quick-cash]').find((b) => Math.round(Number(b.dataset.quickCash) * 100) === recebido);
    if (rapido && recebido !== evento.totalEsperado) {
      rapido.click();
      resultado.entradaDinheiro = 'cedula-rapida';
    } else if (recebido === evento.totalEsperado && !evento.falha) {
      $$('[data-quick-cash]')[0].click();
      resultado.entradaDinheiro = 'exato';
    } else {
      // Digita no teclado numerico da tela (reais, com virgula para centavos).
      const texto = reais(recebido).replace('.', ',').replace(/,00$/, '');
      $$('[data-keypad-key="back"]')[0].click();
      for (let i = 0; i < 12; i += 1) $('[data-keypad-key="back"]').click();
      for (const ch of texto) {
        if (ch === ',') { setValue($('[name="receivedAmount"]'), $('[name="receivedAmount"]').value + ','); continue; }
        $(`[data-keypad-key="${ch}"]`).click();
        await sleep(15);
      }
      resultado.entradaDinheiro = `teclado:${texto}`;
    }
    await sleep(100);
    resultado.recebidoTela = centavos($('[name="receivedAmount"]').value.replace('.', ','));
    resultado.trocoTela = centavos($('.pay__change b')?.textContent);
    resultado.rotuloTroco = $('.pay__change span')?.textContent;
  }

  if (opcoes.pararAntesDeFinalizar) return { ...resultado, pendente: true };

  const submit = $('[data-pay-submit]');
  if (submit.disabled) throw new Error(`${evento.id}: botao Finalizar desabilitado`);
  const idsAntes = new Set(tx.getTransactions().filter((t) => t.type === 'venda').map((t) => t.id));
  const vendasAntes = idsAntes.size;
  submit.click();
  if (evento.falha === 'duplo-clique-sintetico') submit.click();
  const sucesso = await waitFor(() => $('.sale-success-modal'), { label: 'confirmacao de venda' }).catch(() => null);
  if (!sucesso) {
    resultado.erro = toasts().slice(-1)[0] || 'sem confirmacao';
    return resultado;
  }
  resultado.comanda = Number($('.sale-success-header h2').textContent.replace(/\D/g, ''));
  resultado.totalConfirmado = centavos($('.sale-success-header strong').textContent);
  resultado.trocoConfirmado = centavos($('.sale-success-change strong')?.textContent || '0');
  const vendasDepois = tx.getTransactions().filter((t) => t.type === 'venda');
  resultado.vendasCriadas = vendasDepois.length - vendasAntes;
  const novas = vendasDepois.filter((t) => !idsAntes.has(t.id));
  const registro = novas[0];
  if (!registro) { resultado.erro = 'venda confirmada na tela mas nao encontrada no armazenamento'; return resultado; }
  resultado.saleId = registro.id;
  resultado.criadoEm = registro.createdAt;
  resultado.totalRegistro = Math.round(registro.total * 100);
  resultado.trocoRegistro = Math.round((registro.change || 0) * 100);
  resultado.recebidoRegistro = Math.round((registro.receivedAmount || 0) * 100);
  resultado.itensRegistro = registro.items.map((i) => ({ produto: i.productId, quantidade: i.quantity, unit: Math.round(i.unitPrice * 100), total: Math.round(i.total * 100) }));
  resultado.ok = resultado.totalRegistro === evento.totalEsperado
    && resultado.totalPainel === evento.totalEsperado
    && resultado.vendasCriadas === 1
    && (evento.metodo !== 'dinheiro' || resultado.trocoRegistro === (evento.recebido ?? evento.totalEsperado) - evento.totalEsperado);
  resultado.precoUnitarioUsado = preco;
  await sleep(650); // o OK ignora cliques nos primeiros 600 ms (protecao contra duplo clique)
  $('[data-action="close-sale-success"]').click();
  await sleep(150);
  return resultado;
}

// ---------- Cancelamento pelo Historico ----------
export async function cancelarVenda(saleId, motivo, periodo = 'today') {
  const { tx } = await services();
  const registro = tx.getTransactions().find((t) => t.id === saleId);
  if (!registro) return { ok: false, erro: 'venda nao encontrada' };
  await ir('dashboard');
  const periodos = { today: 'Hoje', yesterday: 'Ontem', all: 'Todo período' };
  const botaoPeriodo = $$('[data-workspace-body] button').find((b) => b.textContent.trim() === periodos[periodo]);
  botaoPeriodo?.click();
  await sleep(250);
  const botao = await waitFor(() => $(`[data-action="cancel-comanda"][data-comanda-id="${registro.comandaId}"]`), { label: 'botao cancelar comanda' });
  botao.click();
  const campo = await waitFor(() => $('[data-cancel-comanda-reason]'), { label: 'modal cancelar' });
  setValue(campo, motivo);
  $('[data-action="confirm-cancel-comanda"]').click();
  await sleep(800);
  const depois = tx.getTransactions().find((t) => t.id === saleId);
  return { saleId, comanda: registro.comandaNumber, statusDepois: depois.status, ok: depois.status === 'cancelada', aviso: toasts().slice(-1)[0] };
}

// ---------- Fechamento ----------
export async function lerTelaCaixa() {
  await ir('fechar-caixa');
  $$('[data-crm-period]').find((b) => b.dataset.crmPeriod === 'today')?.click();
  await sleep(250);
  const linhas = $$('[data-caixa-screen] .cx-close tr, [data-caixa-screen] table tr').map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return { abertura: $('.cx-open')?.textContent.trim(), linhas: linhas.slice(0, 12), kpis: $('[data-cash-strip]')?.innerText.replace(/\s+/g, ' ') };
}

export async function fecharCaixa({ dinheiro, pix, debito, credito, nota }) {
  const { closing, cash } = await services();
  const tela = await lerTelaCaixa();
  const campos = { countedCash: dinheiro, checkedPix: pix, checkedDebit: debito, checkedCredit: credito };
  for (const [nome, valor] of Object.entries(campos)) {
    const input = $(`[data-crm-closing-input="${nome}"]`);
    setValue(input, reais(valor));
    await sleep(60);
  }
  setValue($('[data-crm-closing-input="note"]'), nota);
  await sleep(150);
  const telaAntes = {
    diferencaGeral: $('[data-crm-closing-difference]')?.textContent.trim(),
    diferencaDinheiro: $('[data-crm-row-difference="cash"]')?.textContent.trim()
  };
  const idsAntes = new Set(closing.getCashClosings().map((c) => c.id));
  $('[data-action="confirm-crm-closing"]').click();
  await sleep(1200);
  const salvo = closing.getCashClosings().find((c) => !idsAntes.has(c.id)) || null;
  return {
    tela, telaAntes,
    ok: Boolean(salvo),
    aviso: toasts().slice(-1)[0],
    caixaDepois: cash.getCashSessionStatus().label,
    fechamento: salvo && {
      id: salvo.id,
      totals: Object.fromEntries(Object.entries(salvo.totals).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) : v])),
      differences: salvo.differences
    }
  };
}

// ---------- Fotografia do estado ----------
export async function fotografia(produtos) {
  const { show, tx, cash, fin, showSync, resumo } = await services();
  return {
    em: new Date().toISOString(),
    vitrine: Object.fromEntries(produtos.map((p) => [p, show.getShowcaseStockByProductId(p).quantityAvailable])),
    caixa: cash.getCashSessionStatus(),
    filaFinanceira: fin.getFinancialSyncStatus(),
    filaVitrine: showSync.getShowcaseSyncStatus(),
    resumoHoje: resumo.getDashboardResumo({ period: 'today' }),
    ultimaComanda: tx.getClosedComandas()[0]?.number
  };
}

// ---------- Execucao de um dia ----------
export function iniciarDia(manifesto, numeroDia, { de = 0, ate = Infinity, parte = 'a' } = {}) {
  const run = window.__QA_RUN__ = { dia: numeroDia, parte, status: 'rodando', feitos: 0, resultados: [], erros: [] };
  run.promessa = executarDia(manifesto, numeroDia, run, de, ate).then(() => { run.status = 'concluido'; }).catch((error) => { run.status = 'falhou'; run.erros.push(String(error?.stack || error)); }).finally(salvar);
  async function salvar() {
    await fetch(`/__qa/save?file=dados/${manifesto.execucao}/dia-${numeroDia}-${parte}.json`, { method: 'POST', body: JSON.stringify({ dia: numeroDia, parte, status: run.status, erros: run.erros, resultados: run.resultados }, null, 1) });
  }
  return 'iniciado';
}

async function executarDia(manifesto, numeroDia, run, de, ate) {
  const dia = manifesto.dias.find((d) => d.dia === numeroDia);
  const produtos = Object.keys(manifesto.catalogo);
  const extras = window.__QA_EXTRAS__ = window.__QA_EXTRAS__ || JSON.parse(localStorage.getItem('qa.extras') || '{}');
  for (let indice = de; indice < Math.min(dia.eventos.length, ate); indice += 1) {
    const evento = dia.eventos[indice];
    const seg = (indice * 7) % 60;
    relogio(dia.data, evento.hora, seg);
    const registro = { indice, tipo: evento.tipo, id: evento.id, hora: evento.hora };
    try {
      switch (evento.tipo) {
        case 'abrir-caixa':
          registro.inicio = await fotografia(produtos);
          registro.resultado = await abrirCaixa(evento.fundo);
          break;
        case 'abrir-caixa-duplicado':
          registro.resultado = await abrirCaixaDuplicado();
          break;
        case 'lancar-vitrine':
          registro.resultado = await lancarVitrine(evento.produto, evento.quantidade);
          if (evento.cancelar) registro.cancelamento = await cancelarLancamento(evento.produto, evento.quantidade);
          break;
        case 'editar-lancamento':
          registro.resultado = await editarLancamento(evento.produto, evento.de, evento.para);
          break;
        case 'venda':
        case 'venda-extra':
          if (['sem-conexao', 'recarregar-no-pagamento', 'duplo-clique', 'disputa'].includes(evento.falha)) {
            registro.resultado = { manual: true, motivo: `cenario ${evento.falha} executado manualmente` };
            run.pendentesManuais = [...(run.pendentesManuais || []), indice];
            break;
          }
          registro.resultado = await venda(evento);
          if (evento.tipo === 'venda-extra') { extras[evento.id] = registro.resultado.saleId; localStorage.setItem('qa.extras', JSON.stringify(extras)); }
          break;
        case 'cancelar': {
          const saleId = extras[evento.id];
          const periodo = saleId && new Date((await services()).tx.getTransactions().find((t) => t.id === saleId)?.createdAt).toDateString() === new Date().toDateString() ? 'today' : 'all';
          registro.resultado = await cancelarVenda(saleId, `QA cancelamento ${evento.id}`, periodo);
          break;
        }
        case 'movimento':
          registro.resultado = await movimentoCaixa(evento.tipoMovimento, evento.valor, evento.descricao);
          break;
        case 'perda':
          registro.resultado = await registrarPerda(evento.produto, evento.quantidade, evento.motivo);
          break;
        case 'carrinho-abandonado': {
          await ir('frente-caixa');
          for (const item of evento.itens) await adicionarItem(item.produto, item.quantidade, 'cliques');
          const linhas = $$('.fc-line').length;
          $('[data-action="clear-order"]').click();
          await sleep(150);
          registro.resultado = { linhasAntes: linhas, linhasDepois: $$('.fc-line').length, ok: $$('.fc-line').length === 0 };
          break;
        }
        case 'fechar-caixa': {
          if (run.erros.length) { registro.resultado = { adiado: true, motivo: 'fechamento nao executado: houve erros no dia' }; break; }
          const ref = manifesto.referencia.dias.find((d) => d.dia === numeroDia);
          registro.fim = await fotografia(produtos);
          registro.resultado = await fecharCaixa({
            dinheiro: ref.dinheiroContado,
            pix: ref.eletronicoLiquido.pix,
            debito: ref.eletronicoLiquido.debito,
            credito: ref.eletronicoLiquido.credito,
            nota: `QA ${manifesto.execucao} fechamento dia ${numeroDia}${evento.divergenciaDinheiro ? ' (contagem divergente proposital)' : ''}`
          });
          break;
        }
        default:
          registro.resultado = { manual: true, motivo: `evento ${evento.tipo} executado manualmente` };
          run.pendentesManuais = [...(run.pendentesManuais || []), indice];
      }
    } catch (error) {
      registro.erro = String(error?.message || error);
      run.erros.push(`${indice} ${evento.tipo} ${evento.id || ''}: ${registro.erro}`);
      await fecharModais().catch(() => {});
    }
    run.resultados.push(registro);
    run.feitos += 1;
    run.ultimo = `${indice} ${evento.tipo} ${evento.id || ''}`;
  }
}

// ---------- Fotografia do servidor (somente leitura) ----------
export async function snapshotServidor(execucao, dia, data) {
  const { getSupabaseClient } = await import(`/src/services/supabase-client.service.js?${V}`);
  const c = await getSupabaseClient();
  await c.auth.refreshSession();
  const next = new Date(`${data}T12:00:00`);
  next.setDate(next.getDate() + 1);
  const d2 = next.toISOString().slice(0, 10);
  const range = (q) => q.gte('created_at', `${data}T00:00:00-03:00`).lt('created_at', `${d2}T00:00:00-03:00`);
  const [sales, items, movs, fin, cls, ps, sm, oos] = await Promise.all([
    range(c.from('sales').select('*')),
    c.from('sale_items').select('*').like('product_id', 'qa-%'),
    range(c.from('cash_movements').select('*')),
    range(c.from('financial_transactions').select('*')),
    range(c.from('cash_closings').select('*')),
    c.from('product_stock').select('product_id,quantity_available').like('product_id', 'qa-%'),
    range(c.from('showcase_movements').select('*').like('product_id', 'qa-%')),
    range(c.from('out_of_stock_sales').select('*').like('product_id', 'qa-%'))
  ]);
  const saleIds = new Set((sales.data || []).map((s) => s.id));
  const snap = {
    dia, data, em: new Date().toISOString(),
    sales: sales.data, saleItems: (items.data || []).filter((i) => saleIds.has(i.sale_id)),
    cashMovements: movs.data, financial: fin.data, closings: cls.data, productStock: ps.data,
    showcaseMovements: sm.data, outOfStock: oos.data,
    erros: [sales, items, movs, fin, cls, ps, sm, oos].map((r) => r.error?.message).filter(Boolean)
  };
  await fetch(`/__qa/save?file=dados/${execucao}/servidor-dia-${dia}.json`, { method: 'POST', body: JSON.stringify(snap, null, 1) });
  return { vendas: snap.sales.length, itens: snap.saleItems.length, movs: snap.cashMovements.length, fechamentos: snap.closings.length, erros: snap.erros };
}

export async function carregar(execucao = 'R1') {
  const arquivo = execucao === 'R1' ? 'cenarios-semana.json' : `cenarios-semana-${execucao}.json`;
  const manifesto = await (await fetch(`/qa-pdv/${arquivo}?t=${Date.now()}`)).json();
  window.__QA_M__ = manifesto;
  return manifesto;
}

// ---------- Resumo do dia contra a referencia ----------
export async function resumoDia(manifesto, numeroDia, resultados) {
  const ref = manifesto.referencia.dias[numeroDia - 1];
  const R = resultados || window.__QA_RUN__.resultados;
  const abertura = R.find((r) => r.tipo === 'abrir-caixa');
  const fim = R.find((r) => r.tipo === 'fechar-caixa');
  const vendas = R.filter((r) => r.tipo === 'venda' || r.tipo === 'venda-extra');
  const S = await services();
  const resumo = {
    dia: numeroDia,
    vendasOk: vendas.filter((r) => r.resultado?.ok).length,
    vendasFalhas: vendas.filter((r) => r.resultado && !r.resultado.ok && !r.resultado.manual).map((r) => `${r.id}: ${r.resultado.erro || JSON.stringify(r.resultado).slice(0, 160)}`),
    observacoes: vendas.filter((r) => r.resultado?.observacoes?.length).map((r) => `${r.id}: ${r.resultado.observacoes}`),
    outrosFalhos: R.filter((r) => !['venda', 'venda-extra', 'fechar-caixa', 'abrir-caixa', 'abrir-caixa-duplicado'].includes(r.tipo) && r.resultado && r.resultado.ok === false).map((r) => `${r.tipo} ${r.id || ''}: ${JSON.stringify(r.resultado).slice(0, 200)}`),
    vitrineInicioDif: abertura?.inicio ? Object.keys(abertura.inicio.vitrine).filter((k) => abertura.inicio.vitrine[k] !== (ref.vitrineInicio[k] ?? 0)).map((k) => `${k} obs=${abertura.inicio.vitrine[k]} ref=${ref.vitrineInicio[k] ?? 0}`) : 'sem abertura neste trecho',
    vitrineFimDif: fim?.fim ? Object.keys(fim.fim.vitrine).filter((k) => fim.fim.vitrine[k] !== (ref.vitrineFim[k] ?? 0)).map((k) => `${k} obs=${fim.fim.vitrine[k]} ref=${ref.vitrineFim[k] ?? 0}`) : 'sem fechamento neste trecho',
    referencia: { fisico: ref.dinheiroFisicoEsperado, contado: ref.dinheiroContado, sistemaSemFundo: ref.regraAtualDoSistema.dinheiroEsperadoSemFundo, eletronico: ref.eletronicoLiquido },
    fechamento: fim?.resultado?.fechamento?.totals || fim?.resultado,
    telaAntes: fim?.resultado?.telaAntes,
    filas: [S.fin.getFinancialSyncStatus(), S.showSync.getShowcaseSyncStatus()]
  };
  return resumo;
}
