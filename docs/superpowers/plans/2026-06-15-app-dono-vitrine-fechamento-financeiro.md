# APP Dono Vitrine Fechamento Financeiro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the requested owner APP/PWA vitrine comparison, canceled vitrine entries, cash closing form/history, and finance tab without changing web screens or unrelated APP layouts.

**Architecture:** Keep UI changes inside the mobile dashboard module and mobile CSS. Put reusable data preparation and online-only write behavior in focused mobile services that adapt existing domain services. Shared services remain the source of truth; web modules are not modified.

**Tech Stack:** Vanilla ES modules, localStorage-backed caches hydrated from Supabase, existing Supabase sync services, Node `.mjs` tests.

---

## File Structure

- Modify `src/services/mobile-showcase.service.js`: expose mobile cards, full comparison rows, canceled launches, and sold-without-stock quantity.
- Modify `tests/mobile-showcase-service.test.mjs`: cover new cards, comparison shape, canceled launches, and sold without stock.
- Modify `src/services/mobile-closing.service.js`: expose editable default form values, computed preview, history rows with status, and an online-only submit helper.
- Modify `tests/mobile-closing-service.test.mjs`: cover default counted values, difference status, and closing submit failure behavior.
- Create `src/services/mobile-financial.service.js`: expose finance summary/rows/payables/CRM/categories and online-only actions for APP finance writes.
- Create `tests/mobile-financial-service.test.mjs`: cover finance state, create entry/expense/bill, mark paid, and online failure behavior.
- Modify `src/modules/mobile/mobile-dashboard.module.js`: add Finance tab, render requested Vitrine/Fechar/Financeiro APP sections, and wire APP-only events.
- Modify `src/styles/mobile.css`: add APP-only classes for new mobile panels, canceled cards, comparison rows, closing form, and finance forms.
- Add or update module smoke tests only if needed to protect render helpers; do not modify web modules.

## Task 1: Mobile Showcase Data

**Files:**
- Modify: `src/services/mobile-showcase.service.js`
- Modify: `tests/mobile-showcase-service.test.mjs`

- [ ] **Step 1: Write failing mobile showcase service assertions**

Append assertions to `tests/mobile-showcase-service.test.mjs` after the current summary assertions:

```js
const canceledLaunch = estoque.createStockLaunch({ produtoId: soda.id, quantidade: 3 });
estoque.cancelStockLaunch(canceledLaunch.id);

const summaryAfterCancel = showcase.getMobileShowcaseSummary();

assert(Array.isArray(summaryAfterCancel.cards), 'showcase should expose mobile cards');
assert(summaryAfterCancel.cards.find((card) => card.id === 'showcase').value === 12, 'Vitrine card should count active produced units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'sold').value === 2, 'Vendidos card should count sold units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'leftovers').value === 10, 'Sobras card should count remaining active units');
assert(summaryAfterCancel.cards.find((card) => card.id === 'soldWithoutStock').value === 0, 'Vendidos sem estoque should be zero when production covers sales');
assert(summaryAfterCancel.comparisonRows[0].produtoNome, 'comparison rows should include product name');
assert('valorProduzido' in summaryAfterCancel.comparisonRows[0], 'comparison rows should include produced value');
assert(summaryAfterCancel.canceledLaunches.some((launch) => launch.id === canceledLaunch.id), 'showcase should expose canceled launches');
assert(!summaryAfterCancel.rows.some((row) => row.produtoId === soda.id && row.quantidadeProduzida === 5), 'canceled launches should not inflate active rows');
```

- [ ] **Step 2: Run the failing showcase test**

Run: `node tests/mobile-showcase-service.test.mjs`

Expected: FAIL because `cards`, `comparisonRows`, or `canceledLaunches` do not exist.

- [ ] **Step 3: Implement mobile showcase data**

In `src/services/mobile-showcase.service.js`, import `getStockLaunches` and add helpers:

```js
import { getProductionSalesComparison, getStockLaunches, getStockSummary } from './estoque.service.js';
import { getTransactions } from './transaction.service.js';

export function getMobileShowcaseSummary(filters = { period: 'today' }) {
  const summary = getStockSummary(filters);
  const rows = getProductionSalesComparison(filters);
  const canceledLaunches = getStockLaunches(filters).filter((launch) => launch.status === 'cancelado');
  const soldWithoutStock = calculateSoldWithoutStock(rows, filters);
  const bestSellers = [...rows].sort((a, b) => b.quantidadeVendida - a.quantidadeVendida);
  const slowSellers = [...rows].sort((a, b) => a.percentualVendido - b.percentualVendido);

  return {
    cards: [
      { id: 'showcase', label: 'Vitrine', value: summary.producedUnits, tone: 'info', isCurrency: false },
      { id: 'sold', label: 'Vendidos', value: summary.soldUnits, tone: 'success', isCurrency: false },
      { id: 'leftovers', label: 'Sobras', value: summary.quantityBalance, tone: 'warning', isCurrency: false },
      { id: 'soldWithoutStock', label: 'Vendidos sem estoque', value: soldWithoutStock, tone: soldWithoutStock ? 'danger' : 'success', isCurrency: false }
    ],
    producedUnits: summary.producedUnits,
    soldUnits: summary.soldUnits,
    remainingUnits: summary.quantityBalance,
    estimatedValue: Math.max(0, summary.valueDifference),
    soldValue: summary.salesValue,
    valueDifference: summary.valueDifference,
    soldWithoutStock,
    bestSeller: bestSellers[0] || null,
    slowSeller: slowSellers[0] || null,
    lowStock: rows.filter((row) => row.sobraQuantidade > 0 && row.sobraQuantidade <= 5),
    rows,
    comparisonRows: rows,
    canceledLaunches
  };
}

function calculateSoldWithoutStock(rows, filters) {
  const producedByProduct = new Map(rows.map((row) => [row.produtoId, Number(row.quantidadeProduzida || 0)]));
  const soldByProduct = new Map();

  getTransactions()
    .filter((transaction) => transaction.type === 'venda' && transaction.status !== 'cancelada')
    .filter((transaction) => isInPeriod(transaction.createdAt, filters.period || 'today', filters))
    .forEach((sale) => {
      (sale.items || []).forEach((item) => {
        soldByProduct.set(item.productId, (soldByProduct.get(item.productId) || 0) + Number(item.quantity || 0));
      });
    });

  return Array.from(soldByProduct.entries()).reduce((total, [productId, sold]) => {
    const produced = producedByProduct.get(productId) || 0;
    return total + Math.max(0, sold - produced);
  }, 0);
}
```

Also copy the `isInPeriod` helper from `estoque.service.js` or keep a local equivalent in this service.

- [ ] **Step 4: Run showcase test to verify pass**

Run: `node tests/mobile-showcase-service.test.mjs`

Expected: PASS and prints `mobile showcase service ok`.

- [ ] **Step 5: Commit showcase service**

```bash
git add src/services/mobile-showcase.service.js tests/mobile-showcase-service.test.mjs
git commit -m "feat: prepare mobile showcase comparison data"
```

## Task 2: Mobile Closing Data and Online Submit

**Files:**
- Modify: `src/services/mobile-closing.service.js`
- Modify: `tests/mobile-closing-service.test.mjs`

- [ ] **Step 1: Write failing closing assertions**

Extend `tests/mobile-closing-service.test.mjs` after the current summary assertions:

```js
assert(summary.formDefaults.countedCash === summary.expectedCash, 'closing should default counted cash to expected cash');
assert(summary.formDefaults.checkedPix === summary.expectedPix, 'closing should default pix counted to expected pix');
assert(summary.formDefaults.checkedCard === summary.expectedDebit + summary.expectedCredit, 'closing should default card counted to expected card');
assert(summary.history[0].statusLabel === 'Conferido', 'matching closing should be Conferido');

const preview = mobileClosing.previewMobileClosing({
  countedCash: summary.expectedCash + 6,
  checkedPix: summary.expectedPix,
  checkedCard: summary.expectedDebit + summary.expectedCredit,
  note: 'Teste'
});
assert(preview.statusLabel === 'Grande diferenca', 'difference above five should be Grande diferenca');
```

- [ ] **Step 2: Run the failing closing test**

Run: `node tests/mobile-closing-service.test.mjs`

Expected: FAIL because `formDefaults` or `previewMobileClosing` does not exist.

- [ ] **Step 3: Implement preview and history status**

Update `src/services/mobile-closing.service.js` to export:

```js
import { buildClosingSummary, confirmClosing, getCashClosings, saveClosingDraft } from './cash-closing.service.js';
import { isSupabaseEnabled } from './app-config.service.js';
import { saveCashClosingToSupabase } from './financial-sync.service.js';

export function getMobileClosingSummary() {
  const base = buildClosingSummary({});
  const checkedCard = base.payments.expectedDebit + base.payments.expectedCredit;
  const current = buildClosingSummary({
    countedCash: base.payments.expectedCash,
    checkedPix: base.payments.expectedPix,
    checkedDebit: base.payments.expectedDebit,
    checkedCredit: base.payments.expectedCredit
  });
  const history = getCashClosings().map(normalizeClosingHistoryItem);

  return {
    expectedCash: current.payments.expectedCash,
    expectedPix: current.payments.expectedPix,
    expectedDebit: current.payments.expectedDebit,
    expectedCredit: current.payments.expectedCredit,
    expectedCard: checkedCard,
    entriesTotal: current.totals.entries,
    outputsTotal: current.totals.outputs,
    cashDifference: current.payments.cashDifference,
    generalDifference: current.payments.generalDifference,
    formDefaults: {
      countedCash: current.payments.expectedCash,
      checkedPix: current.payments.expectedPix,
      checkedCard
    },
    history
  };
}

export function previewMobileClosing(input = {}) {
  const base = buildClosingSummary({});
  const checkedCard = Number(input.checkedCard ?? (base.payments.expectedDebit + base.payments.expectedCredit)) || 0;
  const preview = buildClosingSummary({
    countedCash: input.countedCash,
    checkedPix: input.checkedPix,
    checkedDebit: checkedCard,
    checkedCredit: 0
  });
  const expectedTotal = preview.payments.expectedTotal;
  const countedTotal = preview.payments.actualComparableTotal;
  const differenceTotal = countedTotal - expectedTotal;

  return {
    ...preview,
    note: String(input.note || '').trim(),
    expectedCard: base.payments.expectedDebit + base.payments.expectedCredit,
    checkedCard,
    expectedTotal,
    countedTotal,
    differenceTotal,
    statusLabel: getClosingStatusLabel(differenceTotal)
  };
}

export function getClosingStatusLabel(difference) {
  const absolute = Math.abs(Number(difference || 0));
  if (absolute === 0) return 'Conferido';
  if (absolute <= 5) return 'Pequena diferenca';
  return 'Grande diferenca';
}

function normalizeClosingHistoryItem(item) {
  const totals = item.totals || {};
  const expectedTotal = Number(totals.expectedCash || 0)
    + Number(totals.expectedPix || 0)
    + Number(totals.expectedDebit || 0)
    + Number(totals.expectedCredit || 0);
  const countedTotal = Number(totals.countedCash || 0)
    + Number(totals.checkedPix ?? totals.expectedPix || 0)
    + Number(totals.checkedDebit ?? totals.expectedDebit || 0)
    + Number(totals.checkedCredit ?? totals.expectedCredit || 0);
  const difference = Number(totals.generalDifference ?? (countedTotal - expectedTotal));

  return {
    ...item,
    expectedTotal,
    countedTotal,
    difference,
    statusLabel: getClosingStatusLabel(difference)
  };
}
```

- [ ] **Step 4: Run closing test to verify pass**

Run: `node tests/mobile-closing-service.test.mjs`

Expected: PASS and prints `mobile closing service ok`.

- [ ] **Step 5: Commit closing data**

```bash
git add src/services/mobile-closing.service.js tests/mobile-closing-service.test.mjs
git commit -m "feat: prepare mobile closing summary"
```

## Task 3: Mobile Finance Service

**Files:**
- Create: `src/services/mobile-financial.service.js`
- Create: `tests/mobile-financial-service.test.mjs`

- [ ] **Step 1: Write the failing mobile finance test**

Create `tests/mobile-financial-service.test.mjs`:

```js
const store = new Map();

globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
  clear() { store.clear(); }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const storage = await import('../src/services/storage.service.js');
const auth = await import('../src/services/auth.service.js');
const schema = await import('../src/database/schema.js');
const sync = await import('../src/services/financial-sync.service.js');
const mobileFinance = await import('../src/services/mobile-financial.service.js');

storage.resetAppData();
auth.login({ username: 'admin', password: 'admin123' });

const rows = {
  sales: [],
  sale_items: [],
  cash_movements: [],
  commands: [],
  command_items: [],
  cash_closings: [],
  financial_categories: [],
  financial_transactions: []
};
let failWrites = false;
const calls = [];
const fakeClient = {
  from(table) {
    return {
      select() { return Promise.resolve({ data: rows[table] || [], error: null }); },
      upsert(nextRows) {
        calls.push({ table, rows: nextRows });
        if (failWrites) return Promise.resolve({ error: new Error('offline') });
        rows[table] = [...(rows[table] || []), ...nextRows];
        return Promise.resolve({ error: null });
      },
      update(patch) {
        return {
          eq(column, value) {
            calls.push({ table, patch, column, value });
            if (failWrites) return Promise.resolve({ error: new Error('offline') });
            rows[table] = (rows[table] || []).map((row) => row[column] === value ? { ...row, ...patch } : row);
            return Promise.resolve({ error: null });
          }
        };
      }
    };
  }
};

sync.configureFinancialSyncForTests({ getClient: async () => fakeClient });

const initial = mobileFinance.getMobileFinancialSummary();
assert(initial.cards.length === 6, 'finance summary should expose six cards');
assert(initial.categories.length > 0, 'finance summary should expose categories');

await mobileFinance.createMobileFinancialTransaction({
  type: 'income',
  description: 'Aporte dono',
  amount: 50,
  categoryId: 'aporte-dono',
  paymentMethod: 'dinheiro',
  status: 'paid'
});
assert(calls.some((call) => call.table === 'financial_transactions'), 'mobile finance should write to Supabase');
assert(JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).some((item) => item.description === 'Aporte dono'), 'mobile finance should update cache after online success');

const bill = await mobileFinance.createMobileFinancialTransaction({
  type: 'expense',
  description: 'Boleto fornecedor',
  amount: 120,
  categoryId: 'fornecedor',
  paymentMethod: 'boleto',
  status: 'pending',
  dueDate: '2026-06-20'
});
await mobileFinance.markMobileFinancialTransactionPaid(bill.id, { paymentMethod: 'boleto' });
assert(JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).find((item) => item.id === bill.id).status === 'paid', 'mobile finance should mark payable paid');

failWrites = true;
let failed = false;
try {
  await mobileFinance.createMobileFinancialTransaction({
    type: 'expense',
    description: 'Falha online',
    amount: 10,
    categoryId: 'fornecedor'
  });
} catch (error) {
  failed = error.message.includes('Supabase') || error.message.includes('offline');
}
assert(failed, 'mobile finance should fail when Supabase write fails');
assert(!JSON.parse(localStorage.getItem(schema.STORAGE_KEYS.financialTransactions)).some((item) => item.description === 'Falha online'), 'failed online write should not remain in cache');

console.log('mobile financial service ok');
```

- [ ] **Step 2: Run the failing mobile finance test**

Run: `node tests/mobile-financial-service.test.mjs`

Expected: FAIL because `src/services/mobile-financial.service.js` does not exist.

- [ ] **Step 3: Implement mobile finance service**

Create `src/services/mobile-financial.service.js` with:

```js
import {
  buildFinancialCrm,
  createFinancialTransaction,
  getFinancialCategories,
  getFinancialSummary,
  getFinancialTransactions,
  getPayables,
  markFinancialTransactionPaid,
  normalizeFinancialTransaction,
  seedFinancialCategories
} from './financial.service.js';
import { getCurrentUser } from './auth.service.js';
import { getItem, setItem } from './storage.service.js';
import { STORAGE_KEYS } from '../database/schema.js';
import { saveFinancialTransactionToSupabase } from './financial-sync.service.js';

export function getMobileFinancialSummary(filters = { period: 'today' }) {
  seedFinancialCategories();
  const summary = getFinancialSummary(filters);
  const categories = getFinancialCategories();
  const transactions = getFinancialTransactions(filters);
  const payables = getPayables();
  const crm = buildFinancialCrm(filters);

  return {
    cards: [
      { id: 'entries', label: 'Entradas', value: summary.entriesTotal, tone: 'success' },
      { id: 'outputs', label: 'Saidas', value: summary.outputsTotal, tone: 'danger' },
      { id: 'balance', label: 'Saldo', value: summary.balance, tone: summary.balance < 0 ? 'danger' : 'primary' },
      { id: 'payables', label: 'Contas a pagar', value: summary.payablesCount, tone: 'warning', isCurrency: false },
      { id: 'paidBills', label: 'Contas pagas', value: summary.paidBillsCount, tone: 'success', isCurrency: false },
      { id: 'overdue', label: 'Vencidas', value: summary.overdueCount, tone: 'danger', isCurrency: false }
    ],
    summary,
    categories,
    transactions,
    payables,
    crm
  };
}

export async function createMobileFinancialTransaction(input) {
  const user = getCurrentUser();
  const transaction = normalizeFinancialTransaction({ ...input, origin: 'finance' }, user);
  await saveFinancialTransactionToSupabase(transaction);
  upsertFinancialTransactionCache(transaction);
  return transaction;
}

export async function markMobileFinancialTransactionPaid(transactionId, input = {}) {
  const transaction = getFinancialTransactions({ period: 'all' }).find((item) => item.id === transactionId);
  if (!transaction) {
    throw new Error('Lancamento financeiro nao encontrado.');
  }

  const nextTransaction = {
    ...transaction,
    status: 'paid',
    paidAt: input.paidAt || new Date().toISOString(),
    paymentMethod: input.paymentMethod || transaction.paymentMethod || 'dinheiro',
    updatedAt: new Date().toISOString()
  };
  await saveFinancialTransactionToSupabase(nextTransaction);
  upsertFinancialTransactionCache(nextTransaction);
  return nextTransaction;
}

function upsertFinancialTransactionCache(transaction) {
  const current = getItem(STORAGE_KEYS.financialTransactions, []);
  const exists = current.some((item) => item.id === transaction.id);
  const next = exists
    ? current.map((item) => item.id === transaction.id ? transaction : item)
    : [transaction, ...current];
  setItem(STORAGE_KEYS.financialTransactions, next);
}
```

Remove unused imports if lint/checking complains.

- [ ] **Step 4: Run mobile finance test**

Run: `node tests/mobile-financial-service.test.mjs`

Expected: PASS and prints `mobile financial service ok`.

- [ ] **Step 5: Commit mobile finance service**

```bash
git add src/services/mobile-financial.service.js tests/mobile-financial-service.test.mjs
git commit -m "feat: add mobile finance service"
```

## Task 4: Mobile Dashboard Rendering and Events

**Files:**
- Modify: `src/modules/mobile/mobile-dashboard.module.js`
- Modify: `src/styles/mobile.css`

- [ ] **Step 1: Update imports and tabs**

In `src/modules/mobile/mobile-dashboard.module.js`, import mobile finance helpers and closing preview helpers:

```js
import { getMobileFinancialSummary, createMobileFinancialTransaction, markMobileFinancialTransactionPaid } from '../../services/mobile-financial.service.js';
import { previewMobileClosing, submitMobileClosing } from '../../services/mobile-closing.service.js';
```

Add state:

```js
closingForm: { countedCash: '', checkedPix: '', checkedCard: '', note: '' },
financeModal: '',
financeError: '',
closingError: ''
```

Add tab:

```js
{ id: 'finance', label: 'Financeiro', icon: 'FN' }
```

- [ ] **Step 2: Render vitrine cards, comparison, and canceled launches**

Replace current hardcoded Vitrine cards in `renderShowcaseTab()` with `summary.cards`, add a comparison panel using `summary.comparisonRows`, and add a canceled panel:

```js
<section class="mobile-list-panel">
  <h2>Comparativo producao x vendas</h2>
  ${summary.comparisonRows.map(renderMobileComparisonRow).join('') || '<p class="mobile-empty">Sem dados para comparar.</p>'}
</section>
<section class="mobile-list-panel">
  <h2>Cancelados</h2>
  ${summary.canceledLaunches.map(renderCanceledShowcaseLaunch).join('') || '<p class="mobile-empty">Nenhum cancelamento no periodo.</p>'}
</section>
```

Add helpers:

```js
function renderMobileComparisonRow(item) {
  return `
    <article class="mobile-comparison-row">
      <header><strong>${item.produtoNome}</strong><span>${item.categoriaNome}</span></header>
      <div><span>Produzido</span><strong>${item.quantidadeProduzida}</strong></div>
      <div><span>Valor produzido</span><strong>${formatCurrency(item.valorProduzido)}</strong></div>
      <div><span>Vendido</span><strong>${item.quantidadeVendida}</strong></div>
      <div><span>Valor vendido</span><strong>${formatCurrency(item.valorVendido)}</strong></div>
      <div><span>Sobra</span><strong>${item.sobraQuantidade}</strong></div>
      <div><span>Diferenca</span><strong>${formatCurrency(item.diferencaValor)}</strong></div>
      <div><span>% vendido</span><strong>${item.percentualVendido}%</strong></div>
    </article>
  `;
}

function renderCanceledShowcaseLaunch(launch) {
  return `
    <article class="mobile-canceled-card">
      <header><strong>${launch.produtoNome}</strong><span>Cancelado</span></header>
      <p>${launch.categoriaNome} - ${launch.quantidade} un. - ${formatDateTime(launch.canceledAt || launch.dataHora)}</p>
      <strong>${formatCurrency(launch.valorTotal)}</strong>
    </article>
  `;
}
```

- [ ] **Step 3: Render closing form and history**

Replace `renderClosingTab()` body with metric cards, form, preview summary, submit button, and improved history. Wire `change` events for `[data-mobile-closing-field]` and `submit` for `[data-mobile-closing-form]`.

Use these field names:

```html
<input class="field" name="countedCash" data-mobile-closing-field>
<input class="field" name="checkedPix" data-mobile-closing-field>
<input class="field" name="checkedCard" data-mobile-closing-field>
<textarea class="field" name="note" data-mobile-closing-field></textarea>
```

On submit:

```js
await submitMobileClosing(state.closingForm);
state.closingForm = { countedCash: '', checkedPix: '', checkedCard: '', note: '' };
await hydrateOnlineOperationalData({ catalog: false, financial: true, showcase: false });
```

- [ ] **Step 4: Render finance tab**

Add branch in `renderTabContent`:

```js
if (state.tab === 'finance') {
  return renderFinanceTab();
}
```

Render cards from `getMobileFinancialSummary(getMobilePeriodFilters())`, list transactions, payables, CRM rows, and buttons with `data-mobile-finance-action="income|expense|bill"`.

Submit finance forms through `createMobileFinancialTransaction`, and mark payables through `markMobileFinancialTransactionPaid`.

- [ ] **Step 5: Add APP-only CSS**

Append focused classes to `src/styles/mobile.css`:

```css
.mobile-comparison-row,
.mobile-finance-form,
.mobile-closing-form {
  display: grid;
  gap: 10px;
}

.mobile-comparison-row {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.mobile-comparison-row header,
.mobile-canceled-card header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.mobile-comparison-row div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.mobile-canceled-card {
  padding: 12px;
  border: 1px solid rgba(194, 65, 59, 0.35);
  border-radius: 8px;
  background: rgba(194, 65, 59, 0.12);
}

.mobile-canceled-card header span {
  color: #c2413b;
  font-weight: 800;
}

.mobile-form-grid {
  display: grid;
  gap: 10px;
}
```

- [ ] **Step 6: Run syntax checks**

Run:

```bash
node --check src/modules/mobile/mobile-dashboard.module.js
node --check src/services/mobile-showcase.service.js
node --check src/services/mobile-closing.service.js
node --check src/services/mobile-financial.service.js
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit mobile UI**

```bash
git add src/modules/mobile/mobile-dashboard.module.js src/styles/mobile.css
git commit -m "feat: add owner app finance and closing screens"
```

## Task 5: Verification and Scope Guard

**Files:**
- Read only unless a test fails due to implementation issues.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node tests/mobile-showcase-service.test.mjs
node tests/mobile-closing-service.test.mjs
node tests/mobile-financial-service.test.mjs
node tests/financial-sync-service.test.mjs
```

Expected: all pass.

- [ ] **Step 2: Verify web modules were not modified**

Run:

```bash
git diff --name-only HEAD~3..HEAD
```

Expected: no changes to:

```text
src/modules/vendas/vendas.module.js
src/modules/estoque/estoque.module.js
src/modules/caixa/caixa.module.js
src/modules/dashboard/dashboard.module.js
src/modules/despesas/despesas.module.js
```

- [ ] **Step 3: Run browser smoke test if a local server is available**

Start existing server if needed:

```bash
scripts\start-server.cmd
```

Open the APP/PWA route and verify:

- Vitrine shows requested cards and comparison.
- Cancelados show red cards with badge.
- Fechar shows form and improved history.
- Financeiro tab appears and renders cards/forms.
- Desktop web routes keep their existing layout.

- [ ] **Step 4: Final response checklist**

Final answer must include:

- Arquivos alterados.
- Componentes criados.
- Rotas criadas.
- Tabelas utilizadas.
- Testes realizados.
