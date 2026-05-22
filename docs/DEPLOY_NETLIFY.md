# Deploy Netlify

## Variaveis do Netlify

- `PDV_DATA_PROVIDER=supabase`
- `SUPABASE_URL=https://seu-projeto.supabase.co`
- `SUPABASE_ANON_KEY=chave-publica-anon`

## Passos

1. Criar site no Netlify apontando para o repositorio.
2. Usar `node scripts/generate-runtime-config.mjs` como build command.
3. Usar `.` como publish directory.
4. Configurar as variaveis acima.
5. Fazer deploy.
6. Copiar a URL do Netlify para as URLs autorizadas do Supabase Auth.
