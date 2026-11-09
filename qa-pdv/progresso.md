# Progresso da auditoria QA

Atualizado em 09/11/2026 (relógio real).

## Fase atual

Concluídas: reconhecimento, backup, inventário, semana R1 (antes), correções, semana R2 (depois), testes dedicados, permissões, relatórios, **segunda rodada de correções (pendências e regras) e reteste em 24/10/2026**. Pendente de ação do usuário: aplicar as migrações 202611090001/0002/0003, revisar as regras adotadas, publicar, decidir sobre os dados de teste.

## Contagens

| Item | R1 | R2 |
| --- | ---: | ---: |
| Compras principais pela interface | 200 | 200 |
| Compras conferidas | 199 | 200 |
| Vendas extras | 6 | 9 |
| Cancelamentos | 4 vendas + 1 movimento | 6 vendas |
| Fechamentos | 8 (1 prematuro, BUG-003) | 7 + 3 no dia de testes 25/10 |
| Correções aplicadas | 3 durante a execução | 28 commits no total (2 rodadas) |
| Testes do projeto | 94/94 | 120/120 |

## Desvios de execução (não são defeitos do PDV)

- R1 D1: um lançamento de 10 QA Misto Quente não entrou (formulário apagado pelo BUG-006). Estoque final do dia igual.
- R1 D1: a conferência automática da CLI-001 leu outra "comanda 1" (BUG-020); a venda foi conferida manualmente (R$ 61,00, troco R$ 39,00).
- R1 D4: CLI-073 registrada com 4 cafés em vez de 5 (clique perdido pela automação). Total real R$ 105,00. Explica +1 café e +R$ 4,50 no R1.
- R1/R2 D6: EXT-09a/b (disputa da última unidade) virou uma venda de 2 unidades (comanda compartilhada entre abas). Efeito financeiro e de estoque igual ao previsto.
- R1 D7: fechamento prematuro causado pelo BUG-003; caixa reaberto e dia completado; segundo fechamento cumulativo.

## Cenários executados manualmente (fora da automação)

| Cenário | R1 | R2 | Evidência |
| --- | --- | --- | --- |
| Venda sem conexão (CLI-107) + Atualizar | vitrine ficou pendente | tudo enviado | `evidencias/` |
| Recarregar com pagamento aberto (CLI-115) | comanda preservada, sem duplicidade | idem | `evidencias/` |
| Duplo clique real em Finalizar (CLI-139, CLI-156) | 1 venda; confirmação fechada | 1 venda; confirmação visível | `evidencias/` |
| Duas abas, última unidade (EXT-09) | tela ≠ cobrança | tela = cobrança | `evidencias/` |
| Alterar preço (EXT-10) e vender | tela Produtos cobriu as vendas | ok | `transacoes.csv` |
| Reabertura de caixa + cancelamento medido (EXT-13/14/15) | — | troco somado; status estável | `evidencias/` |
| Apagar produto com vendas (EXT-16) | — | histórico preservado | `evidencias/` |
| Permissões da operadora | — | bloqueios ok; catálogo negado (BUG-017) | `evidencias/` |

## Ponto de retomada

- Base: Supabase de produção `inquppkbkmhnbtwpriuw`; backup inicial em `qa-pdv/backup-inicial/` (fora do Git).
- O painel do navegador ficou logado como administrador.
- Relógio de teste já restaurado para o horário real no navegador (`window.__QA_CLOCK__.reset()`).
- Reteste da segunda rodada: dia 24/10/2026 (caixa aberto com R$ 100 e fechado com diferença zero).
- Próximos passos: aplicar as migrações `202611090001`, `202611090002` e `202611090003`; repetir login da operadora e uma venda; revisar as regras adotadas; publicar com atualização de `?v=` e do cache do service worker; limpar dados de teste se desejado.
