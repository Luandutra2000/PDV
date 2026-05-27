# Deploy Vercel

Este projeto pode ser publicado na Vercel como site estatico. O frontend continua em HTML, CSS e JavaScript puro, com `index.html` na raiz.

## O que a Vercel vai hospedar

- Site principal do PDV.
- App do Dono mobile/PWA.
- Arquivos estaticos em `src/`.
- `manifest.json` e `service-worker.js`.

A Vercel hospeda a aplicacao. O banco de dados deve ser conectado separadamente. Para o painel em tempo real, a recomendacao continua sendo Supabase, porque ele oferece Postgres, Auth, RLS e realtime.

## Configuracao do projeto

O arquivo `vercel.json` define:

- Build command para gerar `src/config/runtime-config.js`.
- URLs limpas.
- Fallback para `index.html`.
- Cache controlado para `manifest.json` e `service-worker.js`.
- Cache sem travar para `src/config/runtime-config.js`.
- Cache longo para arquivos estaticos em `src/`.

## Deploy manual pela CLI

1. Instalar a Vercel CLI:

```bash
npm install -g vercel
```

2. Fazer login:

```bash
vercel login
```

3. Criar um preview:

```bash
vercel
```

4. Publicar em producao:

```bash
vercel --prod
```

## Deploy pelo GitHub

1. Subir o projeto para um repositorio no GitHub.
2. Importar o repositorio na Vercel.
3. Manter o build command do `vercel.json`: `node scripts/generate-runtime-config.mjs`.
4. Definir output/root como a raiz do repositorio.
5. Cada push gera um preview.
6. Push na branch principal gera deploy de producao, conforme configuracao da Vercel.

## Supabase

Antes do deploy final, rode a migration:

```text
supabase/migrations/202605270001_initial_pdv_system.sql
```

Ela cria as tabelas principais do sistema, ativa RLS, concede acesso ao papel `authenticated` e prepara perfis/permissoes para dono, administrador e operador.

Depois, configurar na Vercel:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=chave-publica-anon
SUPABASE_SERVICE_ROLE_KEY=chave-service-role
```

O script de build detecta essas variaveis e gera `dataProvider: "supabase"`. Sem elas, o sistema continua em modo local para teste.

`SUPABASE_SERVICE_ROLE_KEY` e usada apenas nas funcoes `/api/create-user` e `/api/list-users` da Vercel para a tela Pessoas. Nunca colocar `service_role` no frontend, no `runtime-config.js` ou em variavel publica.

## Rotas importantes

- `/` abre o PDV no desktop.
- `/?view=mobile` abre o App do Dono.
- `/?view=relatorios` abre a tela de Relatorios.
- Em telas pequenas, o app abre automaticamente o App do Dono.

## Checklist antes de producao

- Confirmar deploy na Vercel.
- Confirmar HTTPS ativo.
- Testar o App do Dono no celular.
- Configurar Supabase Auth com a URL final da Vercel.
- Ativar RLS nas tabelas publicas do Supabase.
- Testar venda, caixa, vitrine e feed ao vivo com dados online.
