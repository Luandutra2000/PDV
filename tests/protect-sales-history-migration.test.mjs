// Vendas, comandas e caixa sao registro permanente: a migracao tira o `for all`
// dos itens (operador mudava preco ou apagava itens ja enviados) e o privilegio
// de apagar o historico. O app nao apaga mais nada disso (sem "Limpar historico").
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../supabase/migrations/202611230001_protect_sales_history.sql', import.meta.url), 'utf8');
const sql = source.replace(/--.*$/gm, '');

assert.match(sql, /drop policy if exists "sales users manage sale items online" on public\.sale_items;/);
assert.match(sql, /drop policy if exists "sales users manage command items online" on public\.command_items;/);
assert.match(sql, /drop policy if exists "sales users manage commands online" on public\.commands;/);
assert.doesNotMatch(sql, /for (all|delete)/i, 'nenhuma politica que permita apagar ou tudo');
assert.match(sql, /create policy "sales users insert sale items online" on public\.sale_items\s+for insert to authenticated/);
assert.match(sql, /create policy "sales users insert command items online" on public\.command_items\s+for insert to authenticated/);
assert.match(sql, /create policy "sales users update commands online" on public\.commands\s+for update to authenticated/, 'cancelar comanda continua');
assert.match(sql, /revoke delete on table\s+public\.sales,\s+public\.sale_items,\s+public\.commands,\s+public\.command_items,\s+public\.cash_movements,\s+public\.cash_closings\s+from authenticated, anon;/);
assert.match(sql, /revoke update on table public\.sale_items, public\.command_items from authenticated, anon;/);
assert.doesNotMatch(sql, /grant (update|delete)/i);

// O app so insere itens (sem merge), entao nao precisa de update nem delete neles.
const financialSync = fs.readFileSync(new URL('../src/services/financial-sync.service.js', import.meta.url), 'utf8');
assert.match(financialSync, /upsertRows\(client, saleItemAdapter\.table, saleItemAdapter\.toRows\(sale\), immutable\)/);
assert.match(financialSync, /upsertRows\(client, commandItemAdapter\.table, commandItemAdapter\.toRows\(command\), immutable\)/);
assert.doesNotMatch(financialSync, /\.delete\(\)/, 'sincronizacao financeira nao apaga registros no servidor');

console.log('protect sales history migration ok');
