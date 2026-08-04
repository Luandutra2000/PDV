# Relatório de Execução — 04/08/2026

## Resultado

| Métrica | Resultado |
|---|---:|
| Regressão automatizada | 47/47 aprovados |
| Carga em produção | 50.000/50.000 gravações confirmadas |
| Conjuntos completos | 12.500 comandas + itens + vendas + itens |
| Bugs de escala encontrados | 2 P1 |
| Bugs de escala corrigidos e retestados | 2/2 |
| HTTP de produção | 200 |
| Versão validada | `20260804-06` / `pdv-v79` |
| Exclusão administrativa | aprovada; 4 → 3 usuários, sem erro de sessão |

## Ambiente

- Produção: `https://pdv-qdelicia.vercel.app/`.
- Deploy final pós-limpeza: `dpl_EAKd9aZapN7xrAA63zEsTJHN7JoJ`, estado `READY`.
- GitHub: branch `feature/fechamento-caixa`, commit funcional `b33ee06`.
- Backend: Supabase em produção.
- Navegador: navegador real integrado ao Codex, com sessão administrativa autenticada.
- Backup pré-carga: `backups/production-2026-08-04-pre-50k`.
- Cobertura do backup: 23 tabelas públicas/RLS, 592 registros e checksums. Não equivale a um dump administrativo integral das tabelas protegidas.

## Carga autorizada em produção

- Identificador: `qa50k-20260804a`.
- 12.500 registros em `commands`.
- 12.500 registros em `command_items`.
- 12.500 registros em `sales`.
- 12.500 registros em `sale_items`.
- Total: 50.000 gravações, verificadas após cada estágio.
- Progressão: 1.000, 10.000 e 50.000 operações acumuladas.
- Tempos dos estágios: 1.015 ms, 835 ms e 2.241 ms; maior latência de lote observada: 177 ms.
- Valor adicional controlado: R$ 125,00 em Pix (12.500 vendas de R$ 0,01).
- Manifesto: `backups/load-tests/qa50k-20260804a.json`.
- Os dados da carga foram removidos seletivamente após a aprovação do usuário. A verificação final retornou zero registros do identificador `qa50k-20260804a`.

## Validação no navegador após as correções

- Frente de Caixa: total vendido R$ 137,84 e caixa atual R$ 145,75.
- App do Dono: total vendido R$ 137,84, caixa atual R$ 145,75 e feed contendo as vendas marcadas com `[LOAD qa50k-20260804a]`.
- Relatórios: 12.501 comandas fechadas, Pix R$ 125,00 e Dinheiro R$ 12,84.
- Produto do teste: 12.502 unidades e faturamento de R$ 137,84, conciliando as 12.500 unidades da carga com as 2 unidades da venda funcional anterior.
- Categoria do teste: 12.502 unidades e R$ 137,84.
- Sessão autenticada permaneceu válida durante recargas e troca de módulos.

## Bugs descobertos pela carga e correções

1. O Supabase limita cada resposta a 1.000 linhas. A hidratação passou a paginar todas as coleções financeiras (`336abf7`).
2. Coleções completas ultrapassavam a cota do `localStorage`. O sistema agora mantém o conjunto completo em memória e persiste apenas um recorte seguro para fallback offline (`ff04888`).
3. O cliente REST efetivamente usado em produção não implementava paginação. Foi adicionado `selectRange`, com teste específico do caminho real (`b33ee06`).

## Evidências funcionais anteriores mantidas

- Estoque de produto sincronizado com a vitrine e baixa única por venda.
- Entrada, saída, venda e cancelamento conciliados entre abas.
- Fila financeira sem sobrescrever lançamentos distintos.
- Exclusão administrativa por diálogo interno, sem invalidar a sessão.
- Layout verificado em 375×812 e 768×1024.
- Segurança, XSS, permissões, convergência offline, realtime e jornada crítica cobertos pela suíte.

## Limpeza pós-teste

- Removidas as 50.000 gravações da carga `qa50k-20260804a` em ordem segura de dependência.
- Removidos também todos os dados funcionais marcados como QA: 3 produtos, 2 categorias, 8 vendas, 8 comandas, 5 movimentos de caixa, 6 transações financeiras, 2 lançamentos de produção, 3 saldos de produto e 11 movimentos de vitrine.
- A conferência final retornou zero registros QA nas tabelas verificadas.
- O endpoint administrativo temporário usado para os registros protegidos foi removido e a aplicação normal foi republicada.
- Validação final no navegador: caixa, vitrine estimada, total vendido, entradas e saídas em R$ 0,00; categorias e produtos `[QA]` ausentes.

## Limites ainda pendentes

- Restauração integral de backup em ambiente isolado.
- Impressão física, gaveta, leitor, balança e pagamentos externos reais.
- Matriz completa de navegadores e dispositivos físicos.

## Parecer

A carga de 50.000 operações foi concluída em produção e revelou dois defeitos P1 de leitura em escala. Ambos foram corrigidos, publicados e validados no navegador com totais exatos. O software está aprovado para piloto controlado; a liberação irrestrita ainda depende dos testes físicos e de recuperação listados acima.
