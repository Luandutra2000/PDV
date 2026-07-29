# Sincronização Realtime — 29/07/2026

## Resultado final

Sincronização entre abas aprovada diretamente na produção.

## Evidência

1. A aba A permaneceu aberta em R$ 245,40 e estoque 26.
2. Uma venda Pix de R$ 7,35 foi finalizada na aba B.
3. Sem clicar em Atualizar, a aba A passou para R$ 252,75 e estoque 25.
4. A venda foi cancelada na aba B.
5. A aba A voltou automaticamente para R$ 245,40 e estoque 26.

## Correção aplicada

- Tabelas relevantes adicionadas idempotentemente à publicação `supabase_realtime`.
- Fallback por evento de armazenamento para sincronização entre abas do mesmo terminal.
- Reidratação dos agregados de caixa e vitrine após eventos.
