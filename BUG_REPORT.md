# Relatório de Bugs — 04/08/2026

## Resumo

- Regressão automatizada: 46/46 aprovada.
- Bugs novos encontrados: 2 P1.
- Bugs novos corrigidos, publicados e retestados: 2/2.
- Bugs de código abertos desta rodada: 0.

## BUG-011 — Estoque inicial do produto não chegava à vitrine

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Sintoma: o cadastro mostrava estoque 11 em Produtos, mas a Frente de Caixa mostrava estoque 0.
- Causa: o formulário persistia o estoque do catálogo sem chamar a sincronização autoritativa de `product_stock`.
- Correção: comparar o estoque informado com o estoque vivo e aplicar `adjustShowcaseStockOnline`, registrando valores anterior e atual na auditoria.
- Evidência: `[QA] Produto Sync 20260804` foi criado com estoque 9 e apareceu imediatamente com estoque 9 na Frente de Caixa; a venda de duas unidades deixou estoque 7.
- Commit: `e1989af`.

## BUG-012 — Lançamentos financeiros distintos se sobrescreviam na fila

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Sintoma: o caixa continha a entrada `[QA] Entrada 20260804` de R$ 10,01, mas o Financeiro/Supabase não tinha o lançamento correspondente.
- Causa: `getOperationKey()` ignorava `operation.transaction.id`; todas as gravações financeiras pendentes recebiam a chave vazia `saveFinancialTransaction:`.
- Correção: incluir o ID da transação na chave de compactação da fila.
- Regressão: duas transações offline distintas permanecem na fila e ambas são gravadas após o flush.
- Evidência em produção: entradas consecutivas `[QA] Fila A 20260804` (R$ 2,22) e `[QA] Fila B 20260804` (R$ 3,33) persistiram e apareceram separadamente.
- Reparação de dados: o lançamento antigo de R$ 10,01 foi recriado de modo idempotente com o mesmo `cash_movement_id`, sem alterar novamente o caixa.
- Commit: `fa60c91`.

## BUG-010 — Sessão administrativa inválida ao excluir usuário

- Severidade original: **P1**.
- Estado atual: criação do administrador QA funcionou e a exclusão chegou ao diálogo nativo de confirmação sem apresentar o erro antecipadamente. A confirmação final do diálogo ficou pendente porque o controlador do navegador não consegue aceitar esse diálogo específico; deve ser concluída visualmente no navegador.

## Bugs anteriores

- BUG-001 a BUG-009: permanecem corrigidos conforme a rodada de 29/07/2026.
