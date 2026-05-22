# Supabase Pilot Setup

## Objetivo

Configurar o banco online do piloto do PDV usando Supabase.

## Passos manuais no Supabase

1. Criar um projeto Supabase.
2. Abrir SQL Editor.
3. Rodar o conteudo de `supabase/migrations/202605220001_initial_pdv_pilot.sql`.
4. Criar usuarios em Authentication.
5. Criar linha em `profiles` para cada usuario usando o mesmo `id` do Auth.
6. Definir `profiles.role` como `admin` ou `operador` para cada usuario.
7. Configurar Auth URL para o dominio do Netlify quando o deploy existir.

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

## Smoke test do piloto

1. Fazer login com usuario Auth que tenha linha ativa em `profiles`.
2. Ler o proprio profile.
3. Ler `products`.
4. Inserir uma venda em `sales`.
5. Inserir um registro em `audit_logs` com `user_id` igual ao UUID do usuario logado.

## Caixa no piloto inicial

`cash_sessions` nao entra nesta primeira migration. No piloto inicial, o fluxo de caixa usa `cash_movements` e `cash_closings`.
