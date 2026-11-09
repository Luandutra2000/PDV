# Relatório final — auditoria do PDV com semana simulada

Data da auditoria: 09/11/2026. Branch: `qa/auditoria-semana-2026-11` (28 commits de correção sobre `de14187`, em duas rodadas). Banco: Supabase de produção, autorizado pelo usuário. Detalhes de ambiente e reprodução: `README.md`.

## Resumo em números

| Item | R1 (antes das correções) | R2 (depois, mesma massa) |
| --- | ---: | ---: |
| Expedientes completos (abertura → vendas → fechamento) | 7 | 7 |
| Clientes lógicos / compras principais pela interface | 200 / 200 | 200 / 200 |
| Compras com valores conferidos contra a referência | 199 (1 desvio da automação) | 200 |
| Vendas extras concluídas (fora das 200) | 6 | 9 |
| Cancelamentos pós-venda | 4 vendas + 1 movimento | 6 vendas |
| Fechamentos com diferença de dinheiro indevida | 7 de 7 (troco inicial) | 0 de 7 (D4 −22,80 é regra pendente; D5 −5,00 proposital) |
| Dias em que o servidor ficou incompleto (fila travada) | 2 (D2, D3 — recuperados após correção) | 0 |
| Vitrine final igual à referência | 11 de 13 produtos | 12 de 13 (brigadeiro +3, BUG-004) |

Totais da semana R2 (Relatórios → 7 dias), iguais à referência independente ao centavo: **R$ 7.662,10** — dinheiro R$ 3.123,90; Pix R$ 1.697,95; débito R$ 1.789,25; crédito R$ 1.051,00; 202 comandas; ticket médio R$ 37,93.

Distribuição de pagamento: o PDV não tem pagamento dividido; as 20 compras divididas foram redistribuídas (67 dinheiro, 55 Pix, 45 débito, 33 crédito). Não há descontos, acréscimos, combos, adicionais, clientes ou integração com maquininha/Pix/fiscal/impressora — registrados como não aplicáveis.

## Problemas mais importantes

1. **Fila de sincronização travava com qualquer entrada/saída de caixa** (BUG-001, P0) e **com categorias "soltas" do modal** (BUG-002, P0): no R1 as vendas dos Dias 2 e 3 ficaram só no aparelho até a correção. Corrigidos, com recuperação automática de filas já travadas.
2. **Troco inicial ignorado no fechamento** (BUG-005, P0): sobra falsa em todos os fechamentos e uma falta real de R$ 5 exibida como sobra de R$ 95. Corrigido; R2 fecha exato.
3. **Operador/caixa não enxergam o catálogo no servidor** (BUG-017, P0): o perfil operador não consegue vender. O app agora mostra o motivo e não apaga o catálogo do aparelho, mas **a correção definitiva é a migração `supabase/migrations/202611090001_allow_sellers_read_catalog.sql`, que não foi aplicada**.
4. **Tela Produtos cobria a Frente de caixa** (BUG-003, P1), **duas abas cobravam itens diferentes do exibido** (BUG-008, P1) e **reabrir o caixa perdia o troco** (BUG-010, P1). Corrigidos.
5. **Regras antes pendentes, resolvidas na segunda rodada**: estoque herdado em perdas/alertas (BUG-004), devolução de venda de outro dia (BUG-019), "Caixa atual" com Pix/cartões (BUG-012) e sangria como despesa (BUG-021). As regras adotadas estão em `bugs.md`.

Lista completa: `bugs.md` (29 itens: 26 corrigidos — 21 retestados na interface e 5 validados por teste automatizado — e 3 dependentes de migração no banco: BUG-011, BUG-017, BUG-018).

## Correções (um commit por problema)

| Commit | Bug | Teste de regressão |
| --- | --- | --- |
| `afebbe5` | BUG-001 | `tests/cash-movement-sync-order.test.mjs` |
| `0f70d6e` | BUG-002 | `tests/cash-movement-category-sync.test.mjs` |
| `544864c` | BUG-003 | `tests/produtos-inactive-route.test.mjs` |
| `778c481` | BUG-005 | `tests/cash-opening-fund-closing.test.mjs` (+ 2 testes antigos ajustados à regra documentada) |
| `d59f231` | BUG-006 | `tests/vitrine-form-draft.test.mjs` |
| `6250dc9` | BUG-007 | `tests/sync-retry-queues.test.mjs` |
| `8efbaaa` | BUG-009 | `tests/accent-strong-ink.test.mjs` |
| `7f94e72` | BUG-008 | `tests/vendas-other-tab-comanda.test.mjs` |
| `95831a5` | BUG-010, BUG-013 | `tests/cash-session-reopen.test.mjs` |
| `8523c2b` | BUG-014 | `tests/relatorios-movement-labels.test.mjs` |
| `4b11015` | BUG-015 | `tests/cancel-stale-hydrate.test.mjs` |
| `bd96a2d` | BUG-016 | `tests/frente-caixa-layout-height.test.mjs` |
| `fb232f2` | BUG-017 (app + migração não aplicada) | `tests/catalog-read-denied.test.mjs` |

Segunda rodada (pendências e regras):

| Commit | Bug | Teste de regressão |
| --- | --- | --- |
| `ad16b92` | BUG-004 | `tests/showcase-inherited-stock.test.mjs` (+ 3 testes antigos ajustados à regra da vitrine contínua) |
| `28133d2` | BUG-019 | `tests/cash-refund-earlier-sale.test.mjs` |
| `8638059` | BUG-012 | `tests/caixa-atual-gaveta.test.mjs` (+ 1 teste antigo ajustado) |
| `80ae878`, `671743d` | BUG-021 | `tests/cash-sangria-not-expense.test.mjs` |
| `1bd5ece` | BUG-011 (app + migração 202611090002 não aplicada) | `tests/cash-session-server-sync.test.mjs` |
| `9448392` | BUG-018 (migração 202611090003 não aplicada) | `tests/audit-read-migration.test.mjs` |
| `949ac26` | BUG-024 | `tests/sync-pending-indicator.test.mjs` |
| `aa1d69a` | BUG-022, BUG-027 | `tests/produtos-edit-active-relative-stock.test.mjs` |
| `06618e1` | BUG-026 | `tests/vitrine-destructive-confirm.test.mjs` |
| `050f380` | BUG-020 | `tests/comanda-number-sequence.test.mjs` |
| `0546df3` | BUG-028 | `tests/money-rounding.test.mjs` |
| `34947d5` | BUG-029 | `tests/no-native-dialogs.test.mjs` |
| `4d9a1a2` | BUG-023 | `tests/boot-loading-placeholder.test.mjs` |
| `ab3a6be` | BUG-025 | `tests/frente-caixa-layout-height.test.mjs` |

Cada teste novo foi conferido falhando sem a correção (amostragem nos de comportamento). Suíte do projeto: **94/94 antes → 120/120 depois** (`npm.cmd test`).

Reteste da segunda rodada na interface (dia isolado 24/10/2026, admin): perda de estoque herdado aceita (48 → 45); alertas pelo saldo real; sangria fora do Financeiro; Caixa atual R$ 52,50 = 100 + 7,50 − 50 − 5; cancelamento com motivo em modal; aviso "envios pendentes" durante queda simulada e limpo após sincronizar; inativar/reativar produto; confirmação em dois cliques na Vitrine; fechamento com diferença R$ 0,00. O reteste revelou que o banco de produção recusa o tipo `sangria` em `cash_movements` — corrigido no mesmo dia (`671743d`). Evidência: `evidencias/R3-reteste-correcoes.json`.

## Cobertura

`inventario-cobertura.csv`: 97 itens. 5 não aplicáveis (recursos inexistentes). Dos 92 aplicáveis: **71 executados (77,2%)** — 68 passaram e 3 falham até as migrações serem aplicadas — e **21 não cobertos**: 16 não executados e 5 bloqueados. Os não cobertos incluem: Pessoas (criar/editar usuários), Empresa (alterar identidade real), Financeiro (lançar/pagar boletos, há conta real), baixar backup, limpar histórico (destrutivo em produção), login com senha inválida, dois operadores em aparelhos diferentes, escalonamento de perfil no servidor, filtros secundários e navegação só por teclado.

## Evidências

- Interface: execução pela automação em `ferramentas/harness.mjs` (cliques, formulários e teclado numérico reais da tela) + cenários manuais com mouse (duplo clique, duas abas).
- Servidor: fotografia diária das tabelas (`dados/`, fora do Git) e consultas pela API com o token do usuário.
- Testes automatizados: arquivos citados acima.
- Inspeção estática: usada só para causa raiz e para BUG-026/027 (marcados como tal).

## Limitações

- Testes feitos **no banco de produção** (autorizado). Sem acesso administrativo ao banco: não foi possível ler o esquema real nem as políticas; 8 migrações de produção aparecem no repositório só como "placeholder", o que impede confirmar a causa do BUG-018.
- O relógio de teste altera só o navegador; o servidor grava as datas enviadas pelo app. A passagem de dia foi validada pelo app (sessão de caixa, estoque herdado, relatórios por período), não por rotinas do servidor.
- Queda de conexão simulada bloqueando as chamadas ao Supabase dentro da página; não foi uma queda real de rede.
- Concorrência entre dois aparelhos não testada (só duas abas do mesmo aparelho).
- Impressora, maquininha, Pix e emissão fiscal: inexistentes no PDV; nada validado fisicamente.
- A semana R2 foi executada antes da segunda rodada; as correções da segunda rodada foram retestadas num dia isolado, não com uma nova semana completa.
- O banco de produção diverge do repositório (constraint de `cash_movements.type`, políticas de `cash_sessions` e `audit_logs`): ver as três migrações pendentes.
- Medição de tempo: carregamento inicial ~7,6 s (rede real, cache frio). A simulação de 200 compras em uma semana **não** comprova capacidade para 200 usuários simultâneos.

## Recomendação

Para os cenários validados (venda, troco, formas de pagamento, cancelamento, vitrine, suprimento/despesa/sangria, fechamento e relatórios pelo administrador), o sistema ficou **consistente com a referência independente na reexecução R2 e no reteste**. **Não recomendo liberar para operadores** antes de:

1. aplicar as migrações `202611090001` (catálogo para operador/caixa), `202611090002` (sessão de caixa) e `202611090003` (leitura da auditoria), e repetir o login da operadora com uma venda;
2. revisar as regras adotadas na segunda rodada (`bugs.md`, "Regras adotadas") — se alguma não corresponder à operação da lanchonete, ajustar antes de publicar;
3. publicar as correções desta branch atualizando os `?v=` e o cache do service worker (os arquivos alterados mantêm a versão antiga na URL e aparelhos com PWA instalado podem continuar com o código anterior).

## Dados de teste no banco de produção

Ficaram no banco: 13 produtos e 4 categorias `qa-` (1 produto apagado no teste), 415 vendas QA (529 no total, contra 114 do backup) datadas de 25/10 a 08/11/2026, movimentos "QA …", 18 fechamentos de caixa dessas datas e registros de vitrine/auditoria correspondentes. Nada foi removido: a limpeza é destrutiva e depende da sua decisão. O backup inicial está em `backup-inicial/`.
