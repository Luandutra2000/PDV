# Bugs e achados — auditoria QA 2026-11

Ambiente de todos os achados: frontend servido localmente pelo servidor de QA (`qa-pdv/ferramentas/servidor-qa.mjs`, porta 5510) a partir da branch `qa/auditoria-semana-2026-11`, com o Supabase de produção `inquppkbkmhnbtwpriuw` (autorizado pelo usuário: sistema ainda não em uso). Execuções: **R1** (02 a 08/11/2026, relógio de teste, antes das correções) e **R2** (26/10 a 01/11/2026, mesma massa, depois das correções).

Prioridades: P0 crítico, P1 alto, P2 médio, P3 baixo. "Causa" separa o que foi confirmado no código do que é hipótese.

## Resumo

| ID | Prioridade | Título | Situação |
| --- | --- | --- | --- |
| BUG-001 | P0 | Entrada/saída de caixa trava a fila de sincronização (FK do movimento) | Corrigido e retestado |
| BUG-002 | P0 | Categoria inexistente no modal Entrada/Saída trava a fila (FK da categoria) | Corrigido e retestado |
| BUG-005 | P0 | Troco inicial ignorado no dinheiro esperado (tela Caixa e Fechamento rápido) | Corrigido e retestado |
| BUG-017 | P0 | Operador e caixa não leem o catálogo no servidor: não conseguem vender | App corrigido; **migração criada, não aplicada** |
| BUG-003 | P1 | Depois de abrir Produtos, cada venda troca a Frente de caixa pela tela Produtos | Corrigido e retestado |
| BUG-008 | P1 | Duas abas: a tela mostra uma comanda e o pagamento cobra outra | Corrigido e retestado |
| BUG-010 | P1 | Reabrir o caixa no mesmo dia perde o troco da abertura anterior | Corrigido e retestado |
| BUG-004 | P1 | Perda/consumo e indicadores da vitrine ignoram estoque herdado de dias anteriores | **Pendente — regra a decidir** |
| BUG-019 | P1 | Cancelar venda de dia anterior altera o dia original e não registra a devolução | **Pendente — regra a decidir** |
| BUG-006 | P2 | Formulário da Vitrine é apagado por sincronização em segundo plano | Corrigido e retestado |
| BUG-007 | P2 | Fila da vitrine sem nova tentativa; Atualizar não a reenviava | Corrigido e retestado |
| BUG-009 | P2 | OK da venda sob o Finalizar (duplo clique fecha a confirmação) e texto ilegível no hover dos botões | Corrigido e retestado |
| BUG-015 | P2 | Venda cancelada volta a "ativa" por ~1 s | Corrigido e retestado |
| BUG-016 | P2 | "Receber" fora da tela em janelas baixas (1024×600) | Corrigido e retestado |
| BUG-011 | P2 | Sessão de caixa (troco inicial) só existe no aparelho | Pendente |
| BUG-012 | P2 | "Caixa atual" soma Pix e cartões | Pendente — regra a decidir |
| BUG-018 | P2 | Administrador não consegue ler a auditoria no servidor | Pendente — causa não confirmada |
| BUG-021 | P2 | Sangria não tem tipo próprio e vira despesa no Financeiro | Pendente — regra a decidir |
| BUG-024 | P2 | Nenhum aviso de "sem conexão / envio pendente" na Frente de caixa | Pendente |
| BUG-013 | P3 | Modal Abrir caixa sem estilo; mensagem de caixa fechado fala só em vendas | Corrigido e retestado |
| BUG-014 | P3 | Relatórios: "Movimentações recentes" com códigos crus | Corrigido e retestado |
| BUG-020 | P3 | Número de comanda é por aparelho e se repete | Pendente |
| BUG-022 | P3 | Não existe ação para inativar produto (só o filtro "Inativos") | Pendente — sugestão |
| BUG-023 | P3 | Login estático aparece ~7,6 s antes de abrir uma sessão já ativa | Pendente |
| BUG-025 | P3 | Frente de caixa em celular (375 px) transborda | Pendente |
| BUG-026 | P3 | Cancelar lançamento e apagar linha do comparativo sem confirmação | Pendente |
| BUG-027 | P3 | Editar produto grava o estoque da vitrine como valor absoluto | Pendente — hipótese (inspeção) |
| BUG-028 | P3 | Somas de dinheiro em ponto flutuante | Observação |
| BUG-029 | P3 | Diálogos nativos (`prompt`/`alert`) em cancelamento de movimento e abertura de caixa | Pendente |

Contagem: 29 itens — 13 corrigidos e retestados (incluindo o app do BUG-017), 1 com correção de banco pendente de aplicação, 15 pendentes (4 dependem de decisão de regra).

---

## P0

### BUG-001 — Entrada/saída de caixa trava a fila de sincronização
- **Módulo:** Caixa / sincronização financeira. **Classificação:** perda de sincronização.
- **Impacto:** depois do primeiro suprimento, sangria ou despesa do dia, **todas** as vendas, o fechamento e as baixas de vitrine seguintes ficavam só no aparelho. Limpar o navegador ou trocar de aparelho perderia o dia; o App do dono e os relatórios de outros aparelhos ficavam incompletos.
- **Reprodução:** abrir caixa → registrar "+ Entrada" de R$ 50 → vender → consultar `sales` no servidor.
- **Esperado:** movimento, lançamento financeiro e vendas no servidor. **Observado (R1 D2):** 6 de 25 vendas no servidor; erro `financial_transactions_cash_movement_id_fkey`; 22 operações pendentes.
- **Causa (confirmada):** `registerCashMovement` enfileirava o lançamento financeiro antes do movimento que ele referencia; a fila é estritamente ordenada e o primeiro item falhava para sempre.
- **Correção:** `afebbe5` — movimento enfileirado primeiro; filas antigas reordenadas antes do envio. Teste `tests/cash-movement-sync-order.test.mjs`.
- **Validação:** a fila travada do R1 D2 foi destravada ao recarregar (25 vendas, movimento e fechamento no servidor). R2 D2: tudo sincronizado sem pendência.

### BUG-002 — Categoria inexistente no modal Entrada/Saída trava a fila
- **Impacto:** igual ao BUG-001. O modal oferecia nomes soltos ("Despesa operacional", "Troco", um segundo "Outros", "Retirada do dono" duplicado) que não existem em `financial_categories`.
- **Observado (R1 D3):** erro `financial_transactions_category_id_fkey`; 18 operações pendentes.
- **Causa (confirmada):** `renderCashMovementModal` concatenava categorias financeiras com uma lista legada de rótulos.
- **Correção:** `0f70d6e` — o modal lista só categorias cadastradas; categoria desconhecida vira "Outros" no lançamento; filas antigas reenviadas com "Outros". Teste `tests/cash-movement-category-sync.test.mjs`.
- **Validação:** R1 D3 destravado ao recarregar; R2 D3, D5 e D7 sincronizados.

### BUG-005 — Troco inicial ignorado no dinheiro esperado
- **Impacto:** em **todos os 7 fechamentos do R1** a conferência mostrou "sobra" igual ao troco inicial (R$ 150, 120, 100, 150, 100, 200, 150). Uma falta real de R$ 5,00 apareceu como sobra de R$ 95,00 (D5).
- **Causa (confirmada):** a tela Caixa e o Fechamento rápido passavam um "dinheiro esperado" calculado sem o troco; o App do dono somava o troco, e o modal Abrir caixa diz que ele "entra no dinheiro esperado do fechamento".
- **Correção:** `778c481`. Dois testes antigos que contavam R$ 0 com troco de R$ 100 foram ajustados para a regra documentada (contagem = troco + diferença). Teste `tests/cash-opening-fund-closing.test.mjs` confirma que as três telas concordam.
- **Validação:** R2 com diferença R$ 0,00 em D1, D2, D3, D6, D7; D5 −5,00 (proposital); D4 −22,80 (BUG-019).

### BUG-017 — Operador e caixa não leem o catálogo no servidor
- **Impacto:** logada como operadora, a Frente de caixa ficou **sem nenhum produto** e a Vitrine mostrou "Produto removido". O perfil operador/caixa não consegue vender.
- **Observado:** `products` e `categories` retornam 0 linhas para a operadora (`product_stock` retorna 27). O app marcava "sincronizado" e apagava o catálogo do aparelho.
- **Causa (confirmada no repositório):** as políticas de leitura exigem `products.view`, que só o admin possui (`products.manage` só admin e gerente). Desde `202609100001` (remoção do acesso anônimo) os demais perfis não leem o catálogo.
- **Correção no app:** `fb232f2` — lista vazia para perfil sem leitura não substitui o cache e vira erro visível ("Produtos indisponíveis: o servidor não liberou o catálogo…"). Teste `tests/catalog-read-denied.test.mjs`.
- **Correção no banco (pendente):** `supabase/migrations/202611090001_allow_sellers_read_catalog.sql` adiciona só leitura para `sales.access`, `showcase.access`, `owner_app.view` e `reports.view`. **Não foi aplicada** (exige acesso administrativo ao banco e decisão sua). Depois de aplicar, repetir o login da operadora e uma venda.

## P1

### BUG-003 — Tela Produtos cobre a Frente de caixa
- **Observado (R1 D7):** após alterar o preço do café em Produtos, a venda seguinte foi gravada mas a confirmação sumiu e a tela virou Produtos; as 12 vendas seguintes da automação falharam e o caixa foi fechado com o dia incompleto (reaberto depois).
- **Causa:** ouvintes de catálogo/estoque da tela Produtos redesenhavam a área de trabalho sem checar a rota ativa.
- **Correção:** `544864c`. Teste `tests/produtos-inactive-route.test.mjs`. **Validação:** R2 D7 sem erros depois de visitar Produtos.

### BUG-008 — Duas abas no mesmo aparelho
- **Observado (R1 D6):** a aba A mostrava 1 item (R$ 5,55); o pagamento cobrou R$ 11,10 porque a aba B tinha somado uma unidade à mesma comanda.
- **Causa:** a comanda ativa é compartilhada pelo armazenamento local e cada aba só redesenhava a própria.
- **Correção:** `7f94e72` — escuta o evento `storage`, redesenha comanda e pagamento e avisa. **Validação R2:** as duas abas passaram a mostrar o mesmo conteúdo e o mesmo total. Limitação: continua sendo uma única comanda por aparelho; dois operadores no mesmo aparelho devem usar uma aba.

### BUG-010 — Reabertura perde o troco anterior
- **Observado (R1 D7):** caixa aberto com R$ 150, fechado e reaberto com R$ 0; o segundo fechamento (cumulativo) considerou troco R$ 0.
- **Correção:** `95831a5` — o valor da reabertura é somado ao troco anterior e a sessão guarda o fechamento de origem. **Validação:** 50 + 10 = 60; fechamento exato.

### BUG-004 — Estoque herdado ignorado em perdas e indicadores (regra a decidir)
- **Observado (R1 e R2, D7):** perda de 3 brigadeiros recusada ("maior que a sobra disponível") com 48 na vitrine; App do dono alertou "restam 1"; "Vitrine estimada" R$ 0,00.
- **Causa:** sobra, perdas, alertas e conferência do fechamento usam só a produção **do dia** (especificação de 21/05), mas o estoque da vitrine passa de um dia para o outro (vendas baixam o saldo real).
- **Pendência:** decidir se a vitrine é diária (sobras devem ser baixadas no fechamento) ou contínua (perdas e alertas devem usar o saldo real). Alternativa operacional hoje: ajustar o estoque em Produtos → Editar.

### BUG-019 — Cancelamento de venda de outro dia (regra a decidir)
- **Observado:** EXT-05 (R$ 22,80 em dinheiro, Dia 3) cancelada no Dia 4: o Dia 3 deixou de contá-la depois de fechado, e a devolução não entrou no Dia 4 (diferença −R$ 22,80 na gaveta).
- **Pendência:** definir se o cancelamento posterior deve gerar uma saída de devolução no dia do cancelamento.

## P2

- **BUG-006 — Formulário da Vitrine apagado.** Reproduzido: produto e quantidade preenchidos foram zerados por um evento de vitrine. Causa: redesenho integral da tela. Correção `d59f231` (rascunho no estado da tela). Validação: R2 sem lançamentos perdidos.
- **BUG-007 — Fila da vitrine sem nova tentativa.** Após queda simulada, financeiro sincronizou e a vitrine ficou pendente até a próxima venda. Correção `6250dc9`. Validação R2: "Atualizar" sincronizou financeiro e vitrine.
- **BUG-009 — OK sob o Finalizar e hover ilegível.** O OK ocupa a posição do "Finalizar venda"; o 2º clique fechava a confirmação com o troco. No hover, texto #1C2331 sobre #0F172A (~1,1:1) em todos os botões principais com a cor secundária da empresa. Correção `8efbaaa`. Validação: confirmação permanece; contraste 17,85:1.
- **BUG-015 — Cancelada volta a ativa por ~1 s.** Medido: c→a→c entre 0,9 s e 1,8 s após cancelar. Causa: leitura remota iniciada antes do cancelamento sobrescrevia o cache. Correção `4b11015`. Validação: status contínuo "cancelada".
- **BUG-016 — Receber fora da tela.** Em 1024×600 o botão ficava a 1.340 px. Correção `bd96a2d`. Validação: visível em 1024×600 e 1366×768.
- **BUG-011 — Sessão de caixa só no aparelho.** `cash_sessions` vazia no servidor; o troco inicial não chega ao App do dono em outro aparelho.
- **BUG-012 — "Caixa atual" soma Pix e cartões.** Ex.: R$ 1.414,35 exibido com R$ 759,70 na gaveta. Decidir o rótulo ou a fórmula.
- **BUG-018 — Auditoria ilegível para o admin.** Insert retorna 201, select retorna 0 (também 0 no backup inicial). Hipótese: política de leitura de produção diferente do repositório (8 migrações "placeholder" sem conteúdo). Requer acesso administrativo ao banco.
- **BUG-021 — Sangria vira despesa.** O app não tem tipo "sangria" na interface; registrada como Saída, entra como despesa (R$ 500 de "Retirada do dono" na semana) e o saldo do Financeiro fica negativo.
- **BUG-024 — Sem aviso de envio pendente.** Durante a queda simulada, a Frente de caixa não indicou nada; o estado só aparece em Caixa/Suporte.

## P3

- **BUG-013** (corrigido `95831a5`): modal Abrir caixa sem espaçamento; mensagem "antes de registrar vendas" também para entradas/saídas.
- **BUG-014** (corrigido `8523c2b`): "Movimentações recentes" mostrava "dinheiro"/"debito" como descrição e "outros-financeiro" como categoria.
- **BUG-020:** comanda nº 1 existe em 09/11 (venda real) e em 02/11 (QA): a numeração é por aparelho; referências por número são ambíguas.
- **BUG-022:** há filtro "Inativos", mas nenhuma ação para inativar; a única saída é apagar.
- **BUG-023:** ~7,6 s com o formulário de login estático visível antes de abrir uma sessão já ativa.
- **BUG-025:** Frente de caixa em 375 px corta cabeçalho e cartões (o celular abre por padrão o App do dono).
- **BUG-026:** "Cancelar" lançamento e "apagar linha do comparativo" agem sem confirmação.
- **BUG-027 (hipótese):** a edição de produto grava o estoque da vitrine como valor absoluto lido ao abrir o formulário; uma venda feita em outro aparelho nesse intervalo seria sobrescrita.
- **BUG-028:** somas como 621.9999999999999 nos serviços; telas e fechamento arredondam, sem diferença observada.
- **BUG-029:** motivo do cancelamento de movimento por `window.prompt` e erro de abertura por `window.alert` (bloqueiam a tela, fora do visual).
