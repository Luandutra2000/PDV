# Fechamento de Caixa Guiado - Design

## Objetivo

Desenvolver o fechamento de caixa do PDV como uma conferencia guiada do dia, cruzando vendas, formas de pagamento, entradas, saidas, vitrine de salgados, perdas/consumos e sobras reais.

O fechamento deve ajudar o operador a responder tres perguntas:

- O dinheiro e os pagamentos bateram com o que foi vendido?
- A producao da vitrine bateu com o que foi vendido, baixado e sobrou?
- O que ficou diferente foi explicado com motivo?

O sistema nao deve bloquear novas vendas apos o fechamento. Vendas feitas depois de um fechamento confirmado devem ficar identificadas como vendas apos fechamento, para nao alterar o fechamento ja salvo.

## Escopo

Entram nesta etapa:

- Tela funcional de `Fechar Caixa`.
- Fluxo guiado de fechamento atual.
- Historico de fechamentos.
- Conferencia por forma de pagamento e total geral.
- Dinheiro contado manualmente.
- Conferencia opcional de Pix, debito e credito.
- Conferencia da vitrine do dia por produto.
- Substituir o botao `Novo Item Avulso` por `Perda / Consumo` na Frente de Caixa.
- Registrar baixas justificadas apenas para produtos lancados na vitrine do dia.
- Calcular valor estimado de perdas, consumo interno e outras baixas.
- Exigir motivo para baixas e divergencias.
- Persistencia local em `localStorage`.
- Testes focados nos calculos e registros principais.

Ficam fora desta etapa:

- Cadastro de funcionarios para consumo interno.
- Impressao ou exportacao de relatorio.
- Reabertura/edicao de fechamento antigo.
- Permissoes por usuario.
- Tutorial completo da aba Ajuda/Suporte.
- Integracao real com banco/API.

## Experiencia de Uso

### Fechamento atual

A rota/menu `Fechar Caixa` deixa de mostrar placeholder e passa a abrir uma tela no mesmo visual do sistema atual, com sidebar, topbar, cards, paineis e tabelas.

A tela tera duas abas internas:

- `Fechamento atual`
- `Historico`

O fechamento atual sera guiado por etapas:

1. `Resumo do dia`
2. `Pagamentos`
3. `Vitrine / salgados`
4. `Divergencias`
5. `Confirmar fechamento`

### Etapa 1: Resumo do dia

Mostra uma visao consolidada antes da conferencia:

- Total vendido.
- Vendas em dinheiro, Pix, debito e credito.
- Entradas de caixa.
- Saidas de caixa.
- Saldo esperado do dinheiro.
- Quantidade de comandas finalizadas.
- Produtos produzidos na vitrine.
- Produtos vendidos da vitrine.
- Produtos baixados por perda/consumo.
- Sobra prevista da vitrine.
- Alertas de possiveis divergencias.

### Etapa 2: Pagamentos

Mostra valores esperados por forma de pagamento:

- Dinheiro.
- Pix.
- Debito.
- Credito.
- Total geral.

O campo `dinheiro contado` e obrigatorio. Pix, debito e credito mostram o valor esperado e permitem preencher um valor conferido opcionalmente. Se nao forem preenchidos, ficam marcados como `nao conferido`, mas o fechamento pode continuar.

O sistema calcula:

```text
diferenca dinheiro = dinheiro contado - dinheiro esperado
diferenca pix = pix conferido - pix esperado, quando preenchido
diferenca debito = debito conferido - debito esperado, quando preenchido
diferenca credito = credito conferido - credito esperado, quando preenchido
diferenca geral = soma dos valores conferidos/contados - total esperado comparavel
```

Quando Pix, debito ou credito nao forem conferidos, eles entram no total geral pelo valor esperado do sistema.

### Etapa 3: Vitrine / salgados

Lista apenas produtos com lancamento de vitrine no periodo do fechamento.

Para cada produto, mostra:

- Produto.
- Categoria.
- Quantidade produzida/lancada na vitrine.
- Quantidade vendida em comandas.
- Quantidade baixada com justificativa.
- Valor estimado das baixas.
- Sobra esperada.
- Campo para informar sobra contada.
- Diferenca em quantidade.
- Diferenca estimada em reais.

A formula principal e:

```text
sobra esperada = produzido - vendido - baixas justificadas
diferenca = sobra esperada - sobra contada
```

Exemplo:

```text
produzido 40 - vendido 31 - perda/consumo 1 - sobra contada 8 = diferenca 0
```

### Etapa 4: Divergencias

Mostra tudo que nao bateu:

- Diferencas de dinheiro.
- Diferencas opcionais de Pix/cartao, quando conferidos.
- Diferencas de vitrine/salgados.
- Produtos com sobra contada diferente da sobra esperada.

Toda diferenca deve ter motivo obrigatorio antes de confirmar.

Motivos iniciais:

- Perda/quebra.
- Consumo interno.
- Cortesia.
- Vencido.
- Erro de lancamento.
- Erro de caixa.
- Outro.

Quando o motivo for `Outro`, o campo de observacao passa a ser obrigatorio.

### Etapa 5: Confirmar fechamento

Mostra um resumo final:

- Total vendido.
- Total esperado por forma de pagamento.
- Valores contados/conferidos.
- Diferencas do caixa.
- Total produzido na vitrine.
- Total vendido da vitrine.
- Total baixado.
- Total de sobra contada.
- Divergencias justificadas.

Ao confirmar, o sistema salva um registro imutavel de fechamento com data/hora.

Novas vendas depois desse horario continuam permitidas. Elas devem aparecer em uma area do historico como `vendas apos fechamento` quando forem posteriores ao fechamento confirmado.

## Perda / Consumo na Frente de Caixa

O botao `Novo Item Avulso` da Frente de Caixa sera substituido por `Perda / Consumo`.

Ao clicar, abre um modal com:

- Produto.
- Quantidade.
- Motivo obrigatorio.
- Observacao opcional.
- Valor estimado automatico.

O campo de produto deve listar apenas produtos que tiveram lancamento de vitrine no dia atual. Isso evita baixar produto que nao foi produzido ou enviado para a vitrine naquele dia.

Motivos de baixa:

- Quebra.
- Consumo interno.
- Cortesia.
- Vencido.
- Erro de lancamento.
- Outro.

O registro da baixa:

- Nao entra como venda.
- Nao soma dinheiro no caixa.
- Nao finaliza comanda.
- Entra na conferencia da vitrine.
- Reduz a sobra esperada do produto.
- Guarda valor estimado pelo preco do produto no momento da baixa.

Nesta etapa, consumo interno nao precisa registrar quem consumiu.

## Historico de Caixa

A aba `Historico` mostra os fechamentos ja confirmados.

Cada registro deve exibir:

- Data e hora.
- Status.
- Total vendido.
- Diferenca de caixa.
- Diferenca de vitrine.
- Quantidade de comandas.
- Indicio de vendas apos fechamento.

Ao abrir um registro, o sistema mostra os detalhes:

- Valores esperados por forma de pagamento.
- Valores contados/conferidos.
- Diferencas por forma.
- Produtos da vitrine com produzido, vendido, baixado, sobra contada e diferenca.
- Motivos e observacoes das baixas.
- Motivos e observacoes das divergencias.
- Vendas feitas depois do fechamento, quando houver.

Por enquanto, fechamentos antigos sao apenas consultados. Edicao, reabertura e cancelamento ficam fora desta etapa.

## Ajuda/Suporte Futuro

O menu `Suporte` podera virar uma area de ajuda com tutoriais por aba:

- Frente de Caixa.
- Produtos.
- Estoque.
- Perda / Consumo.
- Fechar Caixa.
- Historico.
- Dashboard.

Nesta etapa, a ajuda completa nao sera implementada. O design apenas deixa previsto que a tela de fechamento pode ter futuramente um link discreto para o tutorial da propria aba.

## Arquitetura

### Modulo de fechamento

`src/modules/caixa/caixa.module.js` deixa de ser placeholder e passa a renderizar:

- Abas `Fechamento atual` e `Historico`.
- Etapas do fechamento atual.
- Formularios de conferencia.
- Lista de historico.
- Detalhe de fechamento antigo.

O app ja possui rota `fechar-caixa` na sidebar, mas ela ainda cai no placeholder porque nao esta mapeada em `src/app.js`. Esta rota deve passar a chamar `initCaixaModule`.

### Servico de fechamento

Criar `src/services/cash-closing.service.js` para concentrar regras de fechamento:

- `getCurrentClosingDraft()`
- `buildClosingSummary()`
- `buildPaymentConference()`
- `buildShowcaseConference()`
- `saveClosingDraft(draft)`
- `confirmClosing(draft)`
- `getCashClosings()`
- `getCashClosingById(closingId)`
- `getSalesAfterClosing(closing)`

O servico deve consumir dados dos services existentes:

- `transaction.service.js` para vendas, entradas, saidas e comandas fechadas.
- `estoque.service.js` para producao/vitrine.
- `product.service.js` para dados de produtos e precos.
- `storage.service.js` para persistencia.

### Baixas justificadas de vitrine

O controle de perda/consumo pertence ao dominio de estoque/vitrine.

Adicionar ao estoque:

- Registro de baixas justificadas.
- Consulta de produtos disponiveis para baixa no dia.
- Calculo de baixas por produto e periodo.

Funcoes esperadas em `estoque.service.js` ou servico dedicado:

- `getTodayShowcaseProducts()`
- `createShowcaseWriteOff({ productId, quantity, reason, note })`
- `getShowcaseWriteOffs(filters)`
- `getShowcaseWriteOffSummary(filters)`

Se a baixa for de produto sem lancamento de vitrine no dia, o service deve rejeitar a operacao.

### Persistencia

Adicionar chaves em `src/database/schema.js`:

```js
cashClosings: 'pdv.cashClosings'
cashClosingDraft: 'pdv.cashClosingDraft'
showcaseWriteOffs: 'pdv.showcaseWriteOffs'
```

Estrutura sugerida para fechamento:

```js
{
  id,
  status: 'fechado',
  openedAt,
  closedAt,
  totals: {
    sales,
    entries,
    outputs,
    expectedCash,
    countedCash,
    cashDifference,
    expectedPix,
    checkedPix,
    expectedDebit,
    checkedDebit,
    expectedCredit,
    checkedCredit,
    generalDifference
  },
  showcase: [
    {
      productId,
      productName,
      categoryId,
      producedQuantity,
      soldQuantity,
      writeOffQuantity,
      countedLeftoverQuantity,
      differenceQuantity,
      estimatedDifferenceValue
    }
  ],
  differences: [
    {
      scope: 'payment' | 'showcase',
      referenceId,
      reason,
      note,
      quantity,
      amount
    }
  ],
  createdAt,
  updatedAt
}
```

Estrutura sugerida para baixa:

```js
{
  id,
  productId,
  productName,
  categoryId,
  quantity,
  unitValue,
  totalValue,
  reason,
  note,
  createdAt,
  status: 'ativa'
}
```

## Regras de Calculo

### Pagamentos

Vendas canceladas nao entram no fechamento.

Vendas posteriores a um fechamento confirmado nao alteram esse fechamento. Elas aparecem como vendas apos fechamento no historico.

Entradas e saidas devem ser consideradas no dinheiro esperado quando forem movimentos de caixa:

```text
dinheiro esperado = vendas em dinheiro + entradas - saidas
```

Pix, debito e credito sao calculados pelas vendas finalizadas nessas formas.

### Vitrine

Produtos cancelados no estoque/vitrine nao entram como producao ativa.

Baixas justificadas canceladas nao entram no calculo.

Vendas canceladas nao entram como vendido.

O valor estimado da baixa usa o preco salvo na baixa. Se o preco do produto mudar depois, o historico da baixa nao muda.

## Tratamento de Erros

- Sem lancamento de vitrine no dia: o modal `Perda / Consumo` mostra estado vazio e orienta lancar estoque primeiro.
- Quantidade de baixa menor ou igual a zero: bloquear salvamento.
- Quantidade de baixa maior que a sobra esperada atual: bloquear para evitar baixa maior que a vitrine disponivel.
- Dinheiro contado vazio no fechamento: bloquear confirmacao.
- Diferenca sem motivo: bloquear confirmacao.
- Motivo `Outro` sem observacao: bloquear confirmacao.
- Dados antigos ausentes no `localStorage`: usar listas vazias e continuar a tela sem quebrar.

## Testes e Verificacao

Adicionar testes de services para:

- Calcular dinheiro esperado com vendas, entradas e saidas.
- Calcular diferenca de dinheiro contado.
- Tratar Pix/cartao nao conferidos como valor esperado no total geral.
- Calcular vitrine por produto: produzido, vendido, baixado, sobra esperada, sobra contada e diferenca.
- Registrar baixa apenas para produto com vitrine no dia.
- Bloquear baixa com quantidade invalida.
- Salvar fechamento confirmado no historico.
- Separar vendas feitas apos fechamento.

Verificacao manual:

- Lancar vitrine de alguns salgados.
- Finalizar vendas em dinheiro, Pix e cartao.
- Registrar perda/consumo na Frente de Caixa.
- Abrir Fechar Caixa.
- Informar dinheiro contado.
- Conferir ou ignorar Pix/cartao.
- Informar sobras contadas da vitrine.
- Confirmar motivos de divergencia.
- Salvar fechamento.
- Fazer nova venda depois do fechamento.
- Abrir Historico e confirmar que o fechamento salvo nao mudou e que a venda posterior aparece separada.

## Criterios de Aceite

- O menu `Fechar Caixa` abre uma tela real, nao placeholder.
- O fechamento mostra resumo, pagamentos, vitrine, divergencias e confirmacao.
- Dinheiro contado e obrigatorio.
- Pix, debito e credito podem ser conferidos opcionalmente.
- O fechamento calcula valores separados por forma de pagamento e total geral.
- A Frente de Caixa troca `Novo Item Avulso` por `Perda / Consumo`.
- Perda/consumo permite baixar apenas produtos lancados na vitrine do dia.
- Baixas mostram quantidade e valor estimado.
- A vitrine calcula produzido, vendido, baixado, sobra contada e diferenca.
- Divergencias exigem motivo antes de confirmar.
- O fechamento confirmado fica salvo no historico.
- Vendas apos fechamento continuam permitidas e aparecem separadas no historico.
- Testes de calculo e persistencia dos services passam.
