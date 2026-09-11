# Auditoria de campo do PDV — 10/09/2026

## Decisão

O sistema abre e os fluxos principais da aba correta respondem, mas não está pronto para operação de campo sem controle. Os bloqueios são de segurança do banco, consistência de caixa/estoque e reconstrução das migrations. A recomendação é corrigir os itens P0/P1 antes de liberar vendas reais.

## Escopo e identificação

- Repositório: `Luandutra2000/PDV`.
- Branch auditada: `feature/fechamento-caixa`, commit inicial `aae0725a830152117a8543ac8745bee60639b223`; correções locais concluídas nos commits `f3b7602` e `7bd02bf`.
- Deployment correto informado pelo usuário: [PDV Lanchonete na Vercel](https://pdv-git-feature-fechamento-caixa-luandutra2000s-projects.vercel.app/).
- Supabase: projeto `inquppkbkmhnbtwpriuw`, configurado em `supabase/config.toml` e no runtime publicado.
- O sistema é um PDV web/PWA com frente de caixa, comanda, pagamentos, entradas/saídas, fechamento, vitrine/estoque, financeiro, CRM, usuários e sincronização Supabase.

O alinhamento técnico está correto para o deployment auditado: o frontend publicado usa o Supabase do projeto `inquppkbkmhnbtwpriuw`. Há, porém, uma divergência de governança: a branch padrão do GitHub continua sendo `codex/piloto-online-supabase-netlify`, enquanto esta versão está na branch `feature/fechamento-caixa`. A Vercel precisa manter explicitamente esta branch como fonte de produção até que a política seja definida.

Uma requisição sem a sessão do navegador foi redirecionada para a proteção da Vercel (`302` e depois `Login – Vercel`). A sessão autenticada do navegador abriu a aplicação normalmente; isso limita apenas a automação externa sem sessão.

## Evidências frescas

### Código

- `npm.cmd test`: **56 aprovados, 0 reprovados** após as correções. A falha original em `tests/despesas-module.test.mjs:185` era causada por data UTC usada como data local.
- `npm.cmd run test:startup`: **76 módulos carregados**.
- `supabase/migrations`: **26 arquivos**; o inventário estático identificou **9 marcadores/placeholders**.
- O código corrigido está versionado nos commits `f3b7602` e `7bd02bf`; os documentos de auditoria, plano e especificação também estão versionados.

## Correções aplicadas no código

- O Financeiro agora usa a data local para o filtro `Hoje`; lançamentos feitos no fim do dia não desaparecem por deslocamento UTC.
- Lançamentos financeiros marcados para movimentar o caixa aparecem no CRM e no fechamento uma única vez, junto das vendas e movimentos de caixa.
- A hidratação do Supabase lê cada tabela de forma isolada, preserva cache local e filas pendentes quando uma tabela falha, usa o JWT da sessão no REST e limpa o histórico local junto com a exclusão remota.
- O adapter de fechamento preserva totais, pagamentos, diferenças, operador e observação no round-trip local/remoto.
- Foram adicionadas migrations para revogar políticas `anon`, manter acesso somente autenticado, impedir elevação de papel e corrigir a migration de colunas legadas.
- O endpoint `admin-users` agora exige `users.manage` para alterar perfil ou ativação de usuário.

As correções estão validadas localmente, mas as migrations ainda precisam ser aplicadas ao projeto Supabase e a branch precisa ser publicada na Vercel antes do reteste ao vivo.

### Interface da aba correta

| Fluxo verificado | Resultado observado |
|---|---|
| Frente de Caixa | Abriu com produtos, comanda vazia, resumo e ações do caixa. |
| Busca | Buscar `Coxinha` filtrou o catálogo e limpar restaurou a lista. |
| Categorias | `Todos`, `Mais vendidos`, `Favoritos`, `Bebidas`, `Assados`, `Fritos` e `Empada` responderam; categorias sem itens exibiram mensagem vazia. |
| Comanda | Adicionar, `+`, `-`, `x` e limpar atualizaram quantidade e subtotal. |
| Estoque zero | O produto com estoque `0` foi adicionado, exibindo aviso; o aviso não bloqueia a montagem da comanda. |
| Recebimento | Modal abriu; Dinheiro, Débito, Crédito e Pix alternaram; cancelamento preservou os dados. |
| Entrada e saída | Modal abriu e o salvamento sem valor/descrição mostrou `Preencha este campo.`; nenhum lançamento foi salvo. |
| Fechamento rápido | Resumo, Pagamentos e Vitrine abriram. A Vitrine informou zero lançado hoje e **39 registros vendidos sem estoque**. |
| Perda/Consumo | Sem vitrine lançada, bloqueou o registro e explicou o pré-requisito. |
| App do Dono | Inicio, Caixa, Vitrine, CRM, Financeiro e Fechar abriram. |
| Tema e atualização | Alternância de tema e Atualizar responderam sem quebra visível. |

Na rodada de simulação ao vivo desta auditoria foram criados registros de teste identificáveis por horário e/ou descrição QA: Comanda 0001 (Trouxinha de Frango, R$ 13,00, dinheiro, 20:58), lançamento de produção de Empada de Queijo (1 unidade, R$ 9,00, 20:59), entrada e saída financeiras de R$ 0,01 com descrições `QA-AUDITORIA-20260910 entrada` e `QA-AUDITORIA-20260910 saída`, e um fechamento observado às 21:10. O produto temporário `[QA-AUDITORIA-20260910] Produto` foi criado por R$ 0,01 e excluído em seguida; o catálogo voltou a 15 produtos.

## Problemas encontrados

### Reteste ao vivo do menu lateral

Na sessão autenticada, as 11 opções da imagem abriram: Frente de Caixa, Vitrine, Histórico de Transações, Produtos, Pessoas, Fechar Caixa/CRM, Financeiro, Relatórios, App do Dono, Design de Layout e Suporte. Os modais de novo produto, nova categoria, novo usuário, entrada financeira, saída financeira e boleto abriram; os testes vazios foram cancelados ou mostraram validação.

O reteste atualizou os números operacionais: Produtos mostrou 15 produtos, 10 zerados e 43 vendas sem estoque após a venda QA. Ao mesmo tempo, o cadastro de Produtos mostrou estoque 61 para Hamburguer, 10 para KI-Coco, 44 para Risole e 10 para Pastel Gaucho, enquanto a Frente de Caixa continuou exibindo esses produtos como estoque 0. Isso indica divergência de cache ou de fonte de estoque entre módulos.

### Simulação ao vivo de uma semana (14 horas/dia)

O filtro `Semana` abriu e agregou o período sem erro. Como o sistema não oferece data retroativa no fluxo de venda, a simulação foi executada como canário de operação no dia corrente, cobrindo os pontos de uma jornada: venda em dinheiro, aviso de estoque zero, lançamento de produção, entrada, saída, fechamento e exclusão controlada de um produto QA. O sistema não permite, pela interface, fabricar 7 dias históricos sem alterar o relógio ou inserir dados diretamente no banco; por isso não foi feita uma carga artificial de 98 horas.

Resultados observados:

- **Venda/pagamento:** Comanda 0001 finalizada; total vendido e caixa passaram de R$ 31,00 para R$ 44,00. A forma Dinheiro foi registrada e o histórico mostrou a venda.
- **Estoque/vitrine:** lançamento de Empada de Queijo aceito; estoque da vitrine passou de 0 para 1 e a produção apareceu às 20:59. O lançamento permanece no histórico como registro de teste.
- **Financeiro:** os dois formulários exibiram `Lançamento salvo`, mas a hidratação publicada não refletiu os registros no resumo. O caso foi coberto por regressão local de cache, fila e fonte única do caixa.
- **Fechamento:** com R$ 44,00 contado e diferença R$ 0,00, o toast confirmou o fechamento; o histórico exibe a diferença geral, por isso `R$ 0,00` significa caixa conferido, não total bruto de vendas. O adapter foi reforçado para preservar os valores completos.
- **Exclusão:** o produto QA foi apagado; a contagem retornou de 16 para 15 sem tocar nos 15 produtos existentes.

Os logs do navegador também registraram avisos de falha ao sincronizar `pdv.transactions` e `pdv.closedComandas` com o Supabase durante a atualização.

O Fechar Caixa/CRM desktop mostrou dinheiro esperado de R$ 31,00 e os mesmos R$ 31,00 vendidos. O botão Fechar do App do Dono abriu outro fechamento com dinheiro `-R$ 47,00`, Pix `R$ 485,00` e cartão `R$ 1.047,00`. A diferença entre as duas telas é reproduzível e impede confiar no fechamento móvel.

Suporte abriu apenas a mensagem `Modulo preparado para a proxima etapa.`; não há conteúdo de ajuda ou atendimento funcional.

### P0 — dados operacionais expostos ao papel anônimo — migration criada, publicação pendente

Usando somente a chave pública publicada, sem sessão, a API Supabase retornou `HTTP 200` com linhas de `sales`, `cash_movements` e `financial_transactions`. O migration [202606030002_restore_anon_online_sync.sql](../../supabase/migrations/202606030002_restore_anon_online_sync.sql:29) também cria políticas `select`, `insert` e `update` para `anon` em tabelas operacionais.

Isso permite leitura e, conforme os privilégios efetivos, pode permitir escrita sem autenticação. A chave `anon` ser pública é normal; o problema é a autorização do banco. A migration `202609100001_secure_authenticated_online_sync.sql` revoga os policies/grants `anon` e mantém o acesso para `authenticated`; ela ainda precisa ser aplicada no Supabase.

### P0 — elevação de privilégio no gerenciamento de usuários — corrigido no código, publicação pendente

O teste isolado original mostrou que um operador com `users.edit` conseguia enviar atualização do próprio perfil para `role=admin` e receber `HTTP 200`. O Edge Function agora exige `users.manage` para papel/ativação e a migration `202609100002_fix_profile_role_escalation.sql` restringe a escrita direta; falta aplicar e retestar remotamente.

### P1 — fechamento mostra valores incompatíveis — mitigado no código, reteste publicado pendente

Na tela do App do Dono, o resumo exibiu total vendido de `R$ 31,00`, enquanto Fechar Caixa exibiu valores incompatíveis. A fonte de sessão do caixa agora inclui movimentos financeiros marcados para caixa e o cache remoto não substitui dados locais em falhas parciais. É necessário retestar a branch publicada com os dados reais do projeto.

### P1 — estoque publicado está zerado e há vendas sem estoque

Todos os produtos visíveis na Frente de Caixa estavam com `Estoque 0`/`Sem estoque`. O fechamento rápido mostrou 39 registros vendidos sem estoque e nenhum lançamento de vitrine no dia. Hoje o sistema avisa, mas permite continuar montando e recebendo uma comanda sem estoque.

### P1 — migrations não reproduzem integralmente o ambiente — migration crítica corrigida

O migration [202606030004_align_remote_sales_schema.sql](../../supabase/migrations/202606030004_align_remote_sales_schema.sql:4) referenciava `comanda_id` e `comanda_number`, embora o próprio arquivo crie `command_id` e `command_number`. O replay agora usa `information_schema` e SQL dinâmico somente quando as colunas legadas existem.

Também não há criação versionada completa, nos arquivos locais, para tabelas/RPCs usados pelo app como `product_stock`, `showcase_movements`, `out_of_stock_sales`, `adjust_showcase_stock`, `process_showcase_production` e `process_showcase_sale`. A estrutura remota respondeu às consultas, mas não está toda representada no Git.

### P2 — riscos de interface e regras identificados na revisão estática

- Rerender de campos durante digitação pode perder foco em fechamento/CRM e busca de produtos.
- Listeners do módulo de Produtos podem rerenderizar ou navegar quando outro módulo está aberto.
- Google login, recuperar senha e cadastrar conta aparecem sem fluxo funcional ligado.
- Suporte aparece como módulo preparado para etapa futura.
- A ação de apagar comparativo usa permissão diferente da exigida pelo serviço.
- Limpeza de histórico e filas financeiras merecem proteção adicional contra exclusão/substituição concorrente.
- Cancelamento de venda e lançamento financeiro precisam ser verificados juntos para não deixar saldo órfão.

## Limitações da auditoria

Não foram certificados impressora, gaveta, Pix real, cartão/maquininha, leitores físicos, múltiplos dispositivos, offline prolongado, backup/restauração, replay real das migrations, logs de produção ou todas as escritas remotas. A proteção da Vercel impediu chamadas automatizadas sem sessão. A conexão MCP do Supabase está configurada para este projeto, mas a sessão administrativa já aberta não permitiu uma nova operação de inventário sem risco de concorrência.

Na tentativa seguinte de percorrer o menu da imagem ao vivo, a sessão autenticada já havia expirado e o deployment abriu no login. O inventário estático confirma rotas para Frente de Caixa, Vitrine, Histórico, Produtos, Pessoas, Fechar Caixa/CRM, Financeiro, Relatórios, App do Dono e Design de Layout; `Suporte` aparece no menu, mas não possui rota em `src/app.js`.

## Ordem de correção

1. Aplicar `202609100001_secure_authenticated_online_sync.sql` e `202609100002_fix_profile_role_escalation.sql` no Supabase do PDV.
2. Publicar os commits `f3b7602` e `7bd02bf` na branch usada pela Vercel e repetir o canário com registros identificados.
3. Retestar cada tabela com anon, usuário autenticado e perfis reais; confirmar que o operador não promove usuário.
4. Gerar baseline/replay em banco de homologação vazio e conferir as migrations ainda não representadas no Git.
5. Depois disso, executar canário de campo com hardware e meios de pagamento reais.

## Referência anterior

A varredura de alinhamento GitHub/Vercel/Supabase está em [docs/VARREDURA_PDV_2026-09-10.md](../VARREDURA_PDV_2026-09-10.md).
