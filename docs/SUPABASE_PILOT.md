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

## Chaves usadas no frontend

Hoje o app le `src/config/runtime-config.js`, que expõe:

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
