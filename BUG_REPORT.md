# Relatório de Bugs — 04/08/2026

## Resumo

- Regressão automatizada: 47/47 aprovada.
- Bugs de escala encontrados pela carga real: 2 P1.
- Bugs de escala corrigidos, publicados e retestados: 2/2.
- Bugs de código abertos desta rodada: 0.

## BUG-014 — Cliente REST de produção limitava a hidratação a 1.000 linhas

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Sintoma: após 12.500 vendas de carga, a interface mostrava R$ 22,06 em vez de R$ 137,84.
- Causa: a paginação inicial cobria o cliente Supabase com `.range()`, mas o cliente REST usado pelo navegador retornava uma única página de no máximo 1.000 registros.
- Correção: adição de `selectRange()` ao cliente REST e paginação explícita por `offset`/`limit` em todas as coleções financeiras.
- Regressão: teste específico confirma a leitura da segunda página no caminho REST de produção.
- Evidência: Frente de Caixa, App do Dono e Relatórios passaram a exibir R$ 137,84; Relatórios exibiram 12.501 comandas e R$ 125,00 em Pix.
- Commit: `b33ee06`.

## BUG-013 — Coleção financeira completa excedia a cota local do navegador

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Sintoma: a hidratação completa não substituía o cache parcial quando o volume ultrapassava a cota do navegador.
- Causa: tentativa de persistir dezenas de milhares de registros integralmente em `localStorage`.
- Correção: cache completo compartilhado em memória e persistência local limitada aos 1.000 registros mais recentes para fallback offline.
- Regressão: teste com 20.000 registros confirma leitura integral em memória, persistência limitada e limpeza consistente.
- Commit: `ff04888`.

## BUG-012 — Lançamentos financeiros distintos se sobrescreviam na fila

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Causa: a chave da fila ignorava `operation.transaction.id`.
- Correção: inclusão do ID da transação na chave de compactação.
- Commit: `fa60c91`.

## BUG-011 — Estoque inicial do produto não chegava à vitrine

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Evidência: produto criado com estoque 9 apareceu com 9 na Frente de Caixa; venda de duas unidades deixou estoque 7.
- Commit: `e1989af`.

## BUG-010 — Sessão administrativa inválida ao excluir usuário

- Severidade: **P1**.
- Status: **corrigido, publicado e retestado em produção**.
- Evidência: administrador QA excluído, lista de usuários passou de 4 para 3 e a sessão permaneceu válida.
- Commit complementar: `0a4191b`.

## Bugs anteriores

- BUG-001 a BUG-009 permanecem corrigidos conforme a rodada de 29/07/2026.
