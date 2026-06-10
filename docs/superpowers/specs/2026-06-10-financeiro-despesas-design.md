# Design: Aba Financeiro

Data: 2026-06-10

## Objetivo

Criar a aba **Financeiro** para o dono controlar entradas, saidas, boletos, contas a pagar e movimentacoes manuais que nao pertencem diretamente a vendas, comandas, produtos, estoque ou vitrine.

A aba deve usar dados do Supabase como fonte principal. Nenhum dado financeiro importante deve depender apenas de `localStorage`; logout, login, troca de computador e uso no PWA precisam mostrar os mesmos lancamentos.

## Decisoes aprovadas

- A aba se chama **Financeiro**.
- O item atual **Despesas** sera evoluido/renomeado para **Financeiro**.
- A interface deve manter o design atual do PDV: fundo claro, cards brancos, bordas creme, laranja principal, verde para entrada e vermelho para saida.
- Nao sera feito redesign geral do sistema.
- Todo lancamento exige **descricao obrigatoria**.
- Excluir lancamento significa cancelar/inativar mantendo historico.
- Lancamentos pagos podem movimentar o caixa aberto sem criar venda, comanda, produto, estoque ou vitrine.
- Boleto pendente nao movimenta caixa ate ser marcado como pago.
- Boleto/conta pode ser marcado para movimentar caixa aberto quando o pagamento sair do caixa.

## Escopo da Tela

### Menu

No grupo Financeiro do menu lateral, exibir a aba **Financeiro** no lugar da aba **Despesas**. O icone pode continuar textual, mas deve parecer com o padrao atual do menu. A permissao deve ser financeira, nao apenas `reports.view`.

### Cards do Topo

A tela deve exibir cards de resumo:

- Entradas
- Saidas
- Saldo
- Contas a pagar
- Contas pagas
- Vencidas

O bloco de contas a pagar tambem deve destacar proximos vencimentos. Se o layout comportar sem poluir a tela, isso pode aparecer como card proprio; se nao, aparece como destaque dentro da area de contas a pagar.

O saldo da aba e calculado por:

```text
entradas pagas - saidas pagas = saldo financeiro do periodo
```

Contas pendentes entram nos cards de contas a pagar/vencidas/proximos vencimentos, mas nao entram no saldo pago ate serem marcadas como pagas.

### Botoes Principais

No topo da aba:

- `+ Entrada`
- `- Saida`
- `+ Boleto`

As cores seguem o padrao atual:

- Entrada: verde
- Saida: vermelho
- Boleto/acao principal: laranja

## Popups e Formularios

### Entrada Rapida

Abre ao clicar em `+ Entrada`, inclusive quando vier da Frente de Caixa.

Campos:

- Valor
- Categoria
- Descricao obrigatoria

Categorias exibidas: categorias do tipo `income` ou `both`.

Quando salvo pela Frente de Caixa, cria lancamento financeiro pago e movimento no caixa aberto.

### Saida Rapida

Abre ao clicar em `- Saida`, inclusive quando vier da Frente de Caixa.

Campos:

- Valor
- Categoria
- Descricao obrigatoria

Categorias exibidas: categorias do tipo `expense` ou `both`.

Exemplo aprovado: retirar dinheiro para pagar fornecedor sem boleto:

- Tipo: saida
- Categoria: Compra de material
- Descricao: motivo da retirada
- Status: pago
- Origem: Frente de Caixa
- Movimenta caixa aberto: sim

### Boleto / Conta

Abre ao clicar em `+ Boleto` na aba Financeiro.

Campos:

- Descricao obrigatoria
- Valor
- Data do lancamento
- Data de vencimento
- Categoria
- Status: Pago, Pendente ou Vencido
- Forma de pagamento: Dinheiro, Pix, Cartao, Boleto, Transferencia ou Outro
- Observacao
- Opcao: movimentar caixa aberto quando marcar como pago

Boleto pendente fica em contas a pagar. Boleto vencido aparece como vencido quando a data de vencimento passa. Boleto pago grava `paid_at`.

### Marcar Como Pago

Em contas pendentes/vencidas, o botao **Marcar pago** deve:

- atualizar status para `paid`;
- gravar `paid_at`;
- gravar forma de pagamento, se ainda nao existir;
- criar movimento no caixa aberto apenas se a opcao de movimentar caixa estiver marcada.

## Lista de Movimentacoes

Tabela com:

- Data
- Descricao
- Tipo
- Categoria
- Valor
- Status
- Acoes

Filtros:

- Periodo
- Tipo
- Categoria
- Status
- Forma de pagamento

Cada linha deve ter **Mais info**. Ao abrir, mostrar:

- descricao completa;
- observacao;
- origem: Financeiro ou Frente de Caixa;
- usuario que lancou;
- data/hora do lancamento;
- data de vencimento;
- data de pagamento;
- forma de pagamento;
- vinculo com movimento do caixa, se existir.

## Contas a Pagar

A area de contas a pagar deve mostrar cards com:

- nome/descricao curta;
- status;
- valor;
- data do lancamento;
- data de vencimento;
- descricao;
- botao **Marcar pago**.

Separar visualmente:

- vencidas;
- proximos vencimentos;
- pendentes.

## Mini CRM Financeiro

Criar graficos simples:

- Saidas por categoria
- Entradas por categoria
- Evolucao mensal de entradas e saidas
- Gastos por forma de pagamento
- Top 5 categorias que mais gastaram
- Total pendente por categoria

Os graficos devem usar dados do Supabase hidratados na tela, com fallback apenas visual para estado de carregamento/erro, nunca como fonte final de verdade.

## Modelo de Dados

### `financial_categories`

Campos:

- `id`
- `name`
- `type`: `income`, `expense` ou `both`
- `color`
- `active`
- `created_at`
- `updated_at`

Categorias iniciais:

Saidas:

- Compra de materiais
- Fornecedor
- Boleto
- Aluguel
- Energia
- Agua
- Internet
- Funcionario
- Retirada do dono
- Manutencao
- Outros

Entradas:

- Reforco de caixa
- Aporte do dono
- Reembolso
- Outros

### `financial_transactions`

Campos:

- `id`
- `type`: `income` ou `expense`
- `description`
- `amount`
- `category_id`
- `payment_method`
- `status`: `paid`, `pending`, `overdue` ou `canceled`
- `transaction_date`
- `due_date`
- `paid_at`
- `notes`
- `origin`: `finance` ou `cashier`
- `cash_movement_id`
- `moves_cash_session`
- `created_by`
- `canceled_at`
- `cancel_reason`
- `created_at`
- `updated_at`

## Integracao com Caixa

Lancamentos financeiros nao criam venda nem comanda.

Quando uma entrada/saida paga deve mexer no caixa aberto:

1. criar ou atualizar `financial_transactions`;
2. criar o movimento correspondente em `cash_movements`;
3. vincular `financial_transactions.cash_movement_id` ao movimento criado;
4. atualizar resumos do caixa e fechamento.

Quando um lancamento e cancelado:

1. marcar `financial_transactions.status = canceled`;
2. cancelar o `cash_movements` vinculado, se existir;
3. manter historico e auditoria.

## Permissoes

Permissoes sugeridas:

- `financial.view`
- `financial.transaction.create`
- `financial.transaction.edit`
- `financial.transaction.cancel`
- `financial.category.manage`
- `financial.payable.pay`

Superusuario/admin pode criar, editar, cancelar e gerenciar categorias. Usuario caixa pode visualizar ou lancar movimentacoes conforme permissao existente/atribuida.

## Auditoria

Registrar auditoria para:

- categoria criada/editada/inativada;
- lancamento criado/editado/cancelado;
- conta marcada como paga;
- lancamento vindo da Frente de Caixa;
- movimento de caixa criado por lancamento financeiro.

## Testes Obrigatorios

1. Criar categoria de saida "Compra de material", lancar saida de R$ 100,00, deslogar, logar novamente e confirmar que continua salvo.
2. Criar boleto com vencimento futuro e confirmar que aparece em contas a pagar.
3. Criar boleto vencido e confirmar que aparece como vencido.
4. Marcar conta pendente como paga e confirmar atualizacao no banco.
5. Abrir sistema em dois navegadores/computadores, criar lancamento em um e confirmar que aparece no outro.
6. Conferir se graficos atualizam apos novos lancamentos.
7. Conferir se entradas/saidas manuais entram no resumo financeiro geral e no caixa aberto quando aplicavel.
8. Confirmar que lancamentos financeiros nao alteram produtos, comandas, estoque ou vitrine.
9. Confirmar que descricao e obrigatoria em entrada, saida e boleto/conta.
10. Confirmar que **Mais info** mostra os detalhes do lancamento.

## Fora de Escopo Agora

- Anexar fotos/comprovantes.
- Parcelamento.
- Recorrencia automatica de contas fixas.
- Conciliacao bancaria/cartao.
- Redesign geral do PDV.
