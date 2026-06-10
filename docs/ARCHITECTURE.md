# Arquitetura do Projeto

Este documento descreve a estrutura atual do PDV e as regras recomendadas para evoluir o sistema sem quebrar os fluxos existentes.

## Visao geral

O projeto e uma aplicacao frontend modular em JavaScript puro. O `index.html` carrega os arquivos CSS e inicia `src/app.js`, que monta o shell principal com sidebar, topbar e area de trabalho.

Hoje os dados ficam em `localStorage`, usando chaves definidas em `src/database/schema.js`. Essa decisao mantem o desenvolvimento simples nesta fase, mas a arquitetura deve evoluir para uma camada de dados capaz de usar Supabase sem obrigar a reescrever todas as telas.

## Fluxo principal

```text
index.html
  -> src/app.js
    -> renderSidebar()
    -> init dos servicos globais
    -> init do modulo selecionado
      -> services
      -> storage/localStorage
      -> components
      -> styles
```

## Pastas

### `src/modules`

Cada arquivo representa uma tela ou area funcional do sistema.

Exemplos:

- `vendas/vendas.module.js`: frente de caixa.
- `caixa/caixa.module.js`: fechamento de caixa.
- `estoque/estoque.module.js`: lancamentos e comparativos de estoque.
- `produtos/produtos.module.js`: cadastro e edicao de produtos.
- `pessoas/pessoas.module.js`: reservado para usuarios/pessoas.

Regra recomendada: modulos devem cuidar de renderizacao e eventos da tela. Regras de negocio devem ficar em `src/services`.

### `src/services`

Concentra regras de negocio, persistencia e calculos.

Exemplos:

- `storage.service.js`: leitura/escrita local.
- `transaction.service.js`: vendas, movimentos e historico.
- `comanda.service.js`: comanda ativa.
- `estoque.service.js`: producao, vitrine e comparativos.
- `cash-closing.service.js`: fechamento de caixa.
- `sync.service.js`: fila local de eventos pendentes.

Regra recomendada: toda acao sensivel deve passar por um service, especialmente quando entrarem permissoes e auditoria.

### `src/components`

Componentes reutilizaveis de interface.

Exemplos:

- `sidebar.component.js`
- `product-card.component.js`
- `order-panel.component.js`

Regra recomendada: componentes devem receber dados e devolver HTML. Eles nao devem concentrar regras de negocio complexas.

### `src/styles`

CSS separado por responsabilidade.

Arquivos atuais:

- `base.css`: variaveis, reset basico e tema.
- `layout.css`: shell, workspace e estrutura principal.
- `sidebar.css`: menu lateral.
- `buttons.css`: botoes.
- `cards.css`: cards e elementos visuais repetidos.
- `modal.css`: modais.
- `forms.css`: campos e formularios.
- `pdv.css`: telas e componentes especificos do PDV.

Regra recomendada: manter estilos globais pequenos e criar arquivos novos apenas quando houver responsabilidade clara, como `tables.css`, `auth.css` ou `mobile.css`.

### `src/database`

Hoje nao e um banco real. Guarda:

- `schema.js`: chaves de storage e eventos.
- `mock-data.js`: dados iniciais para ambiente local.

Quando Supabase entrar, esta pasta pode receber scripts auxiliares ou continuar apenas como referencia local. As migrations devem ficar em `supabase/migrations`.

### `tests`

Testes simples em Node para servicos.

Regra recomendada: novas regras de negocio devem ter teste em service antes de mexer na UI.

## Estado e persistencia

O estado atual e dividido entre:

- estado temporario de tela dentro dos modulos;
- dados persistidos em `localStorage`;
- eventos locais enviados para `sync.service.js`.

Para evoluir com seguranca, o ideal e criar uma camada de dados com contrato estavel:

```text
modules -> services -> data provider -> localStorage ou Supabase
```

Assim o projeto pode migrar por partes.

## Autenticacao e permissoes

A futura arquitetura deve separar:

- `auth.service.js`: sessao, login, logout e usuario atual.
- `permission.service.js`: checagem de permissoes.
- `audit.service.js`: registro de acoes importantes.
- `pessoas.module.js`: interface de usuarios, funcoes e permissoes.

Permissoes nao devem existir apenas no menu. O service que executa a acao tambem precisa validar permissao.

## Auditoria

Toda acao importante deve gerar um registro com:

- `id`
- `action`
- `entity_type`
- `entity_id`
- `user_id`
- `user_name`
- `metadata`
- `created_at`

A auditoria deve cobrir vendas, cancelamentos, descontos, caixa, estoque, produtos, usuarios e permissoes.

## Supabase

Supabase deve ser introduzido por etapas:

1. Criar schema e migrations.
2. Integrar Auth e `profiles`.
3. Migrar usuarios, roles e permissoes.
4. Migrar produtos e categorias.
5. Migrar vendas, comandas, caixa e estoque.
6. Adicionar realtime onde fizer sentido.

Todas as tabelas publicas devem ter RLS habilitado.

## Cuidados de manutencao

- Nao misturar regra de negocio dentro de HTML template.
- Nao fazer refatoracoes grandes junto com feature nova.
- Nao substituir `localStorage` por Supabase de uma vez.
- Nao esconder botao como unica camada de seguranca.
- Nao commitar arquivos locais, logs, `.env` ou chaves.
- Manter commits pequenos e por assunto.
