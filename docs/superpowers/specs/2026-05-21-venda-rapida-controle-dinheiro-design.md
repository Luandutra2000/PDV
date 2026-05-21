# Venda Rapida e Controle do Dinheiro - Design

## Objetivo

Melhorar a velocidade de venda no balcao e deixar a conferencia do dinheiro mais clara para o dono da lanchonete, sem alterar a estrutura atual da comanda.

A etapa deve responder duas necessidades:

- O operador consegue achar, adicionar e receber produtos com menos cliques?
- O dono consegue entender rapidamente quanto vendeu, quanto entrou em dinheiro, Pix/cartao, quais foram as entradas/saidas e se o caixa bateu?

## Decisao de Escopo

O caminho escolhido e enxuto. A comanda atual continua sendo a base do pedido e nao tera mudanca estrutural nesta etapa.

Entram nesta etapa:

- Acesso rapido na Frente de Caixa.
- Produtos favoritos e/ou mais vendidos em destaque.
- Busca melhor por nome, categoria e apelidos.
- Filtros uteis para `Todos`, `Mais vendidos` e `Favoritos`.
- Acoes rapidas nos cards para adicionar quantidade.
- Modal de pagamento mais direto.
- Resumo financeiro diario mais claro.
- Conferencia de dinheiro com explicacao do calculo.
- Separacao visual de dinheiro, Pix, debito e credito.
- Testes focados nos calculos de resumo financeiro e dados de venda rapida.

Ficam fora desta etapa:

- Alterar a estrutura da comanda.
- Abrir caixa por operador ou turno.
- Permissoes por usuario.
- Impressao/exportacao de relatorios.
- Integracao real com banco/API.
- Controle avancado de combos com estoque composto.
- Tela separada de relatorio financeiro fora do Dashboard/Fechar Caixa.

## Experiencia de Uso

### Frente de Caixa

A tela `Frente de Caixa` mantem a composicao atual:

- Area central com produtos.
- Busca e filtros.
- Painel lateral de comanda.
- Modal de pagamento.

A melhoria aparece antes da grade de produtos, em uma faixa de `Acesso Rapido`.

Essa faixa deve mostrar ate tres grupos, conforme existirem dados:

- `Mais vendidos`: produtos ordenados por quantidade vendida no periodo recente ou no dia.
- `Favoritos`: produtos marcados manualmente para aparecerem sempre.
- `Recentes`: produtos vendidos ou adicionados recentemente, se essa informacao estiver disponivel sem complexidade extra.

O objetivo da faixa e reduzir o tempo para vender itens comuns, como salgados e bebidas de maior giro.

### Busca e filtros

A busca deve procurar por:

- Nome do produto.
- Nome da categoria.
- Apelidos cadastrados no produto.

Exemplo:

```text
"cox" encontra "Coxinha"
"refri" encontra "Refrigerante lata"
"salgado" encontra produtos da categoria Salgados
```

Os filtros devem priorizar:

- `Todos`
- `Mais vendidos`
- `Favoritos`
- Categorias existentes

Quando nao houver favoritos ou historico suficiente de vendas, os filtros especiais aparecem vazios de forma segura ou ficam ocultos, seguindo o padrao mais simples da implementacao.

### Cards de produto

O toque principal no card continua adicionando 1 unidade a comanda.

Cada card pode ganhar acoes compactas para quantidade:

- `+2`
- `+5`
- Quantidade manual

A quantidade manual deve abrir um controle simples para informar uma quantidade positiva. Ao confirmar, o sistema adiciona aquela quantidade do produto a comanda.

Essas acoes nao mudam o painel da comanda. Elas apenas aceleram a entrada de itens repetidos.

### Pagamento rapido

O botao de receber continua vindo da comanda atual.

O modal de pagamento deve ficar mais direto:

- Formas de pagamento em botoes grandes: Dinheiro, Pix, Debito, Credito.
- Dinheiro mostra o campo `Valor recebido` e o troco.
- Pix, debito e credito podem finalizar com um clique apos selecionados.
- O total da comanda fica sempre visivel.

Nao entra nesta etapa pagamento misto. Essa funcionalidade e util, mas deve ficar para uma etapa posterior porque altera a modelagem de pagamento da venda.

## Controle do Dinheiro

### Dashboard / Historico de Transacoes

O Dashboard atual pode continuar concentrando o historico de transacoes, mas o topo deve se tornar mais claro para conferencia diaria.

O resumo do dia deve mostrar:

- Total vendido.
- Dinheiro esperado.
- Pix.
- Debito.
- Credito.
- Entradas.
- Saidas.
- Comandas canceladas.
- Saldo liquido do dia.

A formula principal do dinheiro esperado e:

```text
dinheiro esperado = vendas em dinheiro + entradas - saidas
```

O saldo liquido do dia deve considerar vendas validas, entradas e saidas, sem somar vendas canceladas.

### Lista de movimentacoes

A lista de movimentacoes deve ficar mais facil de conferir separando ou destacando:

- Vendas.
- Entradas.
- Saidas.
- Cancelamentos.

Cada item deve mostrar:

- Horario.
- Tipo.
- Valor.
- Forma de pagamento, quando houver.
- Status.
- Descricao ou numero da comanda.

Cancelamentos permanecem visiveis no historico, mas nao entram nos totais ativos.

### Fechar Caixa

A tela `Fechar Caixa` ja possui conferencia guiada. Nesta etapa, o foco e clareza do relatorio.

Antes da confirmacao, a tela deve mostrar uma area de `Conferencia do dinheiro` com:

- Vendas em dinheiro.
- Entradas.
- Saidas.
- Dinheiro esperado.
- Dinheiro contado.
- Diferenca.
- Texto curto explicando a formula.

Pix, debito e credito aparecem em blocos separados, com:

- Valor esperado.
- Valor conferido, quando informado.
- Diferenca.
- Status: `conferido` ou `nao conferido`.

O objetivo e deixar evidente de onde veio cada numero, sem exigir abertura de caixa por turno nesta etapa.

## Arquitetura

### Frente de Caixa

`src/modules/vendas/vendas.module.js` continua responsavel pela tela.

Possiveis responsabilidades novas:

- Renderizar faixa de acesso rapido.
- Renderizar filtros especiais.
- Tratar acoes de quantidade rapida.
- Usar busca ampliada.
- Abrir controle de quantidade manual.
- Renderizar modal de pagamento simplificado.

### Produtos

`src/services/product.service.js` deve concentrar a busca ampliada.

Possiveis campos novos em produto:

```js
{
  aliases: ['cox', 'salgado'],
  favorite: true
}
```

Os campos devem ser opcionais para nao quebrar produtos antigos.

### Vendas e transacoes

`src/services/transaction.service.js` deve concentrar calculos de resumo financeiro.

Possiveis funcoes novas ou evoluidas:

- `getSalesRanking(options)`
- `getDailyMoneySummary(options)`
- `getPaymentMethodTotals(options)`
- `getActiveTransactions(options)`

Essas funcoes devem ignorar comandas e transacoes canceladas nos totais ativos.

### Fechamento de caixa

`src/services/cash-closing.service.js` ja concentra a logica de fechamento.

Nesta etapa, ele deve apenas expor ou organizar dados para a UI mostrar a conferencia com mais clareza. Regras de fechamento ja existentes devem ser preservadas.

## Persistencia

Nao e obrigatorio criar uma nova camada de persistencia.

Campos opcionais podem ser adicionados aos produtos mockados ou salvos:

```js
{
  favorite: true,
  aliases: ['cox', 'refri']
}
```

Se favoritos forem editaveis pela interface nesta etapa, eles devem ser persistidos junto aos produtos ou em uma chave simples dedicada. Se nao forem editaveis ainda, podem iniciar como dados mockados.

Ranking de mais vendidos deve ser calculado a partir das comandas finalizadas e transacoes existentes, sem duplicar historico.

## Tratamento de Erros

- Produto sem `aliases`: buscar apenas por nome e categoria.
- Produto sem historico de venda: nao aparece em `Mais vendidos`.
- Nenhum favorito cadastrado: ocultar o grupo ou mostrar estado vazio discreto.
- Quantidade rapida menor ou igual a zero: bloquear.
- Quantidade manual invalida: nao adicionar item e mostrar aviso.
- Comanda vazia no pagamento: bloquear finalizacao.
- Total financeiro sem transacoes: mostrar zeros, sem quebrar a tela.
- Transacoes antigas sem forma de pagamento: agrupar como `nao informado` ou ignorar em totais por forma, conforme regra atual do service.

## Testes e Verificacao

Adicionar ou ajustar testes de services para:

- Busca por nome.
- Busca por categoria.
- Busca por apelidos.
- Ranking de mais vendidos ignorando vendas canceladas.
- Calculo de dinheiro esperado com vendas em dinheiro, entradas e saidas.
- Totais por Pix, debito e credito.
- Saldo liquido do dia sem comandas canceladas.
- Quantidade rapida adicionando a quantidade correta a comanda.

Verificacao manual:

- Abrir a Frente de Caixa.
- Confirmar que acesso rapido aparece quando houver favoritos ou vendas.
- Buscar produto por nome, categoria e apelido.
- Adicionar produto com toque normal.
- Adicionar produto com quantidade rapida.
- Finalizar venda em dinheiro e conferir troco.
- Finalizar venda em Pix/cartao com menos passos.
- Abrir Dashboard e conferir resumo financeiro.
- Cancelar comanda e confirmar que ela nao entra nos totais ativos.
- Abrir Fechar Caixa e conferir explicacao do dinheiro esperado.

## Criterios de Aceite

- A comanda continua funcionando como antes.
- A Frente de Caixa permite vender itens comuns mais rapido.
- A busca encontra produtos por nome, categoria e apelido.
- Produtos favoritos ou mais vendidos aparecem em destaque.
- Quantidades repetidas podem ser adicionadas sem varios cliques no mesmo card.
- O pagamento fica mais direto, sem esconder total e troco.
- O Dashboard mostra resumo financeiro diario claro.
- Dinheiro esperado mostra a formula usada.
- Pix, debito e credito aparecem separados.
- Cancelamentos nao entram nos totais ativos.
- Testes de busca, ranking e resumo financeiro passam.
