# Plano priorizado de correções da auditoria

Data: 29/07/2026  
Objetivo: eliminar os bloqueios de produção encontrados na auditoria e preparar o PDV para uma nova rodada de testes integrados.

## Ordem de execução

### P0 — Bloqueadores imediatos

#### TASK-001 — Remover o acesso administrativo local padrão

**Origem:** BUG-001  
**Prioridade:** P0 — iniciar imediatamente  
**Status:** Implementada; aguardando reteste integrado em homologação  
**Risco tratado:** acesso administrativo indevido  
**Dependências:** nenhuma

**Trabalho:**

- Remover a criação automática de `admin/admin123`.
- Remover a rotina que redefine a senha, reativa o usuário e força o perfil administrador.
- Impedir autenticação local quando `dataProvider` for `supabase`.
- Garantir que todos os logins do ambiente online sejam validados pelo Supabase, inclusive nomes sem `@`, caso continuem suportados.
- Fazer a aplicação falhar de forma segura quando o serviço de autenticação estiver indisponível.

**Critérios de aceite:**

- `admin/admin123` não autentica em instalação limpa nem em instalação atualizada.
- Limpar o armazenamento do navegador não recria uma conta administrativa.
- Alterar manualmente `pdv.users` não concede uma sessão válida no modo Supabase.
- Usuário inativo, token expirado e usuário inexistente não acessam áreas internas.
- Rotas e operações administrativas exigem autorização validada no servidor.

**Testes obrigatórios:**

- Instalação limpa e atualização com dados antigos.
- Login local, login Supabase, usuário inativo e sessão expirada.
- Tentativa de promover o próprio perfil pelo navegador.
- Acesso direto a módulos e operações administrativas.

---

#### TASK-002 — Eliminar senhas em texto simples e migrar usuários

**Origem:** BUG-002  
**Prioridade:** P0  
**Status:** Implementada; aguardando reteste integrado em homologação  
**Risco tratado:** exposição de credenciais  
**Dependências:** TASK-001

**Trabalho:**

- Remover `password` de usuários, sessões, armazenamento local, logs e respostas.
- Fazer criação, alteração e recuperação de senha somente pelo Supabase Auth.
- Criar migração segura para instalações que já possuem `pdv.users`.
- Invalidar sessões locais antigas.
- Não reutilizar automaticamente a senha local na migração.

**Critérios de aceite:**

- Nenhuma senha aparece em `localStorage`, `sessionStorage`, IndexedDB, logs ou filas de sincronização.
- APIs e funções administrativas nunca retornam senha.
- Senha antiga deixa de funcionar após alteração.
- Sessões antigas são revogadas após a migração.
- Fluxo de recuperação de senha funciona sem revelar se uma conta existe.

**Testes obrigatórios:**

- Busca automatizada por campos e valores de senha.
- Criação, alteração, recuperação e revogação.
- Atualização de uma instalação com dados locais antigos.
- Inspeção de logs, rede e armazenamento do navegador.

---

#### TASK-003 — Corrigir a falha de inicialização em navegador limpo

**Origem:** bloqueio da auditoria web  
**Prioridade:** P0  
**Status:** Validada; falso positivo do navegador integrado, Chrome aprovado em 5 de 5 inicializações  
**Risco tratado:** impossibilidade de operar o PDV  
**Dependências:** nenhuma

**Trabalho:**

- Reproduzir o erro de importação de `src/app.js`.
- Identificar qual importação transitiva, cache ou política do navegador provoca a falha.
- Exibir diagnóstico útil sem expor dados sensíveis.
- Validar carregamento com e sem service worker.
- Testar build local e implantação de homologação.

**Critérios de aceite:**

- A aplicação abre dez vezes consecutivas em perfil limpo sem erro.
- Primeira abertura, recarga forçada e atualização de versão funcionam.
- Cache antigo é atualizado sem loop de recarga.
- Falha da API não impede a tela de login de carregar.
- O console não contém importações ou recursos essenciais com erro.

**Testes obrigatórios:**

- Chrome/Edge desktop e navegador móvel.
- Cache vazio, cache antigo, modo offline e reconexão.
- API disponível, lenta e indisponível.

---

### P1 — Estabilização antes da nova auditoria

#### TASK-004 — Tornar a suíte financeira determinística

**Origem:** BUG-003  
**Prioridade:** P1 — após os bloqueadores P0  
**Status:** Implementada; suíte completa aprovada em 29/07/2026  
**Dependências:** nenhuma

**Trabalho:**

- Injetar um relógio controlado nos serviços financeiros ou usar a data corrente nas fixtures.
- Separar claramente testes de “Hoje”, “Ontem”, “Mês” e período personalizado.
- Remover dependência do relógio real e do fuso da máquina.

**Critérios de aceite:**

- As 36 suítes aprovam.
- A suíte aprova ao simular datas, horários e fusos diferentes.
- Virada de dia e meia-noite possuem cobertura específica.

---

#### TASK-005 — Padronizar a execução dos testes Node

**Prioridade:** P1  
**Status:** Implementada; 37 de 37 suítes aprovadas pelo comando `npm.cmd test`  
**Risco tratado:** resultados inconsistentes de CI  
**Dependências:** TASK-004

**Trabalho:**

- Adicionar configuração de projeto com módulos ES explícitos.
- Criar um único comando para executar toda a suíte.
- Impedir chamadas reais ao Supabase em testes unitários.
- Falhar quando houver erro assíncrono ou tentativa inesperada de rede.
- Gerar resumo de aprovados, reprovados e duração.

**Critérios de aceite:**

- Uma instalação limpa executa todos os testes com um comando documentado.
- Não aparecem avisos `MODULE_TYPELESS_PACKAGE_JSON`.
- Nenhum teste depende de internet ou dados reais.
- CI retorna código diferente de zero para qualquer falha.

---

#### TASK-006 — Criar testes integrados da jornada crítica local

**Prioridade:** P1  
**Status:** Implementada; jornada crítica e 38 de 38 suítes aprovadas  
**Risco tratado:** regressões em venda, caixa e estoque  
**Dependências:** TASK-003, TASK-004 e TASK-005

**Trabalho:**

- Automatizar login, abertura de caixa, inclusão de itens e pagamento.
- Validar subtotal, total, troco, caixa e estoque.
- Automatizar cancelamento de item e cancelamento total.
- Validar devolução de estoque exatamente uma vez.
- Automatizar sangria e fechamento de caixa.

**Critérios de aceite:**

- Cada etapa é conferida na interface e na camada de persistência.
- Repetir uma operação não duplica venda, pagamento ou estoque.
- O fechamento é reconciliado matematicamente com as operações.
- Evidências são geradas automaticamente quando um cenário falha.

---

### P2 — Homologação operacional

#### TASK-007 — Preparar ambiente isolado de homologação

**Prioridade:** P2  
**Status:** Infraestrutura local pronta; aguardando criação e vínculo de um projeto Supabase exclusivo de QA  
**Dependências:** conclusão dos P0

**Trabalho:**

- Criar projeto Supabase exclusivo de homologação.
- Definir usuários de administrador, gerente, caixa e operador.
- Disponibilizar leitura controlada para conferência de registros.
- Criar dados reproduzíveis de produtos, ingredientes, adicionais e estoque.
- Documentar reset seguro do ambiente.

**Critérios de aceite:**

- Testes não afetam produção.
- Cada execução começa com estado conhecido.
- Dados de empresas diferentes permanecem isolados.
- Auditoria identifica usuário, dispositivo, horário e operação.

---

#### TASK-008 — Validar sincronização, concorrência e modo offline

**Prioridade:** P2  
**Status:** Parcial; compactação e convergência offline aprovadas, concorrência real aguarda Supabase de QA  
**Dependências:** TASK-006 e TASK-007

**Trabalho:**

- Usar dois caixas e duas sessões com perfis diferentes.
- Testar venda simultânea do último item.
- Testar repetição da mesma requisição.
- Realizar venda offline e sincronização posterior.
- Simular oscilação durante venda, pagamento e cancelamento.

**Critérios de aceite:**

- Nenhuma venda, baixa ou movimentação é duplicada.
- Conflitos possuem regra definida e rastreável.
- Estoque e caixa convergem após reconexão.
- Horário original e indicação de operação offline são preservados.

---

#### TASK-009 — Integrar e testar pagamentos

**Prioridade:** P2  
**Status:** Fora do escopo atual; o PDV apenas registra a forma informada, sem cobrar ou confirmar com provedor  
**Dependências:** TASK-007 e mecanismo de idempotência

**Decisão de escopo em 29/07/2026:**

- Pix, débito e crédito representam somente registros operacionais feitos pelo caixa.
- O PDV não inicia cobrança, não consulta adquirente e não realiza venda online.
- Nenhum gateway ou sandbox é necessário para o fluxo atual.
- A camada experimental de pagamento permanece isolada e não é chamada pela venda.

**Trabalho:**

- Testar o registro local de dinheiro, Pix, débito e crédito.
- Confirmar que a forma registrada aparece corretamente no caixa e nos relatórios.
- Não iniciar cobrança nem depender de serviço externo.

**Critérios de aceite:**

- Cada forma informada é registrada uma única vez.
- O registro não depende de internet ou de provedor financeiro.
- Cancelamento atualiza caixa e histórico sem apagar rastreabilidade.

---

#### TASK-010 — Validar cozinha e impressão

**Prioridade:** P2  
**Status:** Fora do escopo atual; vendas não enviam pedido nem impressão para cozinha  
**Dependências:** TASK-006

**Decisão de escopo em 29/07/2026:**

- O PDV não possui operação de cozinha integrada nesta etapa.
- Finalizar ou cancelar venda não cria pedido, impressão ou aviso de cozinha.
- A camada experimental permanece isolada para eventual uso futuro.

**Trabalho:**

- Confirmar que venda e cancelamento não criam efeitos de cozinha ou impressão.
- Manter qualquer protótipo futuro desacoplado do fluxo operacional.

**Critérios de aceite:**

- Venda funciona sem dispositivo, fila ou impressora de cozinha.
- Nenhum evento de cozinha é criado automaticamente.

---

### P3 — Liberação e robustez

#### TASK-011 — Reconciliar relatórios, caixa, estoque e banco

**Prioridade:** P3  
**Status:** Implementada localmente; confronto com banco real aguarda homologação exclusiva  
**Dependências:** TASK-008, TASK-009 e TASK-010

**Implementado em 29/07/2026:**

- Reconciliação venda × comanda × itens × forma registrada.
- Totais por dinheiro, Pix, débito e crédito comparados ao faturamento.
- Dinheiro esperado considera entradas, vendas em dinheiro, saídas e sangrias.
- Filtros por período, usuário, produto e forma de pagamento.
- Comparação opcional com snapshot normalizado de vendas, comandas e itens do banco.
- Divergências retornam código, entidade, valor esperado e valor encontrado.
- Correção do CRM para contabilizar sangria como saída.
- Regressões com comanda adulterada e venda ausente no snapshot remoto.

**Pendente:**

- Executar o reconciliador contra consultas do projeto Supabase exclusivo de QA.
- Guardar evidências assinadas da reconciliação antes da liberação.

**Critérios de aceite:**

- Soma das vendas corresponde aos pagamentos e ao faturamento.
- Dinheiro esperado corresponde a abertura, vendas, suprimentos e sangrias.
- Estoque corresponde às vendas e cancelamentos.
- Filtros por período, usuário, produto e forma de pagamento correspondem ao banco.

---

#### TASK-012 — Executar segurança, carga, recuperação e backup

**Prioridade:** P3  
**Status:** Controles locais e revisão XSS aprovados; homologação externa pendente  
**Dependências:** ambiente de homologação estável

**Trabalho:**

- Testar autorização, isolamento de empresa, XSS, injeção e manipulação de identificadores.
- Executar testes com 10, 50 e 100 pedidos simultâneos.
- Simular queda de API, banco, internet e fechamento forçado.
- Restaurar backup em ambiente vazio e reconciliar dados.

**Implementado em 29/07/2026:**

- Escape central de HTML aplicado aos cartões de produto, comanda e notificações.
- Notificações passaram a montar conteúdo com `textContent`, sem interpolar HTML.
- Teste de manipulação de ID confirma que operador sem permissão não cancela vendas.
- Carga local sequencial de 100 pedidos com preservação de todas as vendas.
- Backup versionado com allowlist de chaves, checksum e recusa de senhas.
- Restauração em armazenamento vazio e rejeição de backup adulterado sem perda dos dados atuais.

**Pendente:**

- Executar carga concorrente real de 10, 50 e 100 clientes contra Supabase de QA.
- Validar isolamento entre empresas, políticas RLS, injeção e enumeração de IDs no backend.
- Simular indisponibilidade real de API/banco e fechamento forçado do navegador.
- Gerar e restaurar backup real do PostgreSQL em projeto vazio.

**Critérios de aceite:**

- Nenhuma vulnerabilidade crítica ou alta aberta.
- Operações recuperam sem perda ou duplicação.
- Limites de desempenho são medidos e documentados.
- Backup restaurado reproduz vendas, estoque, caixa e auditoria.

---

#### TASK-013 — Executar regressão final e decisão de produção

**Prioridade:** P3 — última tarefa  
**Status:** Executada em 29/07/2026 — decisão NO-GO; produção reprovada até resolver os bloqueadores externos  
**Dependências:** todas as anteriores

**Resultado:**

- Regressão automatizada local: 45 de 45 suítes aprovadas.
- Decisão formal: não liberar para produção nem aceitar pagamentos reais.
- Rollback, implantação gradual, monitoramento, suporte e gatilhos de interrupção documentados em `docs/DECISAO_LIBERACAO_PDV_2026-07-29.md`.
- Nova avaliação condicionada à conclusão das pendências das TASK-001, TASK-002 e TASK-007 a TASK-012.

**Critérios de aceite:**

- Todos os bugs críticos e altos dos módulos essenciais estão corrigidos e retestados.
- Jornada obrigatória aprovada de ponta a ponta.
- Nenhuma venda perdida ou duplicada.
- Caixa, estoque e relatórios reconciliados com o banco.
- Principais fluxos aprovados em dispositivos reais.
- Plano de rollback, suporte e monitoramento definido.

## Marcos de liberação

| Marco | Tarefas | Resultado esperado |
|---|---|---|
| M1 — Segurança básica | TASK-001 a TASK-003 | Aplicação inicia e não aceita acesso administrativo local |
| M2 — Base confiável | TASK-004 a TASK-006 | Suíte estável e jornada crítica local automatizada |
| M3 — Homologação real | TASK-007 a TASK-010 | Banco, sincronização e registros operacionais validados |
| M4 — Liberação | TASK-011 a TASK-013 | Reconciliação, resiliência e regressão final aprovadas |

## Regra de prioridade

- Não iniciar recursos novos enquanto existir tarefa P0 aberta.
- Não iniciar piloto real enquanto P0 ou P1 estiver aberta.
- Não aceitar pagamento real enquanto TASK-008 e TASK-009 não estiverem aprovadas.
- Não recomendar produção antes da aprovação da TASK-013.
