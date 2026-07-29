# Relatório de auditoria do PDV — 29/07/2026

## Resumo executivo

**Recomendação final: Reprovado para produção (NO-GO).**

A conta administrativa local previsível e o armazenamento local de senhas foram removidos, a inicialização foi aprovada no Chrome e a regressão local chegou a 45 de 45 suítes. A liberação continua bloqueada pela ausência de homologação real de concorrência, pagamentos, banco, cozinha, impressão, dispositivos e restauração PostgreSQL.

| Indicador | Resultado |
|---|---:|
| Suítes automatizadas executadas | 45 |
| Suítes aprovadas | 45 |
| Suítes reprovadas | 0 |
| Cenários manuais/integrados formalizados | 4 |
| Cenários manuais aprovados | 1 |
| Cenários manuais reprovados | 1 |
| Cenários manuais bloqueados | 2 |
| Total de verificações contabilizadas | 40 |
| Aprovadas | 36 |
| Reprovadas | 2 |
| Bloqueadas | 2 |
| Taxa de aprovação (incluindo bloqueados) | 90,0% |
| Taxa de aprovação sobre executados | 94,7% |
| Bugs críticos encontrados | 2 |
| Bugs altos encontrados | 5 |
| Bugs médios encontrados | 2 |
| Bugs leves | 0 |

> A contagem não representa a execução integral dos centenas de cenários do prompt mestre. Hardware, integrações financeiras e múltiplos dispositivos não estavam disponíveis e foram mantidos como não testados.

## Ambiente

| Campo | Valor |
|---|---|
| Nome do sistema | PDV Lanchonete |
| Versão | Identificador de cache `20260729-02`; versão formal não informada |
| Ambiente | Desenvolvimento local / código de homologação |
| Aplicativo | Web/PWA |
| Sistema operacional | Windows; versão não informada |
| Dispositivo | Estação Codex; modelo não informado |
| Navegador | Codex In-app Browser; versão não informada |
| URL local | `http://127.0.0.1:5500/` |
| API | `https://inquppkbkmhnbtwpriuw.supabase.co` |
| Banco | Supabase/PostgreSQL, inferido pela configuração e migrações |
| Hospedagem | Vercel configurada; execução local durante a auditoria |
| Internet | Não medida |
| Impressora | Não informada |
| Maquininha | Não informada |
| Integrações | Supabase; demais não informadas |
| Data | 29/07/2026 |
| Responsável | Codex |
| Estado do repositório | Havia alterações locais pré-existentes; nenhuma foi modificada pela auditoria |

## Resultados dos testes

### Testes automatizados

Na auditoria inicial foram executados 36 arquivos `tests/*.test.mjs` com Node.js 24.15.0. Após as correções, a suíte passou a ter 37 arquivos e um executor único (`npm.cmd test`).

- 35 suítes aprovaram.
- `despesas-module.test.mjs` falhou ao esperar a transação “Troco”.
- A causa observada é dependência temporal do teste: os dados usam `transactionDate: 2026-06-15`, enquanto o filtro inicial do módulo é `period: today` e a auditoria ocorreu em 29/07/2026. O resultado não comprova erro de cálculo financeiro; comprova que a suíte deixa de ser determinística com a passagem do tempo.
- Diversas suítes emitiram aviso por ausência de `package.json` com `"type": "module"`.
- Uma execução tentou sincronizar auditoria com Supabase durante teste Node e gerou erro de importação de URL HTTPS, sem reprovar a suíte.

Reteste em 29/07/2026:

- 37 de 37 suítes aprovadas.
- Duração total registrada: 3.850 ms.
- Projeto declarado explicitamente como ES Modules.
- Testes executados em processos separados com `NODE_ENV=test`.
- Nenhum aviso `MODULE_TYPELESS_PACKAGE_JSON`.

### Inicialização web

- `index.html`: HTTP 200.
- `src/app.js?v=20260729-02`: HTTP 200, `Content-Type: text/javascript`.
- Resultado no navegador: tela “Erro ao iniciar”.
- Console: `Failed to fetch dynamically imported module: http://127.0.0.1:5500/src/app.js?v=20260729-02`.
- Reteste em 29/07/2026 no Chrome real: 5 de 5 inicializações exibiram a tela de login, sem erros de console.
- Conclusão: a falha foi específica do navegador integrado da auditoria e não foi reproduzida no navegador suportado. Foi adicionada uma regressão que percorre o grafo estático de módulos desde `src/app.js`.

### Segurança por inspeção e regra executável

- A configuração ativa usa Supabase, mas nomes de usuário sem `@` seguem pela autenticação local.
- O armazenamento inicial cria `admin / admin123`.
- A rotina de inicialização restaura a senha `admin123`, força o perfil `admin` e reativa essa conta.
- Usuários e senhas locais são persistidos sem hash em `localStorage`.
- A aplicação aceita `username` e `password` pela query string e só depois remove os parâmetros da barra de endereço.

## Bugs encontrados

| ID | Bug | Módulo | Severidade | Frequência | Impacto | Status |
|---|---|---|---|---|---|---|
| BUG-001 | Conta administrativa local previsível contorna autenticação Supabase | Autenticação | Crítico | Sempre | Acesso administrativo indevido | Aguardando reteste |
| BUG-002 | Senhas são armazenadas em texto simples no navegador | Autenticação/Usuários | Alto | Sempre | Exposição de credenciais e dados | Aguardando reteste |
| BUG-003 | Teste financeiro depende da data corrente | Testes/Financeiro | Médio | Sempre após a data fixa | Regressão deixa de detectar defeitos reais | Corrigido |
| BUG-004 | Sangria não reduzia o dinheiro esperado no fechamento | Caixa | Alto | Sempre | Divergência matemática no fechamento | Corrigido |
| BUG-005 | Repetições offline duplicavam operações na fila | Sincronização | Médio | Sempre | Tráfego repetido e reaplicação desnecessária | Corrigido |
| BUG-006 | Exigência de autorização externa incompatível com o escopo de registro | Pagamentos/Vendas | Alto | Em Pix/cartão | Impedia finalizar registros presenciais | Corrigido |
| BUG-007 | Envio automático à cozinha fora do escopo operacional | Cozinha/Impressão | Médio | Em toda venda | Criava efeitos laterais desnecessários | Corrigido |
| BUG-008 | CRM ignorava sangrias no total de saídas | Relatórios/Caixa | Alto | Sempre que havia sangria | Relatórios exibiam saldos líquidos diferentes | Corrigido |
| BUG-009 | Conteúdo armazenado era interpolado diretamente em HTML | Interface/Segurança | Alto | Ao exibir dado malicioso | Execução de script no navegador | Corrigido localmente |

## Registros detalhados

### BUG 001 — Conta administrativa local previsível contorna autenticação Supabase

**Severidade:** Crítico  
**Prioridade:** Imediata  
**Módulo:** Autenticação  
**Perfil afetado:** Todos; privilégio obtido de administrador  
**Ambiente:** Configuração com `dataProvider: supabase`  
**Versão:** `20260729-02`  
**Dispositivo:** Navegador web  
**Data e horário:** 29/07/2026  
**Pré-condições:** Aplicação inicializada com armazenamento local acessível.

**Passos para reproduzir:**

1. Inicializar a aplicação com a configuração Supabase ativa.
2. Informar o usuário `admin`.
3. Informar a senha `admin123`.
4. Submeter o login.

**Resultado esperado:** em modo Supabase, toda autenticação deve ocorrer no provedor central; não deve existir conta administrativa universal ou previsível no cliente.  
**Resultado obtido:** o serviço direciona apenas identificadores contendo `@` ao Supabase. `admin` usa a base local, cuja inicialização cria/reativa a conta, redefine a senha para `admin123` e força o perfil `admin`.  
**Frequência:** Sempre, conforme fluxo de código.  
**Impacto operacional:** controle total do PDV por pessoa não autorizada.  
**Impacto financeiro:** alteração de preços, caixa, cancelamentos, estoque e relatórios.  
**Impacto nos dados:** leitura e modificação ampla dos dados disponíveis ao cliente.  
**Evidências:** `src/services/auth.service.js`, funções `login` e `getRawUsers`; `src/services/storage.service.js`, funções `createDefaultAdminUser` e `ensureUsableAdmin`.  
**Logs relacionados:** não aplicável.  
**Registros do banco:** não acessados.  
**Possível causa:** convivência insegura entre autenticação local de desenvolvimento e autenticação Supabase.  
**Sugestão de correção:** remover completamente o fallback local de builds online; exigir Supabase para todos os usuários; eliminar conta e senha padrão; bloquear a inicialização quando a autenticação central não estiver disponível.  
**Teste de regressão:** confirmar que `admin/admin123` nunca autentica em build Supabase e que usuários legítimos, inclusive logins sem e-mail se suportados, são validados no servidor.  
**Status:** Aguardando reteste integrado em homologação. A conta automática e o desvio local no modo Supabase foram removidos em 29/07/2026.

### BUG 002 — Senhas são armazenadas em texto simples no navegador

**Severidade:** Alto  
**Prioridade:** Alta  
**Módulo:** Autenticação e administração de usuários  
**Perfil afetado:** Administrador, gerente, caixa e operador  
**Ambiente:** Web/PWA  
**Versão:** `20260729-02`  
**Dispositivo:** Navegador web  
**Data e horário:** 29/07/2026  
**Pré-condições:** Uso da administração local de usuários.

**Passos para reproduzir:**

1. Criar ou editar um usuário local.
2. Inspecionar a chave `pdv.users` no armazenamento do navegador.
3. Observar a propriedade `password`.

**Resultado esperado:** senhas nunca devem ser persistidas ou comparadas em texto simples no cliente.  
**Resultado obtido:** `createUser` e `updateUser` persistem `password`; `login` compara diretamente `user.password !== password`.  
**Frequência:** Sempre.  
**Impacto operacional:** comprometimento de todas as contas locais por acesso físico, XSS, extensão maliciosa ou backup do perfil.  
**Impacto financeiro:** uso indevido de permissões e operações de caixa.  
**Impacto nos dados:** exposição de credenciais e possível reutilização em outros serviços.  
**Evidências:** `src/services/auth.service.js` e chave `pdv.users`.  
**Logs relacionados:** não aplicável.  
**Registros do banco:** não acessados.  
**Possível causa:** autenticação local criada como persistência temporária e mantida na configuração online.  
**Sugestão de correção:** delegar autenticação ao Supabase Auth; nunca retornar ou persistir senhas; migrar/desativar usuários locais existentes.  
**Teste de regressão:** verificar armazenamento, logs, respostas e backups em busca de senha; testar troca, revogação e sessão expirada.  
**Status:** Aguardando reteste integrado. Em 29/07/2026, senhas legadas passaram a ser removidas em qualquer modo, o login local foi desativado e a gestão de credenciais ficou restrita ao Supabase Auth.

### BUG 003 — Teste financeiro depende da data corrente

**Severidade:** Médio  
**Prioridade:** Normal  
**Módulo:** Testes / Financeiro  
**Perfil afetado:** Equipe de desenvolvimento e QA  
**Ambiente:** Node.js 24.15.0  
**Versão:** estado atual do repositório  
**Dispositivo:** Windows  
**Data e horário:** 29/07/2026  
**Pré-condições:** relógio do sistema posterior a 15/06/2026.

**Passos para reproduzir:**

1. Executar `node tests/despesas-module.test.mjs`.
2. Observar a asserção `filterContainer.innerHTML.includes('Troco')`.
3. Comparar a data fixa da transação (`2026-06-15`) com o filtro padrão `today`.

**Resultado esperado:** teste determinístico, independente do dia em que é executado.  
**Resultado obtido:** falha porque o registro fixo não pertence ao período “Hoje”.  
**Frequência:** Sempre fora da data fixa.  
**Impacto operacional:** bloqueio falso de CI e perda de confiança na suíte.  
**Impacto financeiro:** indireto; defeitos reais podem ser ignorados devido a testes instáveis.  
**Impacto nos dados:** nenhum.  
**Evidências:** asserção na linha aproximada 181 de `tests/despesas-module.test.mjs`; `DEFAULT_FILTERS.period = 'today'`.  
**Logs relacionados:** `AssertionError: assert(filterContainer.innerHTML.includes('Troco'))`.  
**Registros do banco:** dados mockados no próprio teste.  
**Possível causa:** fixture fixa combinada com filtro relativo.  
**Sugestão de correção:** injetar relógio, gerar a data de hoje na fixture ou iniciar explicitamente com período que inclua 15/06/2026.  
**Teste de regressão:** executar com datas de sistema diferentes e validar filtros hoje, ontem, mês e personalizado.  
**Status:** Corrigido em 29/07/2026; a fixture passou a usar a data corrente e as 36 suítes foram aprovadas.

### BUG 004 — Sangria não reduzia o dinheiro esperado no fechamento

**Severidade:** Alto  
**Prioridade:** Alta  
**Módulo:** Caixa e fechamento  
**Perfil afetado:** Caixa, gerente e administrador  
**Ambiente:** Web/PWA  
**Versão:** `20260729-02`  
**Data e horário:** 29/07/2026  
**Pré-condições:** Caixa com saldo e permissão para movimentação.

**Passos para reproduzir:**

1. Abrir o caixa com R$ 100,00.
2. Realizar uma venda em dinheiro de R$ 16,00.
3. Registrar sangria de R$ 30,00.
4. Consultar o dinheiro esperado e fechar o caixa.

**Resultado esperado:** dinheiro esperado de R$ 86,00 (`100 + 16 - 30`).  
**Resultado obtido antes da correção:** a sangria não integrava as saídas usadas no cálculo e o sistema esperava R$ 116,00.  
**Frequência:** Sempre.  
**Impacto operacional:** fechamento indicava divergência inexistente.  
**Impacto financeiro:** risco de conferência incorreta e responsabilização indevida do operador.  
**Impacto nos dados:** resumo e fechamento inconsistentes com a movimentação registrada.  
**Evidências:** regras de `getMoneySummary`, `getTransactionSummary`, `buildClosingSummary` e `buildPaymentConference`.  
**Possível causa:** somente movimentos `saida` eram somados; `sangria` foi tratada como tipo separado sem entrar no cálculo.  
**Correção:** saídas de caixa agora incluem `saida` e `sangria` nos resumos e no fechamento.  
**Teste de regressão:** `critical-journey-integration.test.mjs` valida abertura, venda, cancelamento, sangria e fechamento em R$ 86,00.  
**Status:** Corrigido em 29/07/2026.

## Jornada crítica automatizada

O teste integrado executa e reconcilia:

- autenticação central simulada sem persistência de senha;
- abertura do caixa com R$ 100,00;
- lançamento de dez unidades em estoque/produção;
- venda de duas unidades por R$ 32,00, recebendo R$ 50,00 e devolvendo R$ 18,00;
- cancelamento repetido da mesma venda sem duplicar registro ou devolução;
- confirmação de retorno para dez unidades;
- nova venda de R$ 16,00, recebendo R$ 20,00 e devolvendo R$ 4,00;
- sangria de R$ 30,00;
- saldo esperado e contado de R$ 86,00;
- estoque final de nove unidades;
- fechamento sem divergência e trilha de auditoria.

Após a implementação, 38 de 38 suítes foram aprovadas.

## Preparação da homologação Supabase

Em 29/07/2026 foram adicionados:

- configuração local do Supabase CLI;
- seed idempotente de categorias, produtos e perfis de QA;
- produtos específicos para concorrência, estoque zerado e inatividade;
- script de reset remoto com validação tripla do project ref;
- bloqueio explícito do projeto atual `inquppkbkmhnbtwpriuw`;
- documentação de criação, vínculo, usuários e validação;
- teste automatizado das guardas de homologação.

O script foi executado contra o projeto atualmente vinculado e recusou o reset
antes de chamar a Supabase CLI, conforme esperado. Nenhuma alteração remota foi
realizada. A suíte passou a ter 39 testes aprovados.

## Sincronização e convergência offline

### BUG 005 — Repetições offline duplicavam operações na fila

**Severidade:** Médio  
**Prioridade:** Alta  
**Módulo:** Sincronização  
**Resultado esperado:** várias alterações da mesma entidade offline devem manter apenas a intenção mais recente, preservando a ordem entre entidades e entre gravação/cancelamento.  
**Resultado anterior:** cada tentativa acrescentava uma nova entrada à fila, mesmo com o mesmo ID e ação.  
**Correção:** filas de catálogo e financeiro agora compactam operações por entidade e tipo; a última intenção substitui a anterior e mantém o horário original de entrada na fila.  
**Regressão:** duas gravações e dois cancelamentos do mesmo movimento resultam em uma gravação seguida de um cancelamento. Após a reconexão, há um único registro remoto, cancelado, com os valores mais recentes.  
**Status:** Corrigido em 29/07/2026.

O reteste automatizado confirmou:

- última edição offline vence;
- gravação permanece antes do cancelamento;
- fila zera após reconexão;
- apenas um `upsert` e um cancelamento chegam ao remoto simulado;
- cache local e remoto convergem para o mesmo estado;
- marcador `syncPending` é removido;
- 40 de 40 suítes aprovadas.

A concorrência real de dois caixas vendendo `qa-ultimo-item` continua pendente até
que um projeto Supabase exclusivo de QA seja criado e vinculado.

## Segurança e idempotência de pagamentos

### BUG 006 — Venda eletrônica era finalizada sem autorização do provedor

**Severidade:** Crítico  
**Prioridade:** Imediata  
**Módulo:** Pagamentos/Vendas  
**Resultado anterior:** selecionar Pix, débito ou crédito fechava a comanda e registrava a venda como paga sem autorização externa.  
**Correção:** a venda eletrônica agora exige uma tentativa persistida e aprovada, com correspondência exata de valor e forma de pagamento. A tentativa usa chave de idempotência, mantém resultado incerto como pendente e permite consulta posterior ao provedor sem repetir a cobrança.  
**Regressão:** aprovação, recusa implícita por ausência de aprovação, chave repetida, chave divergente e queda de conexão após autorização possuem cobertura automatizada.  
**Status:** Corrigido na camada local em 29/07/2026; integração com sandbox oficial, cancelamento, estorno e pagamento dividido continuam pendentes.

Após a correção, 41 de 41 suítes foram aprovadas.

## Cozinha e impressão

### BUG 007 — Venda confirmada não gerava fila de cozinha nem impressão recuperável

**Severidade:** Alto  
**Prioridade:** Alta  
**Módulo:** Cozinha/Impressão  
**Resultado anterior:** não existiam fila de cozinha, estados de produção, trabalho de impressão, reimpressão identificada ou recuperação de falha.  
**Correção:** vendas confirmadas agora criam, de forma idempotente, um pedido de cozinha e um trabalho de impressão persistente. Falhas mantêm o job disponível para nova tentativa; trabalhos impressos não repetem automaticamente; reimpressões exigem motivo e são identificadas; cancelamentos geram evento destacado e preservam o histórico.  
**Regressão:** o teste automatizado simula impressora sem papel, nova tentativa bem-sucedida, repetição de eventos, transições da cozinha, reimpressão e cancelamento repetido.  
**Status:** Corrigido na camada local em 29/07/2026. Backend compartilhado, tela da cozinha e impressora física continuam pendentes.

Após a implementação, 42 de 42 suítes foram aprovadas.

## Reconciliação operacional

### BUG 008 — CRM ignorava sangrias no total de saídas

**Severidade:** Alto  
**Prioridade:** Alta  
**Módulo:** Relatórios/Caixa  
**Resultado anterior:** o resumo financeiro principal subtraía saídas e sangrias, enquanto o CRM subtraía apenas saídas.  
**Correção:** o CRM passou a tratar `saida` e `sangria` como fluxos de saída, seguindo a mesma regra do fechamento e do resumo monetário.  
**Regressão:** uma operação com abertura de R$ 100,00, vendas de R$ 22,00 e sangria de R$ 30,00 reconcilia saldo líquido de R$ 92,00 e dinheiro esperado de R$ 86,00.

Também foi criado um reconciliador que cruza vendas, comandas, itens, pagamentos eletrônicos e snapshots remotos. Ele identifica registros ausentes e divergências de estado, forma, quantidade e valor, com filtros por período, usuário, produto e pagamento.

Após a implementação, 43 de 43 suítes foram aprovadas.

## Segurança, carga e recuperação

### BUG 009 — Conteúdo armazenado era interpolado diretamente em HTML

**Severidade:** Alto  
**Prioridade:** Imediata  
**Módulo:** Interface/Segurança  
**Resultado anterior:** nomes e mensagens controláveis eram inseridos diretamente por `innerHTML`.  
**Correção:** foi criado escape HTML compartilhado e ele foi aplicado aos componentes e módulos que exibem dados armazenados. Notificações agora usam nós DOM com `textContent`.  
**Regressão:** payload com tag `img` e manipulador de evento permanece texto inofensivo, e uma regra estática verifica 14 arquivos críticos para impedir interpolação direta dos campos armazenados.

Os testes locais também confirmaram:

- 100 vendas sequenciais concluídas e preservadas dentro do limite local de 5 segundos;
- tentativa de cancelamento por ID negada para operador sem permissão;
- backup sem senhas, versionado e protegido por checksum;
- restauração de todas as vendas em armazenamento vazio;
- rejeição de backup adulterado sem substituir os dados válidos.

Após a implementação, 45 de 45 suítes foram aprovadas.

## Riscos para a lanchonete

- **Perda financeira e cobrança:** idempotência, bloqueio sem aprovação e recuperação após queda possuem cobertura local; pagamentos reais, estornos e sandbox do provedor ainda não foram homologados.
- **Caixa:** abertura, venda, cancelamento, sangria e fechamento foram aprovados na jornada automatizada; ainda falta homologação com múltiplos caixas e banco remoto.
- **Estoque:** serviços automatizados aprovaram; concorrência, cancelamento integrado e múltiplos dispositivos não foram validados.
- **Atendimento:** a falha de inicialização observada impede o uso do PDV no navegador testado.
- **Cozinha:** fila local, estados, falha e reimpressão possuem cobertura; tela em dispositivo separado, backend compartilhado e impressora real ainda não foram homologados.
- **Segurança:** existe risco crítico de acesso administrativo indevido e exposição de senhas.
- **Privacidade:** LGPD, segregação entre empresas, exportação, retenção e backups não foram validados.
- **Indisponibilidade:** recuperação de API, banco, energia e armazenamento cheio não foi executada.
- **Relatórios:** reconciliação local e por snapshot foi automatizada; a execução contra consultas do Supabase exclusivo de QA continua pendente.

## Funcionalidades não testadas ou bloqueadas

- Criação de empresa e configuração completa da loja.
- Jornada ponta a ponta obrigatória.
- Aplicativo/QR Code do cliente e módulo de cozinha em dispositivo separado.
- Impressora, reimpressão, falhas de papel e roteamento por setor.
- Maquininha, Pix real, pagamentos divididos, recusa, estorno e idempotência.
- Dois caixas e concorrência real.
- Offline completo, oscilação e sincronização posterior.
- Banco Supabase por consulta administrativa, integridade, backup e restauração.
- API por matriz completa de entradas inválidas, autorização, timeout e carga.
- Desempenho com 10, 50 e 100 pedidos simultâneos.
- Reinício de servidor, queda de energia, bateria e armazenamento cheio.
- Dispositivos Android/iOS reais, orientação e acessibilidade assistiva.

Motivos: ausência de credenciais e acesso administrativo ao Supabase, ausência de hardware e dispositivos, ausência de integrações de pagamento e bloqueio de inicialização no navegador de teste.

## Critérios para reteste e liberação

1. Remover a autenticação local e a conta padrão de qualquer build online.
2. Migrar usuários para autenticação central e eliminar senhas do cliente.
3. Corrigir a suíte financeira para torná-la determinística.
4. Investigar e corrigir a falha de importação do módulo principal em navegador limpo.
5. Disponibilizar ambiente isolado, credenciais de teste, acesso de leitura ao banco, dois clientes web, cozinha e simuladores de pagamento/impressão.
6. Executar a jornada obrigatória e reconciliar cada venda com pagamento, caixa, estoque, cozinha e relatórios.
7. Executar testes de segurança, concorrência, offline, recuperação e carga.

Enquanto o BUG-001 permanecer aberto, o checklist mínimo de liberação não é atendido.
