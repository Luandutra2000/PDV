# CRM e fechamento de caixa

Este documento resume a estrutura criada para o painel **Fechar Caixa / CRM** e para o **Fechamento Rapido** da Frente de Caixa.

## Telas

- `src/modules/caixa/caixa.module.js`: tela principal `Fechar Caixa / CRM`, com filtros de periodo, resumo, graficos, analise de produtos, fechamento completo, movimentacoes e historico.
- `src/modules/dashboard/dashboard.module.js`: antiga tela Dashboard, agora usada como `Historico de Transacoes` dentro do grupo `Vendas`.
- `src/modules/vendas/vendas.module.js`: Frente de Caixa, botao `Fechamento Rapido`, baixa `Perda / Consumo` e cadastro de entradas/saidas com categoria.

## Componentes

- `src/components/dashboard-resumo.component.js`: cards de resumo financeiro.
- `src/components/graficos-financeiros.component.js`: graficos simples de vendas e pagamentos.
- `src/components/analise-produtos.component.js`: ranking por quantidade e faturamento.
- `src/components/entradas-saidas.component.js`: tabela de movimentacoes financeiras.
- `src/components/historico-fechamentos.component.js`: ultimos fechamentos e vendas apos fechamento.
- `src/components/fechamento-rapido-modal.component.js`: modal de fechamento rapido usado na Frente de Caixa.

## Servicos

- `src/services/crm-dashboard.service.js`: calcula indicadores do CRM por periodo, ranking de produtos, ranking por categoria, series de vendas e movimentacoes financeiras.
- `src/services/cash-closing.service.js`: monta conferencia de pagamentos, conferencia da vitrine, salva rascunho e confirma fechamento.
- `src/services/transaction.service.js`: registra vendas, entradas e saidas. Entradas/saidas agora aceitam `category` e `userName`.
- `src/services/estoque.service.js`: fornece comparacao entre producao, vendas, baixas e sobras da vitrine.

## Regras de fechamento

- O dinheiro esperado considera vendas em dinheiro + entradas - saidas.
- Pix, debito e credito podem ser conferidos; se ficarem em branco, o sistema usa o valor esperado para comparacao geral.
- Se houver divergencia, o fechamento exige motivo e observacao.
- Fechamentos confirmados entram no historico e nao devem ser editados diretamente. Ajustes futuros devem ser lancados como nova movimentacao ou fechamento de ajuste.
- `Perda / Consumo` baixa produto da vitrine do dia e entra na conferencia da vitrine.

## Banco futuro

Quando migrar de `localStorage` para banco real, manter tabelas/colecoes equivalentes:

- `cash_sessions`
- `cash_movements`
- `sales`
- `sale_items`
- `products`
- `categories`
- `payment_methods`
- `users`

Campos obrigatorios para auditoria: `createdAt`, `updatedAt`, `userId` ou `userName`, `status`, `category`, `description` e valores monetarios normalizados em numero.

## Testes relacionados

- `tests/crm-dashboard-service.test.mjs`
- `tests/cash-closing-service.test.mjs`
- `tests/transaction-service.test.mjs`
- `tests/estoque-service.test.mjs`
