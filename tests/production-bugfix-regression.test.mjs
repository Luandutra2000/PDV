import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const read = (path) => readFileSync(resolve(path), 'utf8');

const appSource = read('src/app.js');
const reportsSource = read('src/modules/relatorios/relatorios.module.js');
const salesSource = read('src/modules/vendas/vendas.module.js');
const transactionSource = read('src/services/transaction.service.js');
const cashSource = read('src/modules/caixa/caixa.module.js');
const stockSource = read('src/modules/estoque/estoque.module.js');
const providerSource = read('src/services/providers/supabase.provider.js');
const migration = read('supabase/migrations/20260729230000_fix_showcase_reversal_and_realtime.sql');
const onlineSalesMigration = read('supabase/migrations/202609120001_fix_online_sales_showcase_and_company.sql');
const legacyReconciliation = read('supabase/migrations/20260729234500_reconcile_legacy_canceled_showcase_sales.sql');
const userAdminSource = read('src/services/user-admin.service.js');
const adminUsersFunction = read('supabase/functions/admin-users/index.ts');

assert(appSource.includes('relatorios: initRelatoriosModule'), 'reports route should use the real reports module');
assert(reportsSource.includes('getCrmSummary'), 'reports should render authoritative CRM totals');
assert(reportsSource.includes('Formas de pagamento'), 'reports should expose payment totals');
assert(reportsSource.includes('Produtos mais vendidos'), 'reports should expose product ranking');

assert(salesSource.includes('event.stopPropagation()'), 'sales modal actions should not leak clicks into global navigation');
assert(salesSource.includes('buildQuickClosingInput'), 'quick closing should use displayed CRM totals');
assert(transactionSource.includes('const saleSync = syncSaleToSupabase(sale, closedCommand);'), 'sale persistence should be captured before showcase sync');
assert(transactionSource.includes('Promise.resolve(saleSync || sale).then(() => processShowcaseSale(showcaseSaleInput))'), 'showcase sale sync should wait for the sale write');
assert(cashSource.includes("name === 'countedCash' ? ''"), 'negative expected cash should be accepted by the cash input');
assert(cashSource.includes('buildCrmClosingInput'), 'CRM closing should reconcile from the displayed summary');

assert(providerSource.includes('created_by,created_at'), 'stock production hydration should include the responsible user id');
assert(providerSource.includes("usuarioId: row.created_by || ''"), 'stock production should map the responsible user id');
assert(stockSource.includes('resolveStockLaunchUserName(launch)'), 'stock history should resolve a stable user label');

assert(migration.includes('function public.reverse_showcase_sale'), 'stock reversal RPC must be versioned');
assert(migration.includes("movement_type = 'saida_venda'"), 'stock reversal must target sale movements');
assert(migration.includes("set status = 'estornada'"), 'original stock movement must be marked reversed');
assert(migration.includes('alter publication supabase_realtime add table'), 'realtime tables must be added idempotently');
assert(legacyReconciliation.includes("s.status = 'cancelada'"), 'legacy repair must target canceled sales only');
assert(legacyReconciliation.includes('public.reverse_showcase_sale'), 'legacy repair must reuse the idempotent reversal RPC');
assert(onlineSalesMigration.includes('empresa_id uuid'), 'online migration should align the company id column');
assert(onlineSalesMigration.includes('create policy "sales users manage commands online"'), 'online migration should permit authenticated command writes');
assert(onlineSalesMigration.includes('create policy "showcase users manage showcase movements"'), 'online migration should permit authenticated showcase updates');
assert(onlineSalesMigration.includes('group by product_id'), 'showcase sale RPC should aggregate repeated products');

assert(userAdminSource.includes('getSupabaseAuthSession'), 'administrative calls must use the current Supabase session');
assert(userAdminSource.includes('response.status === 401'), 'administrative calls must retry once after refreshing an expired JWT');
assert(adminUsersFunction.includes("body.action === 'listUsers'"), 'administrative function must support remote user hydration');
assert(adminUsersFunction.includes('payload.userId || payload.id'), 'administrative function must accept the frontend user id contract');
assert(adminUsersFunction.includes("requirePermission(actor.id, 'users.delete')"), 'user deletion must enforce the dedicated permission');

console.log('production bugfix regressions ok');
