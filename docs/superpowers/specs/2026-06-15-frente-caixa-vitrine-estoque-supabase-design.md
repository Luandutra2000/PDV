# Frente de Caixa Integrada com Vitrine/Estoque - Design

## Contexto

O PDV Lanchonete ja possui Frente de Caixa, Vitrine/Estoque, fechamento de caixa e sincronizacao financeira com Supabase. A Frente de Caixa finaliza vendas em `src/services/transaction.service.js` e envia vendas/comandas para o Supabase por `src/services/financial-sync.service.js`. A Vitrine/Estoque usa `src/services/estoque.service.js`, registra producao em `stock_production` e hoje atualiza estoque local do produto.

O problema atual e que venda, producao, saldo da vitrine, historico de movimentacao e vendidos sem estoque ainda nao formam um fluxo unico. A vitrine precisa virar um dominio sincronizado proprio, com cache local, fila offline, Supabase como fonte de verdade quando online, Realtime e operacoes idempotentes.

## Objetivo

Integrar totalmente a Frente de Caixa com a Vitrine/Estoque:

- lancamento de producao aumenta automaticamente o estoque disponivel da vitrine;
- venda finalizada baixa automaticamente o estoque da vitrine;
- venda sem estoque continua permitida, mostra alerta e registra a quantidade vendida sem estoque;
- fechamento de caixa mostra uma secao de produtos vendidos sem estoque;
- vitrine tem historico completo de entrada, saida, ajuste, venda sem estoque e estorno;
- site e PWA/app sincronizam pelo Supabase, com Realtime quando disponivel;
- se o Supabase ou a internet falhar, venda/producao/cancelamento continuam localmente e sincronizam depois.

## Fora de Escopo

- Bloquear venda por falta de estoque.
- Migrar o projeto para outro framework.
- Trocar o fluxo completo de vendas/caixa alem do necessario para integrar estoque.
- Apagar historico local automaticamente.
- Expor `service_role` ou qualquer chave secreta no frontend.
- Resolver todos os relatorios gerenciais em uma unica etapa.

## Decisoes Aprovadas

### Modo Offline-First

O sistema deve continuar vendendo e lancando producao mesmo sem internet. Operacoes de vitrine entram em uma fila local e sao sincronizadas depois.

Quando online, operacoes criticas devem preferir uma funcao segura no banco para aplicar venda, producao, ajuste e cancelamento de forma atomica. Quando offline, o cache local e atualizado imediatamente e marcado como pendente.

### Estoque Visual Nao Fica Negativo

A vitrine visual mostra `0` como minimo. Se o estoque disponivel for insuficiente, a parte faltante e registrada em `out_of_stock_sales`.

Exemplo:

- estoque atual: 2;
- venda: 5;
- vitrine passa para 0;
- vendidos sem estoque registra 3.

### Idempotencia Obrigatoria

Venda finalizada deve baixar estoque uma unica vez. Recarregar tela, reenviar fila ou receber Realtime duplicado nao pode gerar baixa duplicada.

As operacoes devem ter identificadores estaveis, como:

- `operation_id`;
- `sale_id`;
- `command_id`;
- `movement_id`;
- combinacao unica por `sale_id`, `product_id` e tipo de movimento quando fizer sentido.

## Abordagem Escolhida

Criar um dominio de vitrine sincronizada, semelhante ao financeiro:

- novo service dedicado, por exemplo `src/services/showcase-sync.service.js`;
- adapters para tabelas de estoque, movimentos e vendidos sem estoque;
- cache local em `localStorage`;
- fila local `pdv.syncQueue.showcase`;
- hidratacao do Supabase;
- Realtime para tabelas de vitrine;
- eventos internos para atualizar Frente de Caixa, Vitrine, fechamento e PWA.

O service de vendas continua responsavel por finalizar venda/comanda. Apos criar a venda, ele dispara o processamento de vitrine com a mesma venda. Em modo online, o processamento deve usar RPC/transacao no banco; em modo offline, aplica localmente e enfileira.

## Modelo de Dados

### `product_stock`

Tabela de saldo atual da vitrine por produto.

Campos:

- `id`;
- `product_id`;
- `quantity_available`;
- `updated_at`;
- `updated_by`.

Regras:

- uma linha por produto;
- quantidade visual minima na UI e 0;
- a tabela pode armazenar apenas saldo nao negativo se `out_of_stock_sales` guardar toda falta;
- se o banco permitir negativo internamente, a UI ainda deve mostrar 0. A preferencia aprovada e manter nao negativo.

### `showcase_movements`

Livro de movimentacao da vitrine.

Campos:

- `id`;
- `operation_id`;
- `product_id`;
- `movement_type`;
- `quantity`;
- `previous_quantity`;
- `new_quantity`;
- `sale_id`;
- `command_id`;
- `user_id`;
- `notes`;
- `created_at`;
- `reversed_movement_id`;
- `status`.

Tipos de movimento:

- `entrada_producao`;
- `saida_venda`;
- `ajuste_manual`;
- `venda_sem_estoque`;
- `estorno_venda`;
- `estorno_sem_estoque`.

Regras:

- `previous_quantity` e `new_quantity` registram o saldo real da vitrine antes/depois da operacao;
- `venda_sem_estoque` registra a falta, sem reduzir o saldo abaixo de 0;
- cancelamentos criam movimentos de estorno e marcam movimentos relacionados como estornados, mantendo trilha auditavel.

### `out_of_stock_sales`

Registro de produtos vendidos sem estoque suficiente.

Campos:

- `id`;
- `operation_id`;
- `product_id`;
- `sale_id`;
- `command_id`;
- `quantity`;
- `unit_price`;
- `total_price`;
- `user_id`;
- `created_at`;
- `status`;
- `canceled_at`;
- `canceled_by`.

Regras:

- usado pelo fechamento de caixa;
- cancelamento de venda marca esses registros como `cancelada` e cria movimento de estorno correspondente em `showcase_movements`;
- deve ter chave unica que impeca duplicacao por venda/produto.

### Tabelas Existentes

`stock_production` continua registrando lancamentos de producao. Cada lancamento ativo gera movimento `entrada_producao` e incrementa `product_stock`.

`showcase_write_offs` pode continuar para perda/consumo. Toda perda, consumo ou ajuste manual deve gerar movimento `ajuste_manual` em `showcase_movements`, com saldo anterior, saldo novo, motivo e observacao. O importante e que o historico da vitrine fique completo em `showcase_movements`.

## Fluxos

### Lancamento de Producao

1. Usuario informa produto e quantidade na Vitrine.
2. `estoque.service.js` valida permissao `showcase.launch`.
3. O sistema cria o lancamento em `stock_production`.
4. O dominio de vitrine cria movimento `entrada_producao`.
5. `product_stock.quantity_available` aumenta pela quantidade lancada.
6. Cache local e UI sao atualizados imediatamente.
7. Se online, a operacao e confirmada no Supabase; se offline, entra na fila.

Exemplo:

- Pastel Gaucho tinha 10;
- producao +20;
- novo saldo 30;
- movimento `entrada_producao` registra anterior 10 e novo 30.

### Venda na Frente de Caixa

1. Produto pode ser adicionado mesmo com estoque 0.
2. Card mostra estoque atual e tag `Sem estoque` quando o saldo for 0.
3. Ao finalizar venda, `transaction.service.js` cria a venda e a comanda fechada.
4. O dominio de vitrine processa os itens da venda.
5. Para cada item:
   - se o saldo cobre a quantidade, cria `saida_venda` e baixa tudo;
   - se o saldo cobre parcialmente, baixa o saldo disponivel e registra a diferenca em `out_of_stock_sales`;
   - se o saldo e 0, registra tudo como vendido sem estoque.
6. A venda recebe marca local de vitrine processada e o banco grava chave unica para indicar que a baixa ja foi aplicada.

Exemplo:

- Risole tinha 10;
- venda 2;
- novo saldo 8;
- movimento `saida_venda` registra anterior 10 e novo 8.

### Venda Sem Estoque

1. Se produto esta em 0, o card mostra alerta discreto e tag `Sem estoque`.
2. Ao adicionar ou finalizar item sem estoque, mostrar notificacao:

```text
Atencao: este produto esta sem estoque na vitrine.
```

3. A venda continua normalmente.
4. O saldo visual permanece 0.
5. `out_of_stock_sales` registra a quantidade faltante.
6. `showcase_movements` registra `venda_sem_estoque`.

Exemplo:

- estoque atual: 0;
- vendeu 3;
- vitrine mostra 0;
- vendidos sem estoque: 3.

### Cancelamento de Venda

1. Cancelamento continua exigindo permissao `sales.cancel`.
2. A venda/comanda e marcada como cancelada.
3. O dominio de vitrine estorna apenas a parte que saiu da vitrine.
4. Registros em `out_of_stock_sales` relacionados a venda sao cancelados e estornados no historico.
5. O que foi vendido sem estoque nao aumenta saldo, pois nunca saiu da vitrine.

Exemplo:

- estoque 2;
- venda 5;
- baixa 2 e registra 3 sem estoque;
- cancelamento devolve 2 para vitrine e cancela os 3 sem estoque.

### Ajuste Manual

A Vitrine deve ter uma opcao de ajuste manual com:

- produto;
- quantidade nova ou diferenca;
- motivo;
- observacao opcional;
- usuario;
- data/hora.

O ajuste cria movimento `ajuste_manual` com quantidade, saldo anterior e saldo novo.

### Fechamento de Caixa

O fechamento deve incluir uma secao:

```text
Produtos vendidos sem estoque
```

Campos exibidos:

- produto;
- categoria;
- quantidade vendida sem estoque;
- valor unitario;
- valor total;
- horario da venda;
- numero da comanda/venda;
- usuario que lancou.

Essa secao deve vir de `out_of_stock_sales` filtrada pelo periodo ou pela sessao/fechamento de caixa. Registros cancelados nao entram no total ativo, mas podem aparecer em historico/auditoria se necessario.

## Interface

### Frente de Caixa

Cards de produto devem mostrar:

- nome;
- categoria;
- estoque atual;
- tag `Sem estoque` quando estoque for 0;
- alerta visual discreto para produtos zerados.

O botao de venda continua ativo mesmo sem estoque.

### Vitrine/Estoque

A tela deve mostrar:

- estoque atual por produto;
- total produzido no dia;
- total vendido;
- total vendido sem estoque;
- valor estimado da vitrine;
- alertas de produtos zerados;
- lista de movimentacoes da vitrine;
- formulario de ajuste manual.

O comparativo atual de producao x vendas pode ser preservado, mas deve passar a usar os dados de vitrine sincronizados para nao depender apenas de calculo local a partir de transacoes.

### PWA/App

O PWA deve consumir o mesmo cache/hidratacao de vitrine. Se lancar producao pelo PWA, o site recebe via Realtime/hidratacao. Se vender pelo site, o PWA recebe baixa de estoque via Realtime/hidratacao.

## Sincronizacao e Realtime

Adicionar ao Realtime:

- `product_stock`;
- `showcase_movements`;
- `out_of_stock_sales`;
- `stock_production`, se ainda nao estiver publicado.

O novo service deve:

- hidratar saldos e historico;
- aplicar fila pendente;
- escutar alteracoes remotas;
- emitir eventos como `SHOWCASE_STOCK_CHANGED` e `SHOWCASE_DATA_CHANGED`;
- re-renderizar Frente de Caixa, Vitrine, fechamento rapido e PWA quando necessario.

Quando uma mudanca remota chegar, a UI deve preferir recarregar o cache do Supabase com debounce curto, seguindo o padrao de `financial-sync.service.js`.

## Banco, RLS e RPC

Todas as novas tabelas em `public` devem ter RLS habilitado.

Politicas esperadas:

- usuarios com permissao de vendas/caixa podem ler estoque da vitrine;
- usuarios com `showcase.launch` ou permissao equivalente podem lancar producao e ajuste;
- usuarios com `sales.create` ou permissao equivalente podem registrar baixa por venda;
- usuarios com `sales.cancel` ou permissao equivalente podem estornar baixa por cancelamento;
- usuarios com `cash.close` ou `dashboard.view` podem ler vendidos sem estoque para fechamento/relatorios.

Como operacoes de estoque exigem consistencia, a preferencia e criar funcoes RPC transacionais em schema privado ou com desenho seguro:

- `process_showcase_production`;
- `process_showcase_sale`;
- `reverse_showcase_sale`;
- `adjust_showcase_stock`.

Essas funcoes devem:

- validar permissao;
- travar a linha de estoque do produto quando necessario;
- criar movimentos;
- atualizar saldo;
- registrar vendidos sem estoque;
- ser idempotentes por `operation_id`/`sale_id`;
- nao depender de `user_metadata` para autorizacao;
- nao expor segredo no frontend.

O projeto ja teve nomes de permissoes diferentes entre banco e frontend, como `sale.create`/`sales.create` e `stock.create`/`showcase.launch`. A implementation deve alinhar esses nomes em migration ou criar um mapa explicito e testado antes de liberar as policies/RPC.

## Compatibilidade Local

Durante a transicao:

- `product.stock` local pode continuar existindo, mas a fonte preferida para vitrine passa a ser `product_stock`;
- se `product_stock` ainda nao estiver hidratado, a UI pode usar fallback local com indicador de pendencia;
- dados antigos de `stock_production` e `showcase_write_offs` nao devem ser apagados;
- o modo local deve continuar funcionando para desenvolvimento.

## Testes Automatizados

Testes obrigatorios:

- lancar producao aumenta saldo da vitrine;
- venda baixa saldo da vitrine;
- venda com estoque parcial registra apenas a diferenca em `out_of_stock_sales`;
- venda com estoque 0 e permitida e registra vendido sem estoque;
- venda finalizada duas vezes ou reenviada pela fila nao duplica baixa;
- cancelamento devolve somente a quantidade baixada da vitrine;
- cancelamento remove/estorna vendido sem estoque;
- adapters mapeiam `product_stock`, `showcase_movements` e `out_of_stock_sales`;
- Frente de Caixa renderiza estoque atual e tag `Sem estoque`;
- Vitrine renderiza saldos, zerados, vendidos sem estoque e historico;
- fechamento renderiza a secao `Produtos vendidos sem estoque`;
- fila offline sincroniza operacoes pendentes sem duplicar movimentos.

## Testes Manuais Obrigatorios

1. Lancar 10 unidades de Risole na vitrine.
2. Vender 2 no caixa.
3. Confirmar estoque 8 na vitrine.
4. Produto com estoque 0: vender 3 unidades.
5. Confirmar que a venda passou.
6. Confirmar alerta de sem estoque.
7. Confirmar registro em `Produtos vendidos sem estoque`.
8. Fechar caixa e confirmar que a secao aparece.
9. Cancelar venda e confirmar que o estoque volta corretamente.
10. Abrir o sistema em dois navegadores/computadores.
11. Vender produto em um e confirmar baixa no outro.
12. Lancar producao pelo app/PWA e confirmar aumento no site.
13. Vender pelo site e confirmar baixa no app/PWA.

## Entrega Esperada

Ao final da implementation, a resposta deve listar:

- arquivos alterados;
- SQL/migrations necessarias;
- tabelas Supabase criadas ou ajustadas;
- funcoes/RPC criadas, se houver;
- como a fila offline funciona;
- como a idempotencia foi garantida;
- o que mudou na Frente de Caixa;
- o que mudou na Vitrine;
- o que mudou no fechamento;
- testes automatizados e manuais realizados.
