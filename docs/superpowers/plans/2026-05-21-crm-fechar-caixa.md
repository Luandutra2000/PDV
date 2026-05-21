# CRM e Fechar Caixa Gerencial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a tela `Fechar Caixa / CRM`, mover o Dashboard atual para `Historico de Transacoes`, adicionar fechamento rapido na Frente de Caixa e preparar metricas gerenciais reutilizaveis.

**Architecture:** Services calculam dados e componentes apenas renderizam HTML. `crm-dashboard.service.js` concentra filtros, totais, rankings e series; `cash-closing.service.js` continua dono do fechamento; `dashboard.module.js` vira historico de transacoes; `caixa.module.js` vira o CRM gerencial.

**Tech Stack:** HTML, CSS modular, JavaScript ES modules, localStorage, testes Node `.mjs`, sem biblioteca externa de graficos.

---

## Mapa De Arquivos

- Criar `src/services/crm-dashboard.service.js`: metricas por periodo, cards, rankings, graficos e tabelas.
- Modificar `src/services/transaction.service.js`: categorias de entrada/saida e usuario responsavel, preservando compatibilidade.
- Modificar `src/services/cash-closing.service.js`: aceitar saldo inicial, observacao e fechamento rapido.
- Criar `src/components/dashboard-resumo.component.js`: cards executivos.
- Criar `src/components/graficos-financeiros.component.js`: graficos HTML/CSS.
- Criar `src/components/analise-produtos.component.js`: rankings e tabelas de produtos.
- Criar `src/components/entradas-saidas.component.js`: tabela e modal de movimentos categorizados.
- Criar `src/components/historico-fechamentos.component.js`: lista resumida de fechamentos.
- Criar `src/components/fechamento-rapido-modal.component.js`: modal grande com abas.
- Modificar `src/components/sidebar.component.js`: mover/renomear itens de menu.
- Modificar `src/modules/dashboard/dashboard.module.js`: renomear visualmente para `Historico de Transacoes`.
- Modificar `src/modules/caixa/caixa.module.js`: renderizar o novo `Fechar Caixa / CRM`.
- Modificar `src/modules/vendas/vendas.module.js`: adicionar botao e modal `Fechamento Rapido`.
- Modificar `src/styles/base.css`: adicionar variaveis da nova paleta sem remover as antigas.
- Modificar `src/styles/pdv.css`: estilos do CRM e modal.
- Criar `tests/crm-dashboard-service.test.mjs`: testes de metricas e filtros.
- Modificar `tests/transaction-service.test.mjs`: categorias e usuario em movimentos.
- Modificar `tests/cash-closing-service.test.mjs`: saldo inicial, observacao e fechamento rapido.
- Atualizar documentacao em `docs/ARCHITECTURE.md` ou criar `docs/CRM_MAINTENANCE.md`, preservando docs existentes.

## Task 1: Categorias De Entrada/Saida E Compatibilidade

**Files:**
- Modify: `src/services/transaction.service.js`
- Modify: `tests/transaction-service.test.mjs`

- [ ] **Step 1: Escrever teste falhando para categorias e usuario**

Adicionar ao final de `tests/transaction-service.test.mjs`, antes do `console.log`:

```js
const categorizedEntry = transactions.registerCashMovement({
  type: 'entrada',
  amount: 30,
  category: 'reforco-caixa',
  description: 'Troco inicial',
  userName: 'Administrador'
});

assert(categorizedEntry.category === 'reforco-caixa', 'cash entry should store category');
assert(categorizedEntry.userName === 'Administrador', 'cash entry should store responsible user');

const categorizedOutput = transactions.registerCashMovement({
  type: 'saida',
  amount: 12,
  category: 'compra-ingredientes',
  description: 'Compra de queijo',
  userName: 'Administrador'
});

assert(categorizedOutput.category === 'compra-ingredientes', 'cash output should store category');
assert(categorizedOutput.userName === 'Administrador', 'cash output should store responsible user');

const uncategorized = transactions.getTransactions().find((transaction) => transaction.id === entrada.id);
assert((uncategorized.category || 'sem-categoria') === 'sem-categoria', 'old movements should remain compatible without category');
```

- [ ] **Step 2: Rodar teste e confirmar falha**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: falha em `cash entry should store category`.

- [ ] **Step 3: Atualizar `registerCashMovement`**

Em `src/services/transaction.service.js`, alterar assinatura:

```js
export function registerCashMovement({
  type,
  amount,
  category = 'sem-categoria',
  description = '',
  userName = 'Local'
}) {
```

No objeto `movement`, adicionar:

```js
    category: String(category || 'sem-categoria').trim() || 'sem-categoria',
    userName: String(userName || 'Local').trim() || 'Local',
```

Manter `description`, `createdAt` e `status` como ja existem.

- [ ] **Step 4: Rodar teste**

Run:

```powershell
node tests\transaction-service.test.mjs
```

Expected: `transaction service ok`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\services\transaction.service.js tests\transaction-service.test.mjs
git commit -m "feat: categorize cash movements"
```

Expected: commit criado com mudancas de categoria e usuario.

## Task 2: Service De Metricas Do CRM

**Files:**
- Create: `src/services/crm-dashboard.service.js`
- Create: `tests/crm-dashboard-service.test.mjs`

- [ ] **Step 1: Criar teste falhando do CRM**

Criar `tests/crm-dashboard-service.test.mjs`:

```js
const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js');
const products = await import('../src/services/product.service.js');
const comandas = await import('../src/services/comanda.service.js');
const transactions = await import('../src/services/transaction.service.js');
const crm = await import('../src/services/crm-dashboard.service.js');

storage.ensureSeedData();
comandas.clearComanda();

comandas.addItem(products.getProductById('x-burger'));
comandas.addItem(products.getProductById('x-burger'));
transactions.finalizeComandaPayment({ paymentMethod: 'dinheiro', receivedAmount: 40 });

comandas.addItem(products.getProductById('refrigerante-lata'));
transactions.finalizeComandaPayment({ paymentMethod: 'pix' });

transactions.registerCashMovement({
  type: 'entrada',
  amount: 20,
  category: 'reforco-caixa',
  description: 'Reforco'
});

transactions.registerCashMovement({
  type: 'saida',
  amount: 5,
  category: 'compra-ingredientes',
  description: 'Compra'
});

const period = crm.createPeriodFilter('today');
const summary = crm.getCrmSummary(period);

assert(summary.salesTotal === 38, 'CRM should total period sales');
assert(summary.entriesTotal === 20, 'CRM should total period entries');
assert(summary.outputsTotal === 5, 'CRM should total period outputs');
assert(summary.estimatedProfit === 53, 'CRM should calculate estimated profit');
assert(summary.ticketAverage === 19, 'CRM should calculate ticket average');
assert(summary.paymentTotals.dinheiro === 32, 'CRM should total cash payments');
assert(summary.paymentTotals.pix === 6, 'CRM should total pix payments');

const ranking = crm.getProductRanking(period);
assert(ranking.byQuantity[0].productId === 'x-burger', 'quantity ranking should put x-burger first');
assert(ranking.byRevenue[0].revenue === 32, 'revenue ranking should calculate product revenue');

const categoryRanking = crm.getCategoryRanking(period);
assert(categoryRanking[0].quantity >= 1, 'category ranking should aggregate sold units');

const dailySeries = crm.getSalesSeries(period);
assert(dailySeries.length === 1, 'today series should include one bucket');
assert(dailySeries[0].sales === 38, 'today series should include sales amount');

const movements = crm.getFinancialMovements(period);
assert(movements.length === 4, 'financial movements should include sales, entries and outputs');

console.log('crm dashboard service ok');
```

- [ ] **Step 2: Rodar teste e confirmar falha**

Run:

```powershell
node tests\crm-dashboard-service.test.mjs
```

Expected: falha com `Cannot find module ... crm-dashboard.service.js`.

- [ ] **Step 3: Criar `crm-dashboard.service.js`**

Criar `src/services/crm-dashboard.service.js`:

```js
import { getCategories, getProductById } from './product.service.js';
import { getActiveComanda } from './comanda.service.js';
import { getClosedComandas, getTransactions } from './transaction.service.js';

export function createPeriodFilter(period = 'today', customStart = '', customEnd = '') {
  const now = new Date();

  if (period === 'custom') {
    return {
      period,
      start: customStart ? new Date(`${customStart}T00:00:00`) : null,
      end: customEnd ? new Date(`${customEnd}T23:59:59`) : null
    };
  }

  if (period === 'yesterday') {
    const start = new Date(now);
    start.setDate(now.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return { period, start, end };
  }

  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { period, start, end: now };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { period, start, end: now };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { period: 'today', start, end };
}

export function getCrmSummary(filter = createPeriodFilter()) {
  const transactions = getPeriodTransactions(filter);
  const sales = transactions.filter((transaction) => transaction.type === 'venda');
  const entries = transactions.filter((transaction) => transaction.type === 'entrada');
  const outputs = transactions.filter((transaction) => transaction.type === 'saida');
  const salesTotal = sumTransactions(sales);
  const entriesTotal = sumTransactions(entries);
  const outputsTotal = sumTransactions(outputs);
  const closedComandas = getClosedComandas().filter((comanda) => (
    comanda.status !== 'cancelada' && isInFilter(comanda.closedAt, filter)
  ));

  return {
    salesTotal,
    entriesTotal,
    outputsTotal,
    estimatedProfit: salesTotal + entriesTotal - outputsTotal,
    openComandas: getActiveComanda().items.length ? 1 : 0,
    closedComandas: closedComandas.length,
    ticketAverage: sales.length ? salesTotal / sales.length : 0,
    paymentTotals: {
      dinheiro: sumPayment(sales, 'dinheiro'),
      pix: sumPayment(sales, 'pix'),
      debito: sumPayment(sales, 'debito'),
      credito: sumPayment(sales, 'credito'),
      outros: sumOtherPayments(sales)
    }
  };
}

export function getProductRanking(filter = createPeriodFilter()) {
  const totals = new Map();

  getPeriodSales(filter).forEach((sale) => {
    sale.items.forEach((item) => {
      const product = getProductById(item.productId);
      const current = totals.get(item.productId) || {
        productId: item.productId,
        name: item.name,
        categoryId: product?.categoryId || '',
        quantity: 0,
        revenue: 0
      };

      current.quantity += item.quantity;
      current.revenue += item.total;
      totals.set(item.productId, current);
    });
  });

  const items = Array.from(totals.values());
  return {
    byQuantity: [...items].sort((a, b) => b.quantity - a.quantity),
    byRevenue: [...items].sort((a, b) => b.revenue - a.revenue)
  };
}

export function getCategoryRanking(filter = createPeriodFilter()) {
  const categories = getCategories();
  const totals = new Map();

  getProductRanking(filter).byQuantity.forEach((item) => {
    const category = categories.find((current) => current.id === item.categoryId);
    const current = totals.get(item.categoryId) || {
      categoryId: item.categoryId,
      name: category?.name || 'Sem categoria',
      quantity: 0,
      revenue: 0
    };

    current.quantity += item.quantity;
    current.revenue += item.revenue;
    totals.set(item.categoryId, current);
  });

  return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue);
}

export function getSalesSeries(filter = createPeriodFilter()) {
  const buckets = new Map();

  getPeriodTransactions(filter).forEach((transaction) => {
    const key = formatDateKey(transaction.createdAt);
    const current = buckets.get(key) || { label: key, sales: 0, entries: 0, outputs: 0 };

    if (transaction.type === 'venda') current.sales += Number(transaction.total || 0);
    if (transaction.type === 'entrada') current.entries += Number(transaction.amount || 0);
    if (transaction.type === 'saida') current.outputs += Number(transaction.amount || 0);

    buckets.set(key, current);
  });

  return Array.from(buckets.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export function getFinancialMovements(filter = createPeriodFilter()) {
  return getPeriodTransactions(filter).map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    category: transaction.category || transaction.paymentMethod || 'sem-categoria',
    description: transaction.description || transaction.paymentMethod || `Comanda ${transaction.comandaNumber || ''}`.trim(),
    amount: Number(transaction.total || transaction.amount || 0),
    createdAt: transaction.createdAt,
    userName: transaction.userName || 'Local'
  }));
}

function getPeriodTransactions(filter) {
  return getTransactions().filter((transaction) => (
    transaction.status !== 'cancelada' && isInFilter(transaction.createdAt, filter)
  ));
}

function getPeriodSales(filter) {
  return getPeriodTransactions(filter).filter((transaction) => transaction.type === 'venda');
}

function isInFilter(value, filter) {
  if (!value) return false;
  const date = new Date(value);
  if (filter.start && date < filter.start) return false;
  if (filter.end && date > filter.end) return false;
  return true;
}

function sumTransactions(transactions) {
  return transactions.reduce((total, transaction) => total + Number(transaction.total || transaction.amount || 0), 0);
}

function sumPayment(sales, paymentMethod) {
  return sales
    .filter((sale) => sale.paymentMethod === paymentMethod)
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function sumOtherPayments(sales) {
  return sales
    .filter((sale) => !['dinheiro', 'pix', 'debito', 'credito'].includes(sale.paymentMethod))
    .reduce((total, sale) => total + Number(sale.total || 0), 0);
}

function formatDateKey(value) {
  return new Date(value).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Rodar teste**

Run:

```powershell
node tests\crm-dashboard-service.test.mjs
```

Expected: `crm dashboard service ok`.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\services\crm-dashboard.service.js tests\crm-dashboard-service.test.mjs
git commit -m "feat: add crm dashboard metrics service"
```

Expected: commit criado para o service de metricas.

## Task 3: Navegacao E Historico De Transacoes

**Files:**
- Modify: `src/components/sidebar.component.js`
- Modify: `src/modules/dashboard/dashboard.module.js`
- Modify: `src/app.js`

- [ ] **Step 1: Atualizar sidebar**

Em `src/components/sidebar.component.js`, alterar o grupo `Vendas` para:

```js
{
  title: 'Vendas',
  items: [
    { id: 'frente-caixa', label: 'Frente de Caixa', icon: 'FC', active: true },
    { id: 'dashboard', label: 'Historico de Transacoes', icon: 'HT' }
  ]
}
```

No grupo `Gestao`, remover o item `dashboard`.

No grupo `Financeiro`, alterar:

```js
{ id: 'fechar-caixa', label: 'Fechar Caixa / CRM', icon: 'CX' }
```

- [ ] **Step 2: Renomear tela atual**

Em `src/modules/dashboard/dashboard.module.js`, trocar titulo e subtitulo:

```html
<h1 class="pdv-title">Historico de Transacoes</h1>
<p class="module-subtitle">Comandas finalizadas, entradas, saidas e movimentos do dinheiro.</p>
```

Manter a logica atual intacta.

- [ ] **Step 3: Ajustar placeholder do app para labels longos**

Em `src/app.js`, no `renderModulePlaceholder`, manter a leitura do label atual. Nao alterar rotas nesta tarefa.

- [ ] **Step 4: Rodar checks**

Run:

```powershell
node --check src\components\sidebar.component.js
node --check src\modules\dashboard\dashboard.module.js
node --check src\app.js
```

Expected: nenhum erro de sintaxe.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src\components\sidebar.component.js src\modules\dashboard\dashboard.module.js src\app.js
git commit -m "feat: move transaction history under sales"
```

Expected: commit criado para navegacao.

## Task 4: Componentes Do CRM

**Files:**
- Create: `src/components/dashboard-resumo.component.js`
- Create: `src/components/graficos-financeiros.component.js`
- Create: `src/components/analise-produtos.component.js`
- Create: `src/components/entradas-saidas.component.js`
- Create: `src/components/historico-fechamentos.component.js`

- [ ] **Step 1: Criar componente de resumo**

Criar `src/components/dashboard-resumo.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderDashboardResumo(summary) {
  const cards = [
    ['Total vendido', formatCurrency(summary.salesTotal), 'R$'],
    ['Entradas', formatCurrency(summary.entriesTotal), '+'],
    ['Saidas', formatCurrency(summary.outputsTotal), '-'],
    ['Lucro estimado', formatCurrency(summary.estimatedProfit), '%'],
    ['Ticket medio', formatCurrency(summary.ticketAverage), 'TM'],
    ['Comandas fechadas', summary.closedComandas, 'CF']
  ];

  return `
    <section class="crm-kpis">
      ${cards.map(([label, value, icon]) => `
        <article class="crm-kpi">
          <div class="crm-kpi__icon">${icon}</div>
          <div>
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        </article>
      `).join('')}
    </section>
  `;
}
```

- [ ] **Step 2: Criar componente de graficos**

Criar `src/components/graficos-financeiros.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderGraficosFinanceiros({ summary, series }) {
  const maxSales = Math.max(...series.map((item) => item.sales), 1);
  const payments = summary.paymentTotals;

  return `
    <div class="crm-grid">
      <section class="crm-panel crm-panel--wide">
        <header class="crm-panel__header">
          <h3>Vendas por periodo</h3>
          <span>${series.length} ponto(s)</span>
        </header>
        <div class="crm-bars">
          ${series.map((item) => `
            <div class="crm-bar" style="height:${Math.max((item.sales / maxSales) * 100, 8)}%">
              <span>${item.label.slice(5)}</span>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Formas de pagamento</h3>
        </header>
        ${renderPaymentRow('Dinheiro', payments.dinheiro)}
        ${renderPaymentRow('Pix', payments.pix)}
        ${renderPaymentRow('Debito', payments.debito)}
        ${renderPaymentRow('Credito', payments.credito)}
        ${renderPaymentRow('Outros', payments.outros)}
      </section>
    </div>
  `;
}

function renderPaymentRow(label, value) {
  return `
    <div class="crm-payment-row">
      <span>${label}</span>
      <strong>${formatCurrency(value)}</strong>
    </div>
  `;
}
```

- [ ] **Step 3: Criar componente de produtos**

Criar `src/components/analise-produtos.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderAnaliseProdutos({ productRanking, categoryRanking }) {
  const quantityRows = productRanking.byQuantity.slice(0, 6);
  const revenueRows = productRanking.byRevenue.slice(0, 6);
  const bestCategory = categoryRanking[0];

  return `
    <div class="crm-grid">
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Mais vendidos</h3>
          <span>${bestCategory ? `Categoria destaque: ${bestCategory.name}` : 'Sem vendas'}</span>
        </header>
        ${renderProductRows(quantityRows, 'quantity')}
      </section>
      <section class="crm-panel">
        <header class="crm-panel__header">
          <h3>Ranking por faturamento</h3>
        </header>
        ${renderProductRows(revenueRows, 'revenue')}
      </section>
    </div>
  `;
}

function renderProductRows(rows, mode) {
  if (!rows.length) {
    return '<div class="empty-products">Nenhum produto vendido no periodo.</div>';
  }

  return `
    <div class="crm-table">
      <div class="crm-table__head"><span>Produto</span><span>Qtd</span><span>Total</span></div>
      ${rows.map((item) => `
        <div class="crm-table__row">
          <span>${item.name}</span>
          <span>${item.quantity}</span>
          <strong>${mode === 'revenue' ? formatCurrency(item.revenue) : formatCurrency(item.revenue)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}
```

- [ ] **Step 4: Criar componente de entradas/saidas**

Criar `src/components/entradas-saidas.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderEntradasSaidas(movements) {
  return `
    <section class="crm-panel">
      <header class="crm-panel__header">
        <h3>Movimentacoes financeiras</h3>
        <span>${movements.length} registro(s)</span>
      </header>
      <div class="crm-table">
        <div class="crm-table__head"><span>Movimento</span><span>Categoria</span><span>Valor</span></div>
        ${movements.slice(0, 10).map((movement) => `
          <div class="crm-table__row">
            <span>${movement.description || movement.type}</span>
            <span>${movement.category}</span>
            <strong class="${movement.type === 'saida' ? 'money-negative' : 'money-positive'}">${formatCurrency(movement.amount)}</strong>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
```

- [ ] **Step 5: Criar componente de historico de fechamentos**

Criar `src/components/historico-fechamentos.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderHistoricoFechamentos(closings, getSalesAfterClosing) {
  if (!closings.length) {
    return '<div class="empty-products">Nenhum fechamento salvo.</div>';
  }

  return `
    <section class="crm-panel">
      <header class="crm-panel__header">
        <h3>Historico de fechamentos</h3>
        <span>${closings.length} fechamento(s)</span>
      </header>
      ${closings.slice(0, 5).map((closing) => {
        const afterClosing = getSalesAfterClosing(closing);
        return `
          <article class="crm-closing-row">
            <div>
              <strong>${formatDate(closing.closedAt)}</strong>
              <span>${afterClosing.length ? `${afterClosing.length} venda(s) apos fechamento` : 'Sem vendas apos fechamento'}</span>
            </div>
            <strong>${formatCurrency(closing.totals?.generalDifference || 0)}</strong>
          </article>
        `;
      }).join('')}
    </section>
  `;
}

function formatDate(value) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
```

- [ ] **Step 6: Rodar checks**

Run:

```powershell
node --check src\components\dashboard-resumo.component.js
node --check src\components\graficos-financeiros.component.js
node --check src\components\analise-produtos.component.js
node --check src\components\entradas-saidas.component.js
node --check src\components\historico-fechamentos.component.js
```

Expected: nenhum erro.

- [ ] **Step 7: Commit**

Run:

```powershell
git add src\components\dashboard-resumo.component.js src\components\graficos-financeiros.component.js src\components\analise-produtos.component.js src\components\entradas-saidas.component.js src\components\historico-fechamentos.component.js
git commit -m "feat: add crm dashboard components"
```

Expected: commit criado com componentes.

## Task 5: Tela Fechar Caixa / CRM

**Files:**
- Modify: `src/modules/caixa/caixa.module.js`
- Modify: `src/styles/base.css`
- Modify: `src/styles/pdv.css`

- [ ] **Step 1: Atualizar imports do modulo de caixa**

No topo de `src/modules/caixa/caixa.module.js`, adicionar imports:

```js
import {
  createPeriodFilter,
  getCategoryRanking,
  getCrmSummary,
  getFinancialMovements,
  getProductRanking,
  getSalesSeries
} from '../../services/crm-dashboard.service.js';
import { renderDashboardResumo } from '../../components/dashboard-resumo.component.js';
import { renderGraficosFinanceiros } from '../../components/graficos-financeiros.component.js';
import { renderAnaliseProdutos } from '../../components/analise-produtos.component.js';
import { renderEntradasSaidas } from '../../components/entradas-saidas.component.js';
import { renderHistoricoFechamentos } from '../../components/historico-fechamentos.component.js';
```

Manter imports existentes de fechamento.

- [ ] **Step 2: Adicionar estado de periodo**

Em `caixaState`, adicionar:

```js
  period: 'today',
  customStart: '',
  customEnd: '',
```

- [ ] **Step 3: Criar render principal do CRM**

Substituir o corpo principal de `renderCaixa(container)` para renderizar:

```js
function renderCaixa(container) {
  const filter = createPeriodFilter(caixaState.period, caixaState.customStart, caixaState.customEnd);
  const summary = getCrmSummary(filter);
  const productRanking = getProductRanking(filter);
  const categoryRanking = getCategoryRanking(filter);
  const series = getSalesSeries(filter);
  const movements = getFinancialMovements(filter);
  const closings = getCashClosings();

  container.innerHTML = `
    <section class="module-screen crm-screen" data-caixa-screen>
      <header class="crm-header">
        <div>
          <h1 class="pdv-title">Fechar Caixa / CRM</h1>
          <p class="module-subtitle">Caixa, vendas, produtos, movimentacoes e fechamento em uma visao gerencial.</p>
        </div>
        ${renderPeriodFilters()}
      </header>

      ${renderDashboardResumo(summary)}
      ${renderGraficosFinanceiros({ summary, series })}
      ${renderAnaliseProdutos({ productRanking, categoryRanking })}
      <div class="crm-grid">
        ${renderFastClosingPanel(summary)}
        ${renderEntradasSaidas(movements)}
      </div>
      ${renderHistoricoFechamentos(closings, getSalesAfterClosing)}
    </section>
  `;
}
```

- [ ] **Step 4: Criar filtros e painel de fechamento**

Adicionar ao modulo:

```js
function renderPeriodFilters() {
  const options = [
    ['today', 'Hoje'],
    ['yesterday', 'Ontem'],
    ['week', 'Semana'],
    ['month', 'Mes'],
    ['custom', 'Personalizado']
  ];

  return `
    <div class="crm-filters">
      ${options.map(([value, label]) => `
        <button class="crm-filter ${caixaState.period === value ? 'is-active' : ''}" type="button" data-crm-period="${value}">${label}</button>
      `).join('')}
      ${caixaState.period === 'custom' ? `
        <input class="field" type="date" data-crm-custom-start value="${caixaState.customStart}">
        <input class="field" type="date" data-crm-custom-end value="${caixaState.customEnd}">
      ` : ''}
    </div>
  `;
}

function renderFastClosingPanel(summary) {
  return `
    <section class="crm-panel crm-closing-card">
      <header class="crm-panel__header">
        <h3>Fechamento completo</h3>
        <span>Resumo do periodo selecionado</span>
      </header>
      <div class="crm-payment-row"><span>Vendas</span><strong>${formatCurrency(summary.salesTotal)}</strong></div>
      <div class="crm-payment-row"><span>Entradas</span><strong>${formatCurrency(summary.entriesTotal)}</strong></div>
      <div class="crm-payment-row"><span>Saidas</span><strong>${formatCurrency(summary.outputsTotal)}</strong></div>
      <div class="crm-payment-row"><span>Dinheiro esperado</span><strong>${formatCurrency(summary.paymentTotals.dinheiro + summary.entriesTotal - summary.outputsTotal)}</strong></div>
      <div class="crm-payment-row"><span>Pix esperado</span><strong>${formatCurrency(summary.paymentTotals.pix)}</strong></div>
      <div class="crm-payment-row"><span>Cartoes</span><strong>${formatCurrency(summary.paymentTotals.debito + summary.paymentTotals.credito)}</strong></div>
      <button class="button" type="button" data-caixa-step="payments">Abrir fechamento detalhado</button>
    </section>
  `;
}
```

- [ ] **Step 5: Adicionar eventos de filtro**

Em `bindCaixaEvents`, adicionar antes dos handlers antigos:

```js
    const periodButton = event.target.closest('[data-crm-period]');

    if (periodButton) {
      caixaState.period = periodButton.dataset.crmPeriod;
      renderCaixa(container);
      return;
    }
```

No listener de `input`, adicionar:

```js
    if (event.target.matches('[data-crm-custom-start]')) {
      caixaState.customStart = event.target.value;
      renderCaixa(container);
      return;
    }

    if (event.target.matches('[data-crm-custom-end]')) {
      caixaState.customEnd = event.target.value;
      renderCaixa(container);
      return;
    }
```

- [ ] **Step 6: Adicionar variaveis de paleta**

Em `src/styles/base.css`, no `:root`, adicionar sem remover as atuais:

```css
  --crm-bg: #f8f2ec;
  --crm-surface: #ffffff;
  --crm-muted: #f4ebe3;
  --crm-border: #eee0d6;
  --crm-text: #2e2a27;
  --crm-text-muted: #8b8179;
  --crm-orange: #ff6b1a;
  --crm-orange-soft: #fff0e6;
```

- [ ] **Step 7: Adicionar CSS do CRM**

Append em `src/styles/pdv.css`:

```css
.crm-screen {
  background: var(--crm-bg);
}

.crm-header,
.crm-filters,
.crm-kpis,
.crm-grid {
  display: grid;
  gap: 12px;
}

.crm-header {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
}

.crm-filters {
  grid-auto-flow: column;
  align-items: center;
}

.crm-filter {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--crm-border);
  border-radius: 8px;
  background: var(--crm-surface);
  color: var(--crm-text-muted);
  font-weight: 800;
}

.crm-filter.is-active {
  border-color: var(--crm-orange);
  background: var(--crm-orange);
  color: #ffffff;
}

.crm-kpis {
  grid-template-columns: repeat(6, minmax(0, 1fr));
}

.crm-kpi,
.crm-panel {
  border: 1px solid var(--crm-border);
  border-radius: 9px;
  background: var(--crm-surface);
  padding: 14px;
}

.crm-kpi {
  display: flex;
  gap: 10px;
  align-items: center;
}

.crm-kpi__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 9px;
  background: var(--crm-orange);
  color: #ffffff;
  font-weight: 900;
}

.crm-kpi span,
.crm-panel__header span {
  color: var(--crm-text-muted);
  font-size: 12px;
  font-weight: 800;
}

.crm-kpi strong {
  display: block;
  color: var(--crm-text);
  font-size: 20px;
}

.crm-grid {
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
}

.crm-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.crm-bars {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
  align-items: end;
  gap: 10px;
  height: 210px;
  padding: 14px 10px 24px;
  border-radius: 8px;
  background: #fff8f3;
}

.crm-bar {
  position: relative;
  min-height: 18px;
  border-radius: 8px 8px 2px 2px;
  background: var(--crm-orange);
}

.crm-bar span {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  color: var(--crm-text-muted);
  font-size: 11px;
}

.crm-payment-row,
.crm-closing-row,
.crm-table__head,
.crm-table__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--crm-border);
}

.crm-table__head,
.crm-table__row {
  grid-template-columns: 1.2fr 0.8fr 0.8fr;
}

.crm-table__head {
  color: var(--crm-text-muted);
  font-size: 12px;
  font-weight: 900;
}

.crm-closing-card {
  border-color: #ffd6b7;
  background: #fffaf6;
}

@media (max-width: 1100px) {
  .crm-header,
  .crm-grid,
  .crm-kpis {
    grid-template-columns: 1fr;
  }

  .crm-filters {
    grid-auto-flow: row;
  }
}
```

- [ ] **Step 8: Rodar checks e testes**

Run:

```powershell
node --check src\modules\caixa\caixa.module.js
node tests\crm-dashboard-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Expected: checks sem erro e testes `ok`.

- [ ] **Step 9: Commit**

Run:

```powershell
git add src\modules\caixa\caixa.module.js src\styles\base.css src\styles\pdv.css
git commit -m "feat: build fechar caixa crm screen"
```

Expected: commit criado para a tela CRM.

## Task 6: Fechamento Rapido Na Frente De Caixa

**Files:**
- Create: `src/components/fechamento-rapido-modal.component.js`
- Modify: `src/modules/vendas/vendas.module.js`
- Modify: `src/services/cash-closing.service.js`
- Modify: `tests/cash-closing-service.test.mjs`

- [ ] **Step 1: Escrever teste para observacao obrigatoria em diferenca**

Adicionar em `tests/cash-closing-service.test.mjs`, antes do `console.log`:

```js
const invalidDifferenceDraft = closing.saveClosingDraft({
  countedCash: 1,
  differences: [
    {
      scope: 'payment',
      referenceId: 'dinheiro',
      reason: 'erro-caixa',
      note: '',
      amount: -10
    }
  ]
});

let rejectedMissingNote = false;
try {
  closing.confirmClosing(invalidDifferenceDraft);
} catch (error) {
  rejectedMissingNote = error.message === 'Toda divergencia precisa de observacao.';
}
assert(rejectedMissingNote, 'quick closing should require note when there is difference');
```

- [ ] **Step 2: Rodar teste e confirmar falha**

Run:

```powershell
node tests\cash-closing-service.test.mjs
```

Expected: falha em `quick closing should require note when there is difference`.

- [ ] **Step 3: Ajustar validacao de fechamento**

Em `src/services/cash-closing.service.js`, dentro de `confirmClosing`, trocar a validacao de `missingReason` por:

```js
  const missingReason = (draft.differences || []).some((difference) => !difference.reason);
  const missingNote = (draft.differences || []).some((difference) => (
    Number(difference.amount || difference.quantity || 0) !== 0 && !String(difference.note || '').trim()
  ));

  if (missingReason) {
    throw new Error('Toda divergencia precisa de motivo.');
  }

  if (missingNote) {
    throw new Error('Toda divergencia precisa de observacao.');
  }
```

- [ ] **Step 4: Criar componente do modal**

Criar `src/components/fechamento-rapido-modal.component.js`:

```js
import { formatCurrency } from '../utils/currency.js';

export function renderFechamentoRapidoModal({ activeTab, summary, showcase, state }) {
  return `
    <div class="modal-backdrop is-open">
      <div class="modal quick-closing-modal" role="dialog" aria-modal="true">
        <header class="modal__header">
          <h2>Fechamento Rapido</h2>
          <button class="icon-button" type="button" data-action="close-modal">X</button>
        </header>
        <nav class="quick-closing-tabs">
          ${renderTab('caixa', 'Caixa', activeTab)}
          ${renderTab('pagamentos', 'Pagamentos', activeTab)}
          ${renderTab('vitrine', 'Vitrine', activeTab)}
          ${renderTab('confirmar', 'Confirmar', activeTab)}
        </nav>
        <div class="quick-closing-body">
          ${renderTabContent(activeTab, summary, showcase, state)}
        </div>
      </div>
    </div>
  `;
}

function renderTab(id, label, activeTab) {
  return `<button class="quick-closing-tab ${activeTab === id ? 'is-active' : ''}" type="button" data-quick-closing-tab="${id}">${label}</button>`;
}

function renderTabContent(activeTab, summary, showcase, state) {
  if (activeTab === 'pagamentos') return renderPayments(summary, state);
  if (activeTab === 'vitrine') return renderShowcase(showcase, state);
  if (activeTab === 'confirmar') return renderConfirm(summary, state);
  return renderCash(summary);
}

function renderCash(summary) {
  return `
    <div class="summary-grid">
      ${renderCard('Vendas', summary.salesTotal)}
      ${renderCard('Entradas', summary.entriesTotal)}
      ${renderCard('Saidas', summary.outputsTotal)}
      ${renderCard('Lucro estimado', summary.estimatedProfit)}
      ${renderCard('Dinheiro esperado', summary.paymentTotals.dinheiro + summary.entriesTotal - summary.outputsTotal)}
      ${renderCard('Comandas fechadas', summary.closedComandas, false)}
    </div>
  `;
}

function renderPayments(summary, state) {
  return `
    <div class="closing-form-grid">
      ${renderInput('countedCash', 'Dinheiro contado', state.countedCash)}
      ${renderInput('checkedPix', `Pix esperado: ${formatCurrency(summary.paymentTotals.pix)}`, state.checkedPix)}
      ${renderInput('checkedDebit', `Debito esperado: ${formatCurrency(summary.paymentTotals.debito)}`, state.checkedDebit)}
      ${renderInput('checkedCredit', `Credito esperado: ${formatCurrency(summary.paymentTotals.credito)}`, state.checkedCredit)}
    </div>
  `;
}

function renderShowcase(showcase, state) {
  if (!showcase.length) {
    return '<div class="empty-products">Nenhum produto lancado na vitrine hoje.</div>';
  }

  return `
    <div class="comparison-table">
      <table>
        <thead><tr><th>Produto</th><th>Produzido</th><th>Vendido</th><th>Baixado</th><th>Sobra esperada</th><th>Sobra contada</th></tr></thead>
        <tbody>
          ${showcase.map((item) => `
            <tr>
              <td>${item.productName}</td>
              <td>${item.producedQuantity}</td>
              <td>${item.soldQuantity}</td>
              <td>${item.writeOffQuantity}</td>
              <td>${item.expectedLeftoverQuantity}</td>
              <td><input class="field closing-small-input" data-quick-leftover data-product-id="${item.productId}" value="${state.leftovers[item.productId] || ''}" type="number" min="0"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderConfirm(summary, state) {
  return `
    <label class="stacked-label">
      Observacao do fechamento
      <input class="field" data-quick-note value="${state.note || ''}" placeholder="Obrigatoria se houver diferenca">
    </label>
    <div class="payment-total">
      <span>Lucro estimado</span>
      <strong>${formatCurrency(summary.estimatedProfit)}</strong>
    </div>
    <div class="form-actions">
      <button class="button button--ghost" type="button" data-action="close-modal">Cancelar</button>
      <button class="button" type="button" data-action="confirm-quick-closing">Fechar caixa</button>
    </div>
  `;
}

function renderCard(label, value, isCurrency = true) {
  return `<article class="summary-card"><span>${label}</span><strong>${isCurrency ? formatCurrency(value) : value}</strong></article>`;
}

function renderInput(name, label, value) {
  return `
    <label class="stacked-label closing-field">
      ${label}
      <input class="field" data-quick-payment="${name}" type="number" min="0" step="0.01" value="${value || ''}">
    </label>
  `;
}
```

- [ ] **Step 5: Conectar modal em `vendas.module.js`**

Adicionar imports:

```js
import { renderFechamentoRapidoModal } from '../../components/fechamento-rapido-modal.component.js';
import { createPeriodFilter, getCrmSummary } from '../../services/crm-dashboard.service.js';
import { buildShowcaseConference, confirmClosing, saveClosingDraft } from '../../services/cash-closing.service.js';
```

Adicionar ao `state`:

```js
  quickClosingTab: 'caixa',
  quickClosing: {
    countedCash: '',
    checkedPix: '',
    checkedDebit: '',
    checkedCredit: '',
    leftovers: {},
    note: ''
  }
```

No header da Frente de Caixa, adicionar botao junto de `Perda / Consumo`:

```html
<button class="button button--ghost" type="button" data-action="open-quick-closing">Fechamento Rapido</button>
```

No `handleOrderAction`, adicionar:

```js
  if (action === 'open-quick-closing') {
    state.modal = 'quick-closing';
    state.quickClosingTab = 'caixa';
  }

  if (action === 'confirm-quick-closing') {
    confirmQuickClosing(container);
  }
```

No listener de click, antes de `actionButton`, tratar aba:

```js
    const quickClosingTab = event.target.closest('[data-quick-closing-tab]');

    if (quickClosingTab) {
      state.quickClosingTab = quickClosingTab.dataset.quickClosingTab;
      renderModal(container);
      return;
    }
```

No listener de input, adicionar:

```js
    if (event.target.matches('[data-quick-payment]')) {
      state.quickClosing[event.target.dataset.quickPayment] = event.target.value;
      renderModal(container);
    }

    if (event.target.matches('[data-quick-leftover]')) {
      state.quickClosing.leftovers[event.target.dataset.productId] = event.target.value;
      renderModal(container);
    }

    if (event.target.matches('[data-quick-note]')) {
      state.quickClosing.note = event.target.value;
    }
```

Em `renderModal`, antes de `renderCashMovementModal`, adicionar:

```js
  if (state.modal === 'quick-closing') {
    const period = createPeriodFilter('today');
    target.innerHTML = renderFechamentoRapidoModal({
      activeTab: state.quickClosingTab,
      summary: getCrmSummary(period),
      showcase: buildShowcaseConference(state.quickClosing.leftovers),
      state: state.quickClosing
    });
    return;
  }
```

Adicionar funcao:

```js
function confirmQuickClosing(container) {
  try {
    const draft = saveClosingDraft({
      countedCash: state.quickClosing.countedCash,
      checkedPix: state.quickClosing.checkedPix,
      checkedDebit: state.quickClosing.checkedDebit,
      checkedCredit: state.quickClosing.checkedCredit,
      leftovers: state.quickClosing.leftovers,
      differences: [],
      note: state.quickClosing.note
    });
    confirmClosing(draft);
    showNotification({
      title: 'Caixa fechado',
      message: 'Fechamento rapido salvo no historico.',
      type: 'success'
    });
    state.modal = null;
    state.quickClosingTab = 'caixa';
    state.quickClosing = {
      countedCash: '',
      checkedPix: '',
      checkedDebit: '',
      checkedCredit: '',
      leftovers: {},
      note: ''
    };
    renderModal(container);
  } catch (error) {
    showNotification({
      title: 'Nao foi possivel fechar',
      message: error.message || 'Confira os dados do fechamento.',
      type: 'danger'
    });
  }
}
```

- [ ] **Step 6: Adicionar CSS do modal**

Append em `src/styles/pdv.css`:

```css
.quick-closing-modal {
  width: min(980px, 100%);
}

.quick-closing-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 18px 0;
}

.quick-closing-tab {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-weight: 800;
}

.quick-closing-tab.is-active {
  border-color: var(--crm-orange);
  background: var(--crm-orange);
  color: #ffffff;
}

.quick-closing-body {
  padding: 18px;
}
```

- [ ] **Step 7: Rodar testes e checks**

Run:

```powershell
node tests\cash-closing-service.test.mjs
node --check src\components\fechamento-rapido-modal.component.js
node --check src\modules\vendas\vendas.module.js
```

Expected: teste ok e checks sem erro.

- [ ] **Step 8: Commit**

Run:

```powershell
git add src\components\fechamento-rapido-modal.component.js src\modules\vendas\vendas.module.js src\services\cash-closing.service.js src\styles\pdv.css tests\cash-closing-service.test.mjs
git commit -m "feat: add quick closing modal to sales screen"
```

Expected: commit criado para fechamento rapido.

## Task 7: Documentacao De Manutencao

**Files:**
- Create or Modify: `docs/CRM_MAINTENANCE.md`

- [ ] **Step 1: Criar documento de manutencao**

Criar `docs/CRM_MAINTENANCE.md`:

```markdown
# CRM E Fechar Caixa - Manutencao

## Onde Ficam As Regras

- `src/services/crm-dashboard.service.js`: filtros, cards, rankings, series e movimentacoes.
- `src/services/cash-closing.service.js`: fechamento, historico e vendas apos fechamento.
- `src/services/transaction.service.js`: vendas, entradas, saidas e categorias.
- `src/services/estoque.service.js`: vitrine, producao, vendas e baixas.

## Como Os Filtros Funcionam

O CRM usa `createPeriodFilter(period, customStart, customEnd)`.

- `today`: dia atual.
- `yesterday`: dia anterior.
- `week`: ultimos 7 dias.
- `month`: mes atual.
- `custom`: intervalo informado pelo usuario.

Todos os totais do CRM devem receber o mesmo filtro para manter os cards, graficos e tabelas sincronizados.

## Como O Caixa E Calculado

O dinheiro esperado segue:

```text
dinheiro esperado = vendas em dinheiro + entradas - saidas
```

Pix, debito e credito usam as vendas finalizadas com essas formas de pagamento.

## Categorias De Entrada E Saida

Movimentos novos salvam `category` e `userName`.

Movimentos antigos sem categoria devem aparecer como `sem-categoria`.

## Fechamento Rapido

O modal da Frente de Caixa usa:

- `crm-dashboard.service.js` para resumo do dia.
- `cash-closing.service.js` para salvar fechamento.
- `estoque.service.js` para vitrine.

## Paleta Visual

As variaveis da base laranja ficam em `src/styles/base.css` com prefixo `--crm-*`.

## Migracao Futura Para Banco

As estruturas futuras principais sao:

- `cash_sessions`
- `cash_movements`
- `sales`
- `sale_items`
- `products`
- `categories`
- `payment_methods`
- `users`
```

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs\CRM_MAINTENANCE.md
git commit -m "docs: document crm maintenance notes"
```

Expected: commit criado para documentacao.

## Task 8: Verificacao Final Manual

**Files:**
- No planned code edits.

- [ ] **Step 1: Rodar todos os testes**

Run:

```powershell
node tests\product-service.test.mjs
node tests\estoque-service.test.mjs
node tests\transaction-service.test.mjs
node tests\cash-closing-service.test.mjs
node tests\crm-dashboard-service.test.mjs
```

Expected:

```text
product service crud ok
estoque service ok
transaction service ok
cash closing service ok
crm dashboard service ok
```

- [ ] **Step 2: Rodar checks de sintaxe principais**

Run:

```powershell
node --check src\app.js
node --check src\modules\dashboard\dashboard.module.js
node --check src\modules\caixa\caixa.module.js
node --check src\modules\vendas\vendas.module.js
node --check src\services\crm-dashboard.service.js
```

Expected: nenhum erro.

- [ ] **Step 3: Subir servidor local**

Run:

```powershell
$python = 'C:\Users\luand\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
Start-Process -FilePath $python -ArgumentList @('-m','http.server','5500','--bind','127.0.0.1') -WorkingDirectory (Get-Location).Path -WindowStyle Hidden
```

Abrir:

```text
http://127.0.0.1:5500/
```

Expected: app abre.

- [ ] **Step 4: Verificacao no app**

Passos:

1. Abrir `Frente de Caixa`.
2. Confirmar botoes `Perda / Consumo` e `Fechamento Rapido`.
3. Abrir `Fechamento Rapido`.
4. Alternar abas `Caixa`, `Pagamentos`, `Vitrine`, `Confirmar`.
5. Fechar o modal.
6. Abrir `Historico de Transacoes` no grupo `Vendas`.
7. Confirmar que a tela antiga de historico continua funcionando.
8. Abrir `Fechar Caixa / CRM`.
9. Trocar filtros `Hoje`, `Semana`, `Mes`.
10. Conferir cards, graficos, ranking e movimentacoes.

Expected: tudo renderiza sem erro visual grave e sem erro no console.

## Self-Review

- Spec coverage: o plano cobre navegacao, historico de transacoes, CRM, paleta, filtros, cards, graficos, rankings, categorias de entrada/saida, fechamento rapido, documentacao e commits.
- Placeholder scan: nao ha tarefas abertas sem conteudo; cada passo de codigo tem snippet ou comando concreto.
- Type consistency: nomes usados no plano sao consistentes: `crm-dashboard.service.js`, `createPeriodFilter`, `getCrmSummary`, `renderFechamentoRapidoModal`, `Historico de Transacoes`, `Fechar Caixa / CRM`.
- Scope control: app real, banco real, login/permissao, impressao e biblioteca de graficos ficam fora desta entrega.
