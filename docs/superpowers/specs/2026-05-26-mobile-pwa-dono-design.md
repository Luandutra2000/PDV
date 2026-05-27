# Mobile PWA do Dono

## Contexto

O PDV Lanchonete hoje roda como uma aplicacao web estatica em JavaScript puro, com dados persistidos em `localStorage` e servicos modulares em `src/services`. O sistema ja possui vendas, caixa, estoque/vitrine, CRM gerencial e fechamento de caixa.

Esta etapa cria uma experiencia mobile/PWA para o dono acompanhar a operacao pelo celular. O app mobile nao substitui o PDV principal e nao precisa conter todas as funcoes administrativas. Ele deve ser rapido, simples e focado em leitura gerencial em tempo real.

## Decisao Aprovada

Criar a opcao B: um PWA mobile instalavel, com dashboard do dono, visual inspirado no mockup aprovado e usando as cores atuais do sistema.

Primeira entrega:

- Interface mobile/PWA.
- Menu inferior com Inicio, Caixa, Vitrine, CRM e Fechamento.
- Cards coloridos de indicadores.
- Feed ao vivo com animacao de fila.
- Filtros no feed.
- Dados vindos primeiro dos dados/eventos atuais do sistema.
- Estrutura preparada para conectar Supabase/realtime depois.

## Objetivos

1. Criar uma area mobile responsiva e instalavel como PWA.
2. Mostrar os principais indicadores do dia para o dono.
3. Exibir vendas, entradas, saidas e alertas importantes em um feed ao vivo.
4. Manter historico de notificacoes dentro do app.
5. Permitir filtros por tipo de evento.
6. Preparar a arquitetura para realtime online sem refazer as telas.

## Fora de Escopo Nesta Fase

- Push notification fora do app quando o navegador estiver fechado.
- Migracao completa para Supabase.
- Login/permissoes online completos.
- Edicao operacional critica pelo celular.
- Fechamento de caixa executado pelo dono no mobile.

O fechamento mobile comeca como visualizacao. Acoes criticas podem entrar depois, quando autenticacao, permissoes e auditoria estiverem completas.

## Experiencia Mobile

O app mobile segue a identidade atual do sistema:

- Fundo creme: `#f8f2ec`.
- Superficie branca.
- Laranja principal: `#ff6b1a`.
- Verde para entradas/sucesso.
- Vermelho para saidas, diferencas e alertas.
- Azul/ciano para saldo ou informacoes neutras.
- Amarelo para lucro estimado ou indicadores de destaque.

A tela inicial deve ter leitura rapida:

- Total vendido no dia.
- Entradas.
- Saidas.
- Saldo atual do caixa.
- Lucro estimado.
- Feed "Ao vivo".

Os cards devem ser grandes, com toque confortavel e texto legivel em celular.

## Feed Ao Vivo

O feed e o elemento principal da tela inicial.

Comportamento:

- O evento mais novo aparece no topo.
- Eventos antigos sao empurrados para baixo.
- A entrada do novo card usa uma animacao flutuante de cima para baixo.
- Cada card mostra tipo, descricao, valor quando existir e horario relativo.
- O feed fica registrado como historico dentro do app.

Tipos iniciais:

- Venda realizada.
- Entrada de caixa.
- Saida de caixa.
- Cancelamento ou ajuste.
- Produto acabando.
- Produto parado ou com baixa venda.
- Sangria/retirada.
- Fechamento concluido.
- Diferenca no fechamento.

Filtros:

- Tudo.
- Vendas.
- Entradas.
- Saidas.
- Alertas.

O filtro muda apenas a lista exibida. O historico completo continua preservado.

## Abas

### Inicio

Mostra os principais KPIs e o feed ao vivo filtravel.

### Caixa

Mostra:

- Total vendido no dia.
- Entradas.
- Saidas.
- Saldo atual.
- Vendas por forma de pagamento.
- Lucro estimado.

### Vitrine

Mostra:

- Produtos colocados na vitrine.
- Quantidade vendida.
- Quantidade restante.
- Valor estimado da vitrine.
- Valor vendido ate o momento.
- Produtos mais vendidos.
- Produtos menos vendidos.
- Alertas de produto acabando ou parado.

### CRM

Mostra:

- Comandas abertas.
- Comandas fechadas.
- Ticket medio.
- Produto mais vendido.
- Produto menos vendido.
- Horario de maior movimento.
- Comparacao entre producao e vendas.
- Categorias de entradas e saidas.

### Fechamento

Mostra:

- Total esperado.
- Total em dinheiro.
- Total em pix.
- Total em cartao.
- Entradas.
- Saidas.
- Diferenca de caixa, se existir.
- Historico de fechamentos anteriores.

## Arquitetura

A implementacao deve manter JavaScript e CSS modularizados.

Modulos sugeridos:

- `src/modules/mobile/mobile-dashboard.module.js`
- `src/styles/mobile.css`
- `src/services/mobile-notifications.service.js`
- `src/services/mobile-cash-flow.service.js`
- `src/services/mobile-showcase.service.js`
- `src/services/mobile-closing.service.js`
- `src/services/realtime.service.js`

O app deve usar services como fronteira para dados e regras. A UI mobile nao deve ler direto varias chaves de storage sem passar por uma camada de servico.

Fluxo inicial:

```text
PDV atual
  -> services existentes
  -> eventos locais / localStorage
  -> services mobile
  -> modulo mobile
  -> feed, cards e abas
```

Fluxo futuro:

```text
PDV principal
  -> data provider
  -> Supabase realtime
  -> realtime.service.js
  -> services mobile
  -> app mobile/PWA
```

## PWA

Criar estrutura instalavel:

- `manifest.json`.
- `service-worker.js`.
- Registro do service worker no app.
- Nome curto para tela inicial.
- Cor de tema usando o laranja do sistema.
- Icones do app em tamanhos apropriados.

O service worker da primeira fase pode ter cache simples dos arquivos estaticos. Ele nao deve fingir que dados online foram sincronizados quando nao foram.

## Dados

Primeira fase usa os dados atuais do sistema:

- Vendas.
- Itens vendidos.
- Entradas de caixa.
- Saidas de caixa.
- Vitrine/producao/estoque.
- Fechamentos.
- Fila de eventos de sync, quando aplicavel.

Os services mobile devem devolver estruturas prontas para a UI, como:

- resumo de caixa;
- resumo de vitrine;
- resumo de CRM;
- fechamento atual e historico;
- lista normalizada de notificacoes.

## Alertas

Regras iniciais:

- Venda de valor alto.
- Saida de dinheiro alta.
- Produto da vitrine acabando.
- Produto com baixa venda.
- Sangria ou retirada.
- Fechamento concluido.
- Diferenca no fechamento.

Os limites numericos devem ficar concentrados no service de notificacoes, para serem ajustados depois sem mexer na UI.

## Tratamento de Erros

Se uma leitura de dados falhar, a aba deve mostrar estado vazio ou mensagem curta, sem quebrar o app inteiro.

Se realtime futuro estiver indisponivel, o app deve continuar exibindo o ultimo estado local conhecido e indicar que nao esta recebendo atualizacoes ao vivo.

## Testes

Testes automaticos devem cobrir:

- Normalizacao de notificacoes.
- Ordenacao do feed com mais novo primeiro.
- Filtros do feed.
- Calculos de fluxo de caixa.
- Calculos de vitrine.
- Dados de fechamento.

Testes manuais:

- Abrir em desktop e celular.
- Navegar pelas cinco abas.
- Conferir tamanho dos botoes e legibilidade.
- Simular venda e verificar aparicao no topo do feed.
- Filtrar por vendas, entradas, saidas e alertas.
- Instalar como PWA quando suportado.

## Criterios de Aceite

- Existe uma rota/entrada mobile acessivel pelo sistema.
- O app mobile usa as cores do sistema.
- O menu inferior tem Inicio, Caixa, Vitrine, CRM e Fechamento.
- A tela inicial mostra KPIs do dia.
- O feed ao vivo exibe o evento mais novo no topo.
- Novos eventos empurram os antigos para baixo.
- O feed tem animacao visual de entrada.
- O feed pode ser filtrado por tipo.
- O historico de eventos permanece acessivel dentro do app.
- O codigo fica modularizado em arquivos de modulo, services e CSS.
- A estrutura fica pronta para conectar Supabase/realtime em etapa futura.
