// QA 2026-11, BUG-018: migracao que restaura a leitura da auditoria para quem
// tem audit.view (admin le 0 linhas em producao).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql = fs.readFileSync(new URL('../supabase/migrations/202611090003_restore_audit_read.sql', import.meta.url), 'utf8');
assert.match(sql, /grant select on table public\.audit_logs to authenticated;/);
assert.match(sql, /create policy "audit viewers read audit logs" on public\.audit_logs\s+for select to authenticated\s+using \(private\.current_profile_has_permission\('audit\.view'\)\);/);
assert.doesNotMatch(sql, /for (all|update|delete)|grant (insert|update|delete)/i, 'so leitura; auditoria continua sem alteracao');
console.log('audit read migration ok');
