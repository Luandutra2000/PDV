# Vendas e Caixa no Supabase - Design

## Objetivo

Corrigir a segunda base da auditoria do PDV: vendas, itens vendidos, movimentos de caixa, cancelamentos e fechamentos devem usar o Supabase como fonte principal quando o modo online estiver ativo.

Esta fase garante que:

- finalizar venda grave no banco;
- itens da venda sejam gravados em `sale_items`;
- entradas, saidas e sangrias sejam gravadas em `cash_movements`;
- cancelamentos sejam refletidos no banco;
- resumos de caixa, dashboard, mobile e fechamento leiam dados reais;
- falhas de escrita entrem em fila local temporaria;
- clientes conectados recebam atualizacoes em tempo real.

## Escopo

Incluido nesta fase:

- `transaction.service.js`.
- `cash-closing.service.js`.
- Adapters Supabase para:
  - `sales`;
  - `sale_items`;
  - `cash_movements`;
  - `commands`;
  - `command_items`;
  - `cash_closings`.
- Repository/fachada de sincronizacao para operacoes financeiras.
- Cache local temporario para historico financeiro.
- Fila local para vendas, movimentos, cancelamentos e fechamentos quando a escrita falhar.
- Status geral de sincronizacao financeira.
- Supabase Realtime para vendas, itens, movimentos, comandas e fechamentos.
- Testes unitarios e checklist manual da fase.

Fora desta fase:

- Estoque/producao/vitrine como fonte principal do banco.
- CRM completo alem dos dados que ele ja calcula a partir de transacoes.
- Migração automatica de historico local antigo para Supabase.
- Alteracao visual grande nas telas, exceto status discreto quando necessario.
- Mudancas de schema, salvo se um teste provar bloqueio real.

## Decisoes Aprovadas

- Supabase sera a fonte principal para dados financeiros quando estiver ativo.
- O modo local continua funcionando para desenvolvimento e fallback.
- Cache local sera temporario, nao banco definitivo.
- Escrita que falhar entra em fila local e sera sincronizada depois.
- A interface pode mostrar status geral de sincronizacao financeira, sem selo por venda.
- Nao havera migracao automatica dos dados locais antigos.
- O padrao sera o mesmo da fase de produtos: adapters + repository/fachada + service existente.

## Arquitetura

Criar uma camada financeira que fica entre `transaction.service.js`/`cash-closing.service.js` e Supabase.

### Adapters

`sale.adapter.js`:

- Converte venda do app para linha de `sales`.
- Converte `comandaId` para `command_id`.
- Converte `comandaNumber` para `command_number`.
- Converte `receivedAmount` para `received_amount`.
- Converte `change` para `change_amount`.
- Mantem status `ativa` ou `cancelada`.

`sale-item.adapter.js`:

- Converte itens de venda para `sale_items`.
- Usa id deterministico por venda/produto/ordem para evitar duplicidade em retry.

`cash-movement.adapter.js`:

- Converte entradas, saidas e sangrias para `cash_movements`.
- Mantem `category`, `description`, `userName`, `createdAt`, status e cancelamento.

`command.adapter.js` e `command-item.adapter.js`:

- Persistem comanda fechada/cancelada em `commands` e `command_items`.
- Mantem numero, status, total, pagamento, troco e datas.

`cash-closing.adapter.js`:

- Converte fechamento para `cash_closings`.
- Mantem `totals`, `payments`, `showcase`, `differences` e `input` como JSON.

### Repository Financeiro

Criar uma camada dedicada, por exemplo `financial-sync.service.js`, que:

- busca dados financeiros do Supabase;
- salva vendas e itens em ordem segura;
- salva movimentos de caixa;
- salva/cancela comandas fechadas;
- salva fechamentos;
- processa fila local;
- mantem cache temporario;
- assina eventos Realtime;
- emite evento interno de mudanca financeira.

O repository financeiro pode reaproveitar helpers do `entity-sync.repository.js`, mas vendas exigem operacoes compostas. Uma venda precisa gravar:

1. `commands`;
2. `command_items`;
3. `sales`;
4. `sale_items`.

Se alguma parte falhar, a operacao composta inteira entra em fila para retry.

## Fluxo de Venda

Quando o operador finaliza a venda:

1. `transaction.service.js` valida permissao, itens, pagamento e troco.
2. Monta o objeto de venda e comanda fechada como hoje.
3. Se Supabase estiver ativo:
   - chama a camada financeira para gravar comanda, itens, venda e itens de venda;
   - atualiza cache temporario com a venda e comanda fechada;
   - emite eventos de caixa/resumo;
   - inicia nova comanda local para a proxima venda.
4. Se Supabase falhar:
   - venda composta entra em fila;
   - cache local reflete a venda como pendente;
   - a UI mostra sincronizacao pendente;
   - o operador nao perde a venda.
5. Se Supabase nao estiver ativo:
   - fluxo local atual continua.

## Fluxo de Movimento de Caixa

Quando registrar entrada, saida ou sangria:

1. `transaction.service.js` valida permissao e valor.
2. Se Supabase estiver ativo:
   - grava em `cash_movements`;
   - atualiza cache temporario;
   - emite resumo financeiro.
3. Se a escrita falhar:
   - enfileira o movimento;
   - mantem movimento no cache como pendente;
   - status geral indica pendencia.
4. No modo local, o comportamento atual continua.

## Fluxo de Cancelamento

Cancelamento de venda ou comanda:

- atualiza `sales.status` para `cancelada`;
- atualiza `sales.canceled_at`;
- atualiza `commands.status` para `cancelada`;
- atualiza `commands.canceled_at`;
- preserva motivo, usuario e auditoria no cache/app;
- se a escrita falhar, enfileira a operacao de cancelamento.

Cancelamento de movimento de caixa:

- atualiza `cash_movements.status` para `cancelada`;
- atualiza `cash_movements.canceled_at`;
- preserva motivo, usuario e auditoria no cache/app;
- se falhar, enfileira.

## Fluxo de Fechamento

`cash-closing.service.js` continua montando o resumo a partir das vendas e movimentos ativos.

Quando confirmar fechamento:

1. valida diferencas e observacoes como hoje;
2. se Supabase estiver ativo, grava em `cash_closings`;
3. atualiza cache temporario de fechamentos;
4. se falhar, enfileira o fechamento.

Rascunhos podem continuar locais nesta fase, porque sao estado de trabalho. Fechamentos confirmados devem ser persistidos no banco.

## Fluxo de Leitura

Leituras de `getTransactions()` e `getClosedComandas()` devem carregar do cache temporario hidratado pelo Supabase.

Na inicializacao apos login:

1. carregar vendas, itens, movimentos, comandas e fechamentos do Supabase;
2. mapear para o formato atual do app;
3. salvar no cache temporario;
4. dashboards e telas continuam usando os mesmos getters.

Quando o banco estiver vazio:

- historico deve ficar vazio;
- resumos devem mostrar zero;
- nao deve aparecer mock de venda/movimento.

## Realtime

Assinar mudanças em:

- `sales`;
- `sale_items`;
- `cash_movements`;
- `commands`;
- `command_items`;
- `cash_closings`.

Quando houver mudanca:

1. recarregar o conjunto financeiro afetado;
2. atualizar cache temporario;
3. emitir `cashSummaryChanged`;
4. emitir evento financeiro especifico para telas que queiram atualizar.

Realtime nao substitui a leitura inicial. Ele mantem clientes alinhados depois do carregamento.

## Interface

Mudancas visuais devem ser pequenas:

- status geral de sincronizacao financeira em telas de caixa/fechamento se houver pendencia;
- botao `Sincronizar` quando existir fila pendente;
- mensagens de erro quando o banco falhar e nao houver cache.

Nao criar nova tela nesta fase.

## Dados Locais Permitidos

Permitido:

- cache temporario de vendas, movimentos, comandas fechadas e fechamentos;
- fila local de operacoes financeiras pendentes;
- rascunho de fechamento;
- comanda aberta atual;
- tema, sessao e estado de UI.

Nao permitido:

- usar historico local antigo como fonte principal quando Supabase estiver ativo;
- recriar vendas mock;
- considerar cache como dado definitivo;
- deixar venda gravada sem itens de venda correspondentes.

## Testes Automatizados

Criar ou ajustar testes para:

- adapter de venda;
- adapter de item de venda;
- adapter de movimento de caixa;
- adapter de comanda fechada;
- adapter de fechamento;
- finalizar venda em modo Supabase;
- escrita composta de venda + itens;
- falha de venda composta entrando em fila;
- movimento de caixa em modo Supabase;
- cancelamento de venda/comanda;
- cancelamento de movimento;
- fechamento confirmado em modo Supabase;
- leitura/hidratação financeira do banco;
- realtime atualizando cache e resumo;
- modo local continuando com os testes atuais.

## Checklist Manual

### Venda e historico

1. Fazer login.
2. Finalizar uma venda em dinheiro.
3. Confirmar venda em `sales`.
4. Confirmar itens em `sale_items`.
5. Fazer logout/login.
6. Confirmar que historico e resumo continuam corretos.

### Movimento de caixa

1. Registrar entrada.
2. Registrar saida.
3. Registrar sangria.
4. Conferir registros em `cash_movements`.
5. Confirmar dashboard/caixa atualizados.

### Cancelamento

1. Cancelar uma venda.
2. Confirmar status `cancelada` em `sales`.
3. Confirmar resumo sem total da venda cancelada.
4. Cancelar movimento de caixa.
5. Confirmar status `cancelada` em `cash_movements`.

### Fechamento

1. Gerar fechamento.
2. Confirmar fechamento.
3. Conferir registro em `cash_closings`.
4. Fazer nova venda depois do fechamento.
5. Confirmar que o fechamento anterior nao muda.

### Sincronizacao entre navegadores

1. Abrir navegador A.
2. Abrir navegador B.
3. Fazer venda no navegador A.
4. Confirmar resumo no navegador B sem refresh manual.
5. Registrar entrada no navegador B.
6. Confirmar caixa no navegador A sem refresh manual.

### Falha de conexao

1. Simular falha de escrita.
2. Finalizar venda.
3. Confirmar status de pendencia.
4. Restaurar conexao.
5. Sincronizar.
6. Confirmar venda e itens no Supabase.

## Riscos

- Venda composta pode gravar parcialmente se nao for tratada com cuidado.
- RLS pode permitir leitura mas bloquear inserts/updates.
- Realtime pode nao estar habilitado para todas as tabelas.
- Cancelamento precisa manter consistencia entre `sales` e `commands`.
- `cash_closings` guarda JSON; validacao deve ficar no service.
- Comanda aberta continua local nesta fase; dois caixas simultaneos podem precisar de uma fase propria para comandas abertas em tempo real.

## Criterios de Aceite

- Finalizar venda grava `sales` e `sale_items` no Supabase.
- Registrar entrada/saida/sangria grava `cash_movements`.
- Cancelar venda/comanda atualiza status no Supabase.
- Cancelar movimento atualiza status no Supabase.
- Confirmar fechamento grava `cash_closings`.
- Logout/login nao perde historico financeiro.
- Outro navegador recebe atualizacoes financeiras em tempo real.
- Falha de escrita cria pendencia local e permite sincronizar depois.
- Banco vazio mostra resumos zerados sem mock financeiro.
- Modo local atual continua passando nos testes.
- Testes automatizados da fase passam.
- Checklist manual da fase e documentado apos execucao.
