# Relatório de Bugs — 29/07/2026

## Resumo final

- Bugs consolidados: 9.
- Corrigidos e retestados: 9.
- Abertos: 0.
- Regressão automatizada: 46/46 aprovada.
- Reteste direcionado na produção: 7/7 aprovado.

## Bugs corrigidos nesta rodada

### BUG-003 — XSS armazenado em produto

- Severidade original: **P0**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: o payload `<img src=x onerror=alert('QA-XSS-RETEST')>` foi salvo e renderizado apenas como texto literal, sem executar JavaScript. O nome original do produto foi restaurado em seguida.
- Correção: escape consistente das informações persistidas nas superfícies de produtos, estoque e relatórios; arquivos internos e relatórios de QA também foram removidos do artefato público.

### BUG-004 — Cancelamento não restaurava estoque remoto

- Severidade original: **P1**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: venda controlada reduziu o estoque de 26 para 25; o cancelamento criou “Estorno de venda” e restaurou 25 para 26. A inconsistência histórica anterior também foi reconciliada.
- Correção: RPC transacional e idempotente `reverse_showcase_sale`, mais migração idempotente de reconciliação das vendas canceladas antigas.

### BUG-005 — Fechamento calculava diferença incorreta

- Severidade original: **P0**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: dinheiro `-451,85`, Pix `42,35`, débito `130,35` e crédito `65,35` resultaram em diferença geral de `R$ 0,00`.
- Correção: uma única fonte autoritativa para os valores exibidos e conferidos, cálculo em centavos e suporte explícito a dinheiro esperado negativo.

### BUG-006 — Outra aba não atualizava os totais

- Severidade original: **P1**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: uma venda em uma segunda aba atualizou automaticamente a primeira de `R$ 245,40` para `R$ 252,75` e o estoque de 26 para 25; o cancelamento voltou os valores para `R$ 245,40` e 26 sem clicar em Atualizar.
- Correção: publicação das tabelas relevantes no Supabase Realtime e fallback de sincronização entre abas.

### BUG-007 — Cancelar pagamento navegava para Produtos

- Severidade original: **P2**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: o modal foi cancelado, a aplicação permaneceu em Frente de Caixa e a comanda continuou intacta. A comanda de teste foi limpa depois.

### BUG-008 — Histórico mostrava usuário `undefined`

- Severidade original: **P2**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: produção, baixas e estornos exibem o responsável `Luan`.

### BUG-009 — Relatórios sem conteúdo operacional

- Severidade original: **P1**.
- Status: **corrigido, implantado e retestado na produção**.
- Evidência: o módulo agora apresenta resumo financeiro, formas de pagamento, produtos mais vendidos, categorias e movimentações recentes por período.

## Bugs anteriores

- BUG-001 — cache misturava módulos incompatíveis: corrigido.
- BUG-002 — regressões automatizadas: corrigido; estado atual 46/46.
