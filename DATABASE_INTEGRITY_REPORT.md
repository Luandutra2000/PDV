# Integridade do Banco — 29/07/2026

## Resultado final

O banco ficou consistente após a aplicação das migrações:

- `20260729230000_fix_showcase_reversal_and_realtime.sql`
- `20260729234500_reconcile_legacy_canceled_showcase_sales.sql`

## Evidências

- A venda cancelada antiga foi reconciliada.
- O estoque QA passou de 25 para 26.
- O histórico passou a registrar o movimento `Estorno de venda`.
- Uma nova venda reduziu o estoque de 26 para 25.
- O cancelamento dessa venda restaurou o estoque de 25 para 26.
- Quatro vendas QA permanecem ativas e a sobra calculada é de 26 unidades.
- A RPC é transacional e idempotente, impedindo estorno duplicado.

## Estado

Integridade funcional aprovada para operação assistida. A restauração completa do backup ainda deve ser exercitada em um Supabase isolado de homologação.
