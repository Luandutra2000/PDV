# Supabase Pilot Setup

## Objetivo

Configurar o banco online do piloto do PDV usando Supabase.

## Passos manuais no Supabase

1. Criar um projeto Supabase.
2. Abrir SQL Editor.
3. Rodar o conteudo de `supabase/migrations/202605220001_initial_pdv_pilot.sql`.
4. Criar o primeiro usuario admin em Authentication.
5. Criar linha em `profiles` para esse admin usando o mesmo `id` do Auth.
6. Configurar Auth URL para o dominio do Netlify quando o deploy existir.
7. Depois do primeiro admin, criar operadores pela aba Pessoas do PDV.

## Bootstrap do primeiro admin

Depois de criar o primeiro usuario em Authentication, copie o UUID dele e rode no SQL Editor:

```sql
insert into public.profiles (id, name, role, is_active)
values ('UUID_DO_USUARIO_AUTH', 'Administrador', 'admin', true)
on conflict (id) do update
set name = excluded.name,
    role = excluded.role,
    is_active = excluded.is_active,
    updated_at = now();
```

Use o UUID real do usuario Auth no lugar de `UUID_DO_USUARIO_AUTH`. Esse passo deve ser feito manualmente no SQL Editor para liberar o primeiro acesso administrativo.

## Chaves usadas no frontend

Hoje o app le `src/config/runtime-config.js`, que expoe:

- `dataProvider: 'supabase'`
- `supabaseUrl`
- `supabaseAnonKey`

No piloto online, `dataProvider` deve ser `supabase`.

Depois, o generator Netlify criara `src/config/runtime-config.js` a partir destas variaveis de ambiente:

- `PDV_DATA_PROVIDER`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

No piloto online, `PDV_DATA_PROVIDER` deve ser `supabase`.

O frontend usara apenas:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Nunca colocar `service_role` no frontend.

## Chave service role

A aba Pessoas usa uma Netlify Function para criar usuarios no Auth. Para isso, configure `SUPABASE_SERVICE_ROLE_KEY` no Netlify como variavel secreta.

Essa chave deve ficar somente no Netlify. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` em `src/config/runtime-config.js`, no navegador, em commits ou em prints publicos.

## Smoke test do piloto

1. Fazer login com usuario Auth que tenha linha ativa em `profiles`.
2. Ler o proprio profile.
3. Ler `products`.
4. Inserir uma venda em `sales`.
5. Inserir um registro em `audit_logs` com `user_id` igual ao UUID do usuario logado.

## Caixa no piloto inicial

`cash_sessions` nao entra nesta primeira migration. No piloto inicial, o fluxo de caixa usa `cash_movements` e `cash_closings`.
