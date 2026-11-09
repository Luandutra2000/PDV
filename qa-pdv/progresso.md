# Progresso da auditoria QA

Atualizado em 09/11/2026 (relógio real).

## Fase atual

Concluídas: reconhecimento, backup, inventário, semana R1 (antes), correções, semana R2 (depois), testes dedicados, permissões de operador, relatórios. **Pendente de decisão do usuário:** aplicar a migração do BUG-017, decidir as regras pendentes, limpar ou manter os dados de teste em produção, publicar.

## Contagens

| Item | R1 | R2 |
| --- | ---: | ---: |
| Compras principais pela interface | 200 | 200 |
| Compras conferidas | 199 | 200 |
| Vendas extras | 6 | 9 |
| Cancelamentos | 4 vendas + 1 movimento | 6 vendas |
| Fechamentos | 8 (1 prematuro, BUG-003) | 7 + 3 no dia de testes 25/10 |
| Correções aplicadas | 3 durante a execução | 14 commits no total |
| Testes do projeto | 94/94 | 107/107 |

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
- O painel do navegador ficou logado como a operadora (Patricia). Para novos testes de administrador, sair e entrar como admin.
- Relógio de teste ativo no navegador (25/10/2026). Para voltar ao relógio real: `window.__QA_CLOCK__.reset()` e recarregar.
- Próximos passos: aplicar a migração `202611090001`, repetir login da operadora e uma venda; decidir BUG-004/012/019/021; publicar com atualização de `?v=` e do cache do service worker; limpar dados de teste se desejado.
