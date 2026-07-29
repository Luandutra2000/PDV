# Relatório de Execução — 29/07/2026

## Resultado final

| Métrica | Resultado |
|---|---:|
| Regressão automatizada | 46/46 aprovados |
| Cenários funcionais no navegador | 30/30 aprovados |
| Retestes dos bugs corrigidos | 7/7 aprovados |
| Bugs abertos | 0 |
| P0/P1/P2 abertos | 0/0/0 |
| Cenários externos ainda não executados | 6 |

## Ambiente validado

- Produção: `https://pdv-qdelicia.vercel.app/`
- Frontend: versão `20260729-12`, cache `pdv-v72`.
- Backend: Supabase `inquppkbkmhnbtwpriuw`.
- Navegador: Chrome controlado diretamente, com sessão autenticada real.

## Evidências principais

- Relatórios operacionais completos foram carregados com os mesmos totais do caixa.
- Fechamento reconciliou dinheiro negativo e demais formas de pagamento com diferença `R$ 0,00`; o fechamento não foi enviado.
- Estoque legado foi reconciliado de 25 para 26.
- Venda e cancelamento novos produziram baixa e estorno simétricos, terminando novamente com estoque 26.
- Venda e estorno atualizaram outra aba automaticamente, sem ação manual.
- Histórico de produção e movimentos exibiu o responsável `Luan`.
- Cancelar o pagamento manteve a Frente de Caixa e preservou a comanda.
- Payload XSS real ficou visível somente como texto; nenhum diálogo JavaScript foi disparado. O nome original foi restaurado.
- Recarregamento preservou/restaurou a sessão autenticada.
- O Service Worker respondeu HTTP 200; após novo carregamento não surgiu novo erro. O log mantinha apenas uma ocorrência transitória antiga.

## Dados de QA mantidos

- Categoria `[QA] Testes 20260729`.
- Produto `[QA] Produto 20260729`, R$ 7,35.
- Operador `[QA] Operador 20260729`.
- Produção de 30 unidades.
- Entrada R$ 10,01 e saída R$ 3,21.
- Conta R$ 12,34, marcada como paga sem mover o caixa.
- Seis vendas de R$ 7,35, sendo duas canceladas; quatro vendas permanecem ativas.

## Estado financeiro final

- Total vendido: R$ 245,40.
- Entradas: R$ 10,01.
- Saídas: R$ 469,21.
- Caixa atual: -R$ 213,80.
- Vitrine: R$ 191,10.
- Estoque QA: 26 unidades.

## Limites restantes

Ainda não foram executadas carga de 10.000 cenários/50.000 operações, sete dias simulados, restauração integral do backup em homologação, falhas de infraestrutura, matriz completa de navegadores, impressão física ou pagamentos externos.
