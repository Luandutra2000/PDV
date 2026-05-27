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

- URLs limpas.
- Fallback para `index.html`.
- Cache controlado para `manifest.json` e `service-worker.js`.
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
3. Configurar o projeto como estatico, sem build command.
4. Definir output/root como a raiz do repositorio.
5. Cada push gera um preview.
6. Push na branch principal gera deploy de producao, conforme configuracao da Vercel.

## Variaveis futuras para Supabase

Quando a integracao com banco online for feita, configurar na Vercel:

```text
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=chave-publica-anon
APP_DATA_PROVIDER=supabase
```

Essas variaveis devem ser publicas apenas quando forem seguras para frontend. Nunca colocar `service_role` no frontend ou na Vercel como variavel exposta para o navegador.

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
