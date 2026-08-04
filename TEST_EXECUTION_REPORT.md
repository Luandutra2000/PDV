# Relatório de Execução — 04/08/2026

## Resultado

| Métrica | Resultado |
|---|---:|
| Regressão automatizada | 46/46 aprovados |
| Bugs P1 encontrados nesta rodada | 2 |
| Bugs P1 corrigidos, publicados e retestados | 2/2 |
| HTTP de produção | 200 |
| Versão validada | `20260804-02` / `pdv-v75` |
| Verificação leve de latência | 20 GETs; média 57,6 ms; p95 66,3 ms; p99 234,1 ms |
| Pendência operacional | confirmação nativa da exclusão do usuário QA |

## Ambiente

- Produção: `https://pdv-qdelicia.vercel.app/`.
- Deploy: `dpl_2TtuWkdeY7896mnfcPtafeDMS4EW`, estado `READY`.
- GitHub: branch `feature/fechamento-caixa`, commit `fa60c91`.
- Backend: Supabase em produção.
- Navegador: navegador real integrado ao Codex, com sessão administrativa autenticada.
- Backup pré-teste: `backups/production-2026-08-04-pre-retest`.
- Cobertura do backup: 23 tabelas acessíveis pela API pública, 572 registros, checksums válidos, além das migrações. Tabelas protegidas por RLS exigem credencial administrativa para uma restauração integral.

## Evidências da rodada

- Cadastro do produto `[QA] Produto Sync 20260804` com estoque inicial 9 passou a disponibilizar imediatamente 9 unidades na Frente de Caixa.
- Venda real de 2 unidades por R$ 12,84 baixou o estoque uma única vez, de 9 para 7.
- Uma venda Pix anterior foi cancelada e restaurou o estoque exatamente uma vez.
- Entrada, saída e venda foram refletidas entre duas abas; a entrada de R$ 1,11 apareceu na outra aba em 293 ms.
- Relatórios operacionais coincidiram com o caixa: venda R$ 12,84, entrada R$ 11,12, saída R$ 3,21 e saldo R$ 20,75 antes dos lançamentos finais de QA.
- O defeito de fila financeira foi reproduzido: uma entrada de R$ 10,01 existia em `cash_movements`, mas havia sido sobrescrita na fila e não existia em `financial_transactions`.
- Após a correção, duas entradas consecutivas de R$ 2,22 e R$ 3,33 foram persistidas separadamente e exibidas no Financeiro.
- O registro antigo de R$ 10,01 foi reconciliado de forma idempotente, vinculado ao movimento original e passou a aparecer após recarga completa.
- O Financeiro final exibiu entradas de R$ 16,67, saídas de R$ 3,21 e saldo de R$ 13,46 para o período.
- Sessão autenticada sobreviveu a recargas completas.
- Layout funcional verificado em 375×812 e 768×1024; navegação, produto e comanda permaneceram acessíveis.
- Testes automatizados de segurança, XSS, permissões, convergência offline, realtime e jornada crítica passaram dentro da suíte 46/46.

## Correções publicadas

1. Sincronização do estoque inicial/alterado do cadastro de produto com a vitrine (`e1989af`).
2. Chave única da fila financeira passou a incluir `operation.transaction.id`, impedindo que lançamentos distintos se sobrescrevam (`fa60c91`).
3. Testes de regressão adicionados para estoque e para múltiplos lançamentos financeiros offline.
4. Exportador de backup passou a aceitar opcionalmente um arquivo de ambiente com credencial protegida.

## Dados de QA mantidos

- Categoria `[QA] Testes 20260804`.
- Produtos `[QA] Produto 20260804` e `[QA] Produto Sync 20260804`.
- Venda ativa de R$ 12,84.
- Entradas de R$ 10,01, R$ 1,11, R$ 2,22 e R$ 3,33.
- Saída de R$ 3,21.
- Usuário `[QA] Admin Delete 20260804` até a confirmação final da exclusão.

## Limites não executados em produção

Não foi aplicada carga destrutiva de 10.000 cenários/50.000 operações, nem restauração integral sobre a base ativa, falhas deliberadas de infraestrutura, impressão física, pagamentos externos ou matriz completa de navegadores. Esses ensaios exigem homologação isolada para não degradar ou corromper a produção.

## Parecer

As duas regressões P1 descobertas nesta rodada foram corrigidas, testadas, publicadas e validadas no navegador de produção. O sistema está **aprovado com ressalvas** para uso controlado; a promoção a uso irrestrito depende dos ensaios de carga/recuperação em homologação e da conclusão visual da exclusão do usuário QA.
