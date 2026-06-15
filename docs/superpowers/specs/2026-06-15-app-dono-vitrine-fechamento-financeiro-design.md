# APP do Dono: Vitrine, Fechamento e Financeiro

## Objetivo

Melhorar exclusivamente o APP/PWA usado pelo dono para acompanhamento remoto, adicionando visoes e acoes operacionais que hoje existem parcialmente no sistema web.

As alteracoes nao devem modificar a interface web, telas desktop ou areas do APP que nao foram solicitadas.

## Escopo

Entram no escopo:

- Aba Vitrine do APP com cards novos e comparativo completo Producao x Vendas.
- Exibicao de lancamentos cancelados da vitrine no APP.
- Tela de Fechamento de Caixa dentro do APP.
- Historico de Fechamentos melhorado no APP.
- Nova aba Financeiro no APP, com visao e acoes equivalentes ao Financeiro web.

Ficam fora do escopo:

- Alterar Frente de Caixa web.
- Alterar Vitrine/Estoque web.
- Alterar Fechamento web.
- Alterar Dashboard web.
- Redesenhar telas existentes do APP que nao estejam ligadas diretamente a estas correcoes.
- Mudar layout desktop.
- Criar comportamento local offline para novos registros do APP.

## Decisoes Aprovadas

- Os campos Pix contado e Cartao contado no fechamento do APP devem vir preenchidos automaticamente com os valores esperados.
- Dinheiro contado tambem pode vir preenchido com o valor esperado, permanecendo editavel.
- Status de fechamento:
  - Conferido: diferenca total igual a R$ 0,00.
  - Pequena diferenca: diferenca total maior que R$ 0,00 e ate R$ 5,00.
  - Grande diferenca: diferenca total acima de R$ 5,00.
- Produtos cancelados se referem aos lancamentos cancelados da Vitrine/Estoque.
- A aba Financeiro do APP deve permitir registrar entrada, registrar saida, registrar boleto/conta e marcar conta como paga.
- Novos registros do APP devem exigir Supabase online. Se o Supabase falhar, o APP deve mostrar erro e nao confirmar sucesso local.
- Cache local pode continuar existindo apenas como espelho de leitura/hidratacao dos dados vindos do Supabase.

## Arquitetura

As mudancas devem ficar concentradas no APP/PWA do dono:

- `src/modules/mobile/mobile-dashboard.module.js`
  - Adicionar a aba `Financeiro` no menu mobile.
  - Renderizar os novos blocos da Vitrine.
  - Renderizar o formulario de Fechamento e o Historico de Fechamentos melhorado.
  - Tratar eventos e submits das novas acoes mobile.
- `src/services/mobile-showcase.service.js`
  - Adaptar dados da vitrine para o APP.
  - Fornecer cards `Vitrine`, `Vendidos`, `Sobras` e `Vendidos sem estoque`.
  - Fornecer comparativo completo e lancamentos cancelados para exibicao.
- `src/services/mobile-closing.service.js`
  - Preparar resumo de fechamento mobile.
  - Calcular totais esperados, contados e diferencas.
  - Classificar status do historico.
  - Orquestrar fechamento mobile usando o fluxo de fechamento existente.
- Criar `src/services/mobile-financial.service.js` se a logica financeira mobile nao couber de forma limpa no modulo mobile
  - Adaptar os dados do Financeiro para renderizacao mobile.
  - Encapsular a exigencia de escrita online no Supabase para acoes feitas pelo APP.
- `src/styles/mobile.css`
  - Adicionar apenas estilos necessarios aos novos blocos dentro do APP.
  - Nao alterar estilos desktop.

Servicos compartilhados continuam sendo fonte de verdade:

- Vitrine: `src/services/estoque.service.js`.
- Fechamento: `src/services/cash-closing.service.js`.
- Financeiro: `src/services/financial.service.js`.
- Supabase e realtime: `src/services/financial-sync.service.js`, `src/services/online-data.service.js` e servicos de sync de vitrine existentes.

Nao devem ser alterados os modulos web:

- `src/modules/vendas/vendas.module.js`
- `src/modules/estoque/estoque.module.js`
- `src/modules/caixa/caixa.module.js`
- `src/modules/dashboard/dashboard.module.js`
- `src/modules/despesas/despesas.module.js`

Uma alteracao em servico compartilhado so e aceitavel se for necessaria para dados, sincronizacao ou teste, e nao pode mudar a apresentacao visual web.

## Vitrine no APP

A aba Vitrine do APP deve manter sua estrutura atual e receber apenas os itens pedidos.

Cards de quantidade:

- Vitrine: quantidade total ativa produzida no periodo.
- Vendidos: quantidade total vendida valida no periodo.
- Sobras: quantidade ativa restante no periodo.
- Vendidos sem estoque: quantidade vendida valida de produtos sem producao ativa suficiente no periodo.

Comparativo Producao x Vendas:

- Produto.
- Categoria.
- Produzido.
- Valor produzido.
- Vendido.
- Valor vendido.
- Sobra.
- Diferenca.
- % vendido.

Os valores ativos devem usar `getProductionSalesComparison()` e `getStockSummary()`, respeitando periodo/filtro do APP quando houver. Vendas canceladas e lancamentos cancelados nao devem somar nos totais ativos.

O card `Vendidos sem estoque` deve ser calculado a partir das vendas validas do periodo, comparando itens vendidos com a quantidade ativa produzida por produto. A quantidade sem estoque e a parte vendida que excede a producao ativa do produto no mesmo periodo, ou toda a quantidade vendida quando nao houver lancamento ativo de vitrine para aquele produto.

## Produtos Cancelados no APP

O APP deve exibir lancamentos cancelados da vitrine no historico/lista da aba Vitrine.

Comportamento:

- Card vermelho.
- Badge `Cancelado`.
- Continua aparecendo no historico.
- Nao soma nos totais ativos.
- Nao entra no comparativo ativo.

A fonte dos cancelados deve ser `getStockLaunches()` com status `cancelado`, filtrado pelo periodo aplicavel.

## Fechamento no APP

A aba Fechar deve receber uma area de formulario para registrar fechamento.

Campos:

- Dinheiro contado.
- Pix contado.
- Cartao contado.
- Observacao.

Valores automaticos:

- Pix contado vem com Pix esperado.
- Cartao contado vem com Debito esperado + Credito esperado.
- Dinheiro contado pode vir com Dinheiro esperado.

Resumo:

- Dinheiro esperado.
- Pix esperado.
- Cartao esperado.
- Total esperado.
- Total contado.
- Diferenca por modalidade.
- Diferenca total.

Acao:

- Botao `Fechar Caixa`.
- Ao confirmar, registrar usuario atual, data/hora, valores esperados, valores contados, diferencas e observacao.
- Salvar no Supabase.
- Atualizar o historico de fechamentos apos confirmacao online.

Se o Supabase estiver indisponivel ou a gravacao falhar, o APP deve exibir erro e nao indicar que o fechamento foi salvo.

## Historico de Fechamentos no APP

A area `Historico de Fechamentos` deve mostrar:

- Data.
- Hora.
- Usuario.
- Valor esperado.
- Valor contado.
- Diferenca.
- Status.

Status:

- Conferido: diferenca total absoluta igual a 0.
- Pequena diferenca: diferenca total absoluta maior que 0 e ate 5.
- Grande diferenca: diferenca total absoluta maior que 5.

O historico deve vir de `cash_closings` via hidratacao Supabase, mantendo o cache local apenas como espelho de leitura.

## Financeiro no APP

Adicionar uma aba `Financeiro` no APP/PWA do dono.

A aba deve oferecer a mesma visao operacional da aba Financeiro web, adaptada para mobile e sem reutilizar layout desktop:

- Cards de Entradas, Saidas, Saldo, Contas a pagar, Contas pagas e Vencidas.
- Lista de movimentacoes financeiras.
- Painel de contas a pagar.
- Mini CRM financeiro com categorias, pagamentos e evolucao conforme dados disponiveis no servico financeiro.

Acoes:

- Registrar entrada.
- Registrar saida.
- Registrar boleto/conta.
- Marcar conta como paga.

As acoes devem usar as regras de `financial.service.js` e persistencia Supabase por `financial-sync.service.js`. Para acoes feitas pelo APP, sucesso so deve ser mostrado depois de confirmacao online. Falha de rede ou erro do Supabase deve manter a tela sem novo registro confirmado e apresentar mensagem de erro.

## Dados e Tabelas

A implementacao deve usar tabelas ja existentes sempre que possivel:

- `sales`
- `sale_items`
- `commands`
- `command_items`
- `cash_movements`
- `cash_closings`
- `financial_categories`
- `financial_transactions`
- tabelas de vitrine/estoque ja usadas pelo sync de showcase no projeto

Nao ha previsao inicial de criar tabelas novas. Se a implementacao descobrir falta real de coluna/tabela para sincronizacao de vitrine, isso deve ser tratado como ajuste pequeno de schema com migration propria e RLS coerente, sem alterar escopo visual web. O card `Vendidos sem estoque` deve ser calculado com vendas e producao existentes, sem exigir tabela nova.

## Realtime e Sincronizacao

O APP deve continuar usando a hidratacao online e realtime existentes.

Expectativas:

- Dados de vendas, caixa, financeiro, fechamento e vitrine devem refletir mudancas vindas do Supabase.
- Multiplos dispositivos devem ver os dados sincronizados.
- Acoes mobile devem atualizar o Supabase e depois refletir no APP.
- Novas acoes mobile nao devem criar registros pendentes locais quando a escrita online falhar.

## Tratamento de Erros

Erros devem aparecer na propria area afetada do APP ou no status de sync.

Exemplos:

- `Nao foi possivel salvar no Supabase.`
- `Sem conexao para registrar este fechamento.`
- `Nao foi possivel registrar o lancamento financeiro.`

O usuario nao deve ficar com impressao de sucesso quando a gravacao online falhar.

## Testes

Testes previstos:

- `mobile-showcase.service`: cards, comparativo completo e cancelados.
- `mobile-closing.service`: valores automaticos, diferencas e status do historico.
- Fluxo de fechamento mobile: nao confirmar sucesso quando Supabase falha.
- Servico/fluxo financeiro mobile: resumo, criacao online e marcacao de conta paga.
- Regressao de escopo: confirmar que modulos web principais nao foram alterados pela implementacao.

## Criterios de Aceite

- As quatro correcoes originais aparecem no APP/PWA do dono.
- A nova aba Financeiro aparece no APP e permite visao e registros online.
- As telas web permanecem visualmente iguais.
- Areas do APP fora do escopo nao sao redesenhadas.
- Lancamentos cancelados aparecem em vermelho com badge e nao afetam totais ativos.
- Fechamento grava usuario, data/hora, valores esperados, contados e diferencas no Supabase.
- Historico de fechamentos mostra data, hora, usuario, esperado, contado, diferenca e status.
- Falhas de Supabase nao geram sucesso local para novos registros mobile.
- Ao final da implementacao, a resposta deve listar arquivos alterados, componentes criados, rotas criadas, tabelas utilizadas e testes realizados.
