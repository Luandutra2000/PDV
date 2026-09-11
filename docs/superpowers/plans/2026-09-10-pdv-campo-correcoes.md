# PDV Campo Correcoes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir a persistência e a visibilidade de lançamentos financeiros, fechar o caixa com os valores reais, proteger o acesso ao Supabase e deixar a suíte de regressão verde para uso em campo.

**Architecture:** O cache local continua sendo a fonte imediata da interface, mas cada gravação financeira terá uma representação única: movimento de caixa quando altera o caixa e lançamento financeiro para o módulo Financeiro. A hidratação remota fará merge por id e manterá operações locais pendentes quando qualquer tabela remota falhar. O cliente REST autenticado usará o JWT da sessão Supabase; as políticas de banco aceitarão somente `authenticated` e validarão permissões no servidor.

**Tech Stack:** JavaScript ES modules, Node test runner, Supabase REST/SDK, PostgreSQL migrations, Vercel static deployment.

**Spec:** `docs/superpowers/specs/2026-09-10-pdv-campo-correcoes-design.md`

## Global Constraints

- Manter a resposta local imediata e nunca apagar o cache local por falha de leitura remota.
- Preservar operações com `syncPending` até confirmação do servidor.
- Registrar fechamento com totais, pagamentos, diferenças, operador e horário completos.
- Remover acesso operacional do papel `anon`; somente sessões autenticadas podem ler ou escrever dados de operação.
- Não adicionar dependências; usar os adapters e serviços existentes.
- Não executar deploy ou push neste plano; a validação local será concluída antes de qualquer publicação.

### Task 1: Fix failing finance filter regression

**Files:**
- Modify: `src/modules/despesas/despesas.module.js:20-60` — resetar filtros por container inicializado e manter o período salvo somente durante a sessão da tela.
- Modify: `src/services/financial.service.js:65-75` — normalizar datas locais `YYYY-MM-DD` sem deslocamento de fuso ao filtrar.
- Test: `tests/despesas-module.test.mjs` — cobrir montagem após `localStorage.clear()` e lançamento criado no dia local.

**Interfaces:**
- Consumes: `getFinancialTransactions({ period, customStart, customEnd })` e `initDespesasModule(container)`.
- Produces: `getFinanceiroState()` retorna lançamentos do dia local recém-hidratados, sem filtro residual de outro container.

- [ ] **Step 1: Write the failing test**

Adicionar no teste de despesas uma segunda inicialização em novo container depois de trocar o `transactionDate` para a data local atual e afirmar que `Troco` e `Conta fornecedor` aparecem antes de qualquer evento de filtro.

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/despesas-module.test.mjs`
Expected: FAIL na asserção de `Troco` ou `Conta fornecedor`.

- [ ] **Step 3: Write minimal implementation**

Fazer `initDespesasModule` reiniciar `financeiroFilters` para `DEFAULT_FILTERS` apenas quando o container ainda não estiver no conjunto `boundFinanceiroContainers`; usar parser local para datas sem `new Date('YYYY-MM-DD')` em UTC.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/despesas-module.test.mjs`
Expected: `despesas module ok`.

- [ ] **Step 5: Commit**

```bash
git add src/modules/despesas/despesas.module.js src/services/financial.service.js tests/despesas-module.test.mjs
git commit -m "fix: keep finance filters and local dates deterministic"
```

### Task 2: Make finance entries participate in cash closing

**Files:**
- Modify: `src/modules/despesas/despesas.module.js:210-255` — quando `movesCashSession` estiver marcado, criar ou atualizar também o movimento de caixa vinculado.
- Modify: `src/services/financial.service.js:70-150,260-300` — expor normalização de movimento vinculado e preservar `cashMovementId`/`movesCashSession` em edição.
- Modify: `src/services/transaction.service.js:90-155` — aceitar id determinístico e retornar o movimento criado para vinculação.
- Modify: `src/services/crm-dashboard.service.js:180-235` — compor o resumo com movimentos de caixa e somente lançamentos financeiros marcados para alterar o caixa, sem duplicar ids vinculados.
- Modify: `src/services/cash-closing.service.js:1-230` — usar a mesma composição do CRM no resumo e registrar as linhas financeiras participantes.
- Test: `tests/financial-service.test.mjs`, `tests/crm-dashboard-service.test.mjs`, `tests/cash-closing-service.test.mjs`, `tests/despesas-module.test.mjs`.

**Interfaces:**
- Consumes: `registerCashMovement({ type, amount, description, category, paymentMethod, ... })` e `getFinancialTransactions({ period: 'all' })`.
- Produces: `buildClosingSummary()` soma vendas, movimentos e lançamentos financeiros `movesCashSession === true` uma única vez; a tela Financeiro mantém o lançamento original.

- [ ] **Step 1: Write the failing tests**

Adicionar cenário com uma entrada financeira marcada para caixa e uma saída marcada para caixa; afirmar que o resumo apresenta `entriesTotal`, `outputsTotal` e `generalDifference` corretos e que o id vinculado aparece uma vez.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/cash-closing-service.test.mjs; node tests/crm-dashboard-service.test.mjs`
Expected: FAIL porque o resumo atual lê somente `pdv.transactions`.

- [ ] **Step 3: Write minimal implementation**

Criar uma função compartilhada de composição em `cash-closing.service.js` ou serviço pequeno dedicado; o formulário de Financeiro usa `registerCashMovement` para lançamentos pagos com `movesCashSession`, grava o `cashMovementId`, e a edição/cancelamento atualiza o movimento pelo mesmo id.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/financial-service.test.mjs; node tests/crm-dashboard-service.test.mjs; node tests/cash-closing-service.test.mjs; node tests/despesas-module.test.mjs`
Expected: todos terminam com status zero.

- [ ] **Step 5: Commit**

```bash
git add src/modules/despesas/despesas.module.js src/services/financial.service.js src/services/transaction.service.js src/services/crm-dashboard.service.js src/services/cash-closing.service.js tests
git commit -m "fix: include linked finance movements in cash closing"
```

### Task 3: Preserve local financial data during remote hydration

**Files:**
- Modify: `src/services/financial-sync.service.js:45-112,430-510` — trocar o `Promise.all` destrutivo por leituras isoladas com merge por id; falha em uma tabela mantém cache anterior e operações pendentes.
- Modify: `src/services/supabase-rest-client.service.js:1-100` — enviar `Authorization: Bearer <access token>` obtido da sessão local, mantendo `apikey` como chave pública.
- Modify: `src/services/supabase-client.service.js:50-75` — permitir leitura segura da sessão atual para o cliente REST sem criar dependência circular.
- Test: `tests/financial-sync-service.test.mjs`, `tests/supabase-rest-client-service.test.mjs`, `tests/offline-convergence.test.mjs`.

**Interfaces:**
- Consumes: `getItem(STORAGE_KEYS.currentSession)`, adapters `fromRow/toRow`, fila `pdv.syncQueue.financial`.
- Produces: `hydrateFinancialData({ includePending: true })` nunca substitui uma coleção por `[]` quando a leitura daquela tabela falha; writes autenticados retornam 401/403 para a fila local e preservam o registro visível.

- [ ] **Step 1: Write the failing tests**

Adicionar fake client que falha apenas em `financial_transactions` depois de um cache local com `fin-queued`; afirmar que o lançamento continua visível e marcado `syncPending`. Adicionar teste REST que coloca `accessToken` na sessão e verifica o header Bearer.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/financial-sync-service.test.mjs; node tests/supabase-rest-client-service.test.mjs`
Expected: FAIL por apagar/omitir o cache ou usar somente o anon key.

- [ ] **Step 3: Write minimal implementation**

Implementar `selectRowsSafely` por adapter, retornar `{ rows, ok }`, atualizar somente caches com `ok === true`, aplicar sempre `inFlightOperations` e fila à coleção correspondente, e usar token de `STORAGE_KEYS.currentSession` quando disponível.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/financial-sync-service.test.mjs; node tests/supabase-rest-client-service.test.mjs; node tests/offline-convergence.test.mjs`
Expected: todos passam e a fila zera somente após confirmação.

- [ ] **Step 5: Commit**

```bash
git add src/services/financial-sync.service.js src/services/supabase-rest-client.service.js src/services/supabase-client.service.js tests
git commit -m "fix: preserve pending finance cache during authenticated sync"
```

### Task 4: Persist and verify complete cash closings

**Files:**
- Modify: `src/services/cash-closing.service.js:119-190` — garantir que `confirmClosing` construa o registro com input, totais, pagamentos, diferenças, vendas fora de estoque, operador e timestamps antes de limpar o rascunho.
- Modify: `src/services/repositories/cash-closing.adapter.js:1-50` — manter todos os campos no round-trip local/remote e tolerar colunas legadas ausentes.
- Modify: `src/modules/caixa/caixa.module.js:210-285` — exibir o resumo persistido após confirmação e diferenciar erro de sincronização de sucesso local.
- Test: `tests/cash-closing-service.test.mjs`, `tests/caixa-module.test.mjs`, `tests/mobile-closing-service.test.mjs`.

**Interfaces:**
- Consumes: `buildClosingSummary`, `confirmClosing`, `cashClosingAdapter.toRow/fromRow`.
- Produces: fechamento confirmado permanece em `STORAGE_KEYS.cashClosings` com `totals.expectedCash`, `totals.countedCash`, diferenças, pagamentos e `input.note` completos.

- [ ] **Step 1: Write the failing tests**

Adicionar round-trip de adapter com caixa contado diferente do esperado e teste de confirmação que lê o mesmo fechamento depois do reset dos campos.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/cash-closing-service.test.mjs; node tests/caixa-module.test.mjs`
Expected: FAIL se algum campo for perdido ou se o histórico mostrar zero.

- [ ] **Step 3: Write minimal implementation**

Normalizar números monetários no serviço, copiar `draft.input` sem mutação, e fazer o adapter preservar `payments`, `showcase`, `differences`, `input`, `totals`, `createdAt`, `closedAt` e `updatedAt`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/cash-closing-service.test.mjs; node tests/caixa-module.test.mjs; node tests/mobile-closing-service.test.mjs`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add src/services/cash-closing.service.js src/services/repositories/cash-closing.adapter.js src/modules/caixa/caixa.module.js tests
git commit -m "fix: persist complete cash closing summaries"
```

### Task 5: Close security and migration gaps

**Files:**
- Create: `supabase/migrations/202609100001_secure_authenticated_online_sync.sql` — revogar grants/policies anon de dados operacionais e conceder somente a `authenticated` com funções de permissão existentes.
- Create: `supabase/migrations/202609100002_fix_profile_role_escalation.sql` — impedir que `users.edit` altere `role_id`, `is_active` ou o próprio perfil sem `users.manage`; preservar criação do primeiro admin.
- Modify: `supabase/migrations/202606030004_align_remote_sales_schema.sql:1-10` — remover referências a colunas inexistentes usando bloco condicional.
- Modify: `supabase/functions/admin-users/index.ts:180-320` — rejeitar payload de alteração de perfil que contenha role/status quando o chamador não possui gestão de usuários.
- Test: `tests/anon-online-sync-policy.test.mjs`, `tests/homologation-environment-config.test.mjs`, `tests/user-admin-service.test.mjs`, criar `tests/migration-safety.test.mjs`.

**Interfaces:**
- Consumes: `private.current_profile_has_permission`, função `admin-users`, migrations existentes.
- Produces: nenhum policy `to anon` com select/insert/update/delete em tabelas de operação; migrações são idempotentes e não mencionam colunas legadas sem checagem; operador com `users.edit` não promove usuário.

- [ ] **Step 1: Write the failing tests**

Adicionar asserts que rejeitam policies anon operacionais, detectam `comanda_id/comanda_number` fora de bloco condicional e simulam update de role sem `users.manage` retornando 403.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/anon-online-sync-policy.test.mjs; node tests/migration-safety.test.mjs; node tests/user-admin-service.test.mjs`
Expected: FAIL nos arquivos atuais.

- [ ] **Step 3: Write minimal implementation**

Criar as duas migrations de endurecimento, ajustar a migration de schema e validar no Edge Function que campos sensíveis exigem permissão de gestão; manter operações de catálogo e caixa funcionando via JWT autenticado.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/anon-online-sync-policy.test.mjs; node tests/migration-safety.test.mjs; node tests/user-admin-service.test.mjs`
Expected: todos passam.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/functions/admin-users/index.ts tests
git commit -m "fix: enforce authenticated supabase policies and roles"
```

### Task 6: Full verification and audit report

**Files:**
- Modify: `docs/auditoria-campo-2026-09-10/RELATORIO-FINAL.md` — registrar correções, testes executados e pendências de publicação.
- Test: `tests/*.test.mjs`, `npm.cmd test`.

**Interfaces:**
- Consumes: todas as correções das Tasks 1–5.
- Produces: suíte verde, relatório atualizado e checklist de publicação sem afirmar deploy realizado.

- [ ] **Step 1: Run focused tests**

Run: `node tests/despesas-module.test.mjs; node tests/financial-sync-service.test.mjs; node tests/cash-closing-service.test.mjs; node tests/caixa-module.test.mjs; node tests/anon-online-sync-policy.test.mjs; node tests/migration-safety.test.mjs`
Expected: status zero em todos.

- [ ] **Step 2: Run full test suite**

Run: `npm.cmd test`
Expected: todos os testes passam sem falhas.

- [ ] **Step 3: Run startup and static checks**

Run: `node tests/startup-module-graph.test.mjs; node tests/online-sync-bootstrap.test.mjs; node tests/vercel-cache-config.test.mjs`
Expected: status zero, sem erro de importação ou cache de deploy.

- [ ] **Step 4: Update the report**

Registrar cada bug com causa, arquivo corrigido, teste que cobre e a única pendência externa: aplicar migrations e publicar o commit no projeto Luandutra2000/PDV.

- [ ] **Step 5: Commit**

```bash
git add docs/auditoria-campo-2026-09-10/RELATORIO-FINAL.md docs/superpowers/plans/2026-09-10-pdv-campo-correcoes.md
git commit -m "docs: record field audit fixes and verification"
```

## Self-review

- Spec coverage: cache/sync, fechamento, financeiro, segurança/RLS, migration quebrada e validação aparecem nas Tasks 1–6.
- Placeholder scan: não há `TBD`, `TODO` ou instruções sem arquivo, comando e resultado esperado.
- Type consistency: os nomes `movesCashSession`, `cashMovementId`, `hydrateFinancialData({ includePending })`, `confirmClosing` e `cashClosingAdapter` são usados com as assinaturas existentes.
