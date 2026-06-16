# Design: Redesign da Aba Produtos

Data: 2026-06-16

## Base de Trabalho

Este redesign deve ser feito em cima da base aprovada:

- Branch: `codex/showcase-stock-sync`
- Commit base: `e5a344c`
- Deploy Vercel de referencia: `dpl_BH4iWf2qfzimqVjAMAuMTYYFY8kP`
- URL do deploy: `https://pdv-6cktq56hy-luandutra2000s-projects.vercel.app`
- Producao: `https://pdv-blue.vercel.app`
- Cache/PWA atual: `pdv-v51`
- App atual: `app.js?v=20260616-04`

## Objetivo

Melhorar apenas o design e a usabilidade da aba **Produtos**, mantendo as funcoes atuais e preservando os fluxos existentes de catalogo, Supabase, permissoes e CRM de produtos mais vendidos.

A tela deve ficar mais bonita, moderna, organizada e facil de usar, sem alterar regra de negocio, nomes de tabelas, fonte de dados, Frente de Caixa, Vitrine ou App mobile.

## Decisoes Aprovadas

- Usar a direcao visual **A - Dashboard em blocos**.
- Manter a aba como uma tela de gestao, nao transformar em vitrine nem em frente de caixa.
- Preservar Supabase como fonte dos dados quando o app estiver em modo online.
- Nao usar `localStorage` como banco novo para a funcionalidade.
- Nao alterar schema, migrations ou nomes de tabelas para este redesign.
- Nao remover o CRM atual de produtos mais vendidos.
- Nao remover dados atuais do CRM.
- Nao mexer na Frente de Caixa, Vitrine ou App mobile.
- Melhorias simples de alerta visual podem ser implementadas quando derivadas dos dados ja carregados em Produtos.

## Escopo da Tela

### Topo

O topo da aba deve exibir:

- Titulo: **Produtos**
- Subtitulo: **Gerencie categorias, produtos, precos e exibicao na vitrine.**
- Botao **+ Nova categoria**
- Botao **+ Novo produto**

Os botoes continuam abrindo os mesmos fluxos de criacao existentes. A mudanca e visual e de organizacao.

### Cards de Resumo

Abaixo do topo, exibir cards compactos com:

- Total de produtos
- Total de categorias
- Produtos ativos
- Produtos que aparecem na vitrine
- Produto mais vendido

Os valores devem ser calculados a partir dos produtos, categorias e ranking ja disponiveis na tela. Se nao houver vendas no periodo selecionado do CRM, o card de produto mais vendido deve mostrar um estado vazio simples.

### Alertas Visuais Pequenos

Adicionar uma faixa ou grid compacto de alertas quando houver ocorrencias simples de detectar:

- Produtos sem categoria
- Produtos sem preco cadastrado
- Produtos inativos
- Produtos que nao aparecem na vitrine
- Produtos mais vendidos no dia
- Produtos com estoque zerado
- Produtos com venda sem estoque, se essa informacao puder ser inferida com seguranca sem mudar regra de negocio

Esses alertas sao apenas indicadores visuais. Eles nao devem criar novas validacoes obrigatorias nem bloquear cadastro, edicao ou venda.

## Categorias / Abas

Criar uma secao propria para categorias, visualmente separada da lista de produtos.

Cada categoria deve aparecer em card compacto, horizontal ou em grid responsivo, mostrando:

- Nome da categoria
- Quantidade de produtos vinculados
- Status de vitrine: aparece ou nao aparece na vitrine
- Botoes **Editar** e **Apagar**

A categoria selecionada no filtro deve receber destaque visual. Se houver muitas categorias, o layout deve continuar usavel com grid responsivo ou rolagem horizontal, evitando cards duplicados, altos demais ou com area vazia exagerada.

## Produtos Cadastrados

Criar uma secao propria para produtos cadastrados.

### Filtros

Os filtros devem ficar no topo da secao e incluir:

- Busca por nome
- Filtro por categoria
- Filtro por status

O filtro por status deve oferecer:

- Todos
- Ativo
- Inativo
- Aparece na vitrine
- Nao aparece na vitrine

Os filtros apenas reduzem a lista exibida. Nao mudam dados.

### Cards de Produto

Cada card de produto deve mostrar:

- Nome do produto
- Categoria
- Preco
- Estoque atual, quando existir no objeto do produto
- Status ativo/inativo
- Badge **Na vitrine** quando a categoria/produto aparecer na vitrine conforme os dados atuais permitirem
- Botoes **Editar** e **Apagar**

Os cards devem ser modernos, com fundo suave, bordas arredondadas, sombra leve, melhor espacamento e hierarquia clara. Em celular, devem empilhar sem sobrepor texto nem criar areas vazias grandes.

## CRM de Produtos Mais Vendidos

O CRM atual deve ser mantido e melhorado visualmente.

### Dados

Nao remover nenhum dado atual. O ranking deve continuar usando o contrato existente de vendas/produtos, hoje exposto por `getBestSellingProducts`.

### Visual

Mostrar:

- Ranking dos mais vendidos
- Ranking dos menos vendidos entre produtos que tiveram venda no periodo
- Total vendido por produto
- Valor vendido por produto

### Periodos

O filtro por periodo deve exibir:

- Hoje
- Ontem
- 7 dias
- 30 dias
- Personalizado

Se o contrato atual tiver periodos extras, como mes, ano ou todo periodo, eles podem continuar disponiveis desde que nao atrapalhem os periodos obrigatorios. Para 7 e 30 dias, a alteracao deve ser pequena e isolada no calculo de periodo, sem mudar o formato das vendas salvas.

## Modais

### Modal de Produto

Melhorar o design do modal atual de criar/editar produto, mantendo o comportamento existente.

Campos sugeridos, desde que ja existam no contrato atual ou possam ser preenchidos sem quebrar produtos existentes:

- Nome do produto
- Categoria
- Preco
- Produto ativo
- Aparece na vitrine, se o dado estiver disponivel no produto ou for representado de forma segura pela categoria
- Observacao, somente se ja existir

Nao criar campo obrigatorio novo alem dos que ja sao obrigatorios hoje.

### Modal de Categoria

Melhorar o design do modal atual de criar/editar categoria.

Campos:

- Nome da categoria
- Aparece na vitrine
- Status ativo/inativo, somente se ja existir no modelo atual

Nao criar alteracao de banco para adicionar status se o modelo atual nao tiver esse campo.

## Permissoes

O redesign deve respeitar as permissoes existentes:

- Gerenciar produtos
- Gerenciar categorias
- Ver relatorios/CRM

Se a aba atual ainda nao esconde todos os controles por permissao, este redesign nao deve piorar a situacao. Botoes e secoes devem continuar seguindo o padrao atual do projeto. Qualquer reforco de permissao deve ser pontual e compativel com os services existentes.

## Arquitetura e Arquivos Esperados

Mudancas provaveis:

- `src/modules/produtos/produtos.module.js`
- `src/styles/pdv.css`
- Possivelmente `src/styles/forms.css` ou `src/styles/cards.css` para ajustes reutilizaveis pequenos
- `src/services/transaction.service.js` somente se necessario para suportar periodos `7 dias` e `30 dias`
- Testes existentes de produtos/vendas, ou novo teste pequeno para periodo do CRM se o calculo for alterado

Nao alterar:

- Tabelas Supabase
- Migrations, salvo se for descoberta uma incompatibilidade critica fora deste escopo
- Frente de Caixa
- Vitrine
- App mobile
- Fluxo de venda
- Fluxo de estoque

## Estados e Erros

A tela deve continuar exibindo:

- Estado de carregamento
- Erro ao carregar catalogo
- Status de sincronizacao
- Estado vazio de categorias
- Estado vazio de produtos
- Estado vazio do CRM quando nao houver vendas no periodo

Os estados vazios devem ficar visualmente melhores, mas sem esconder problemas reais de carregamento ou sincronizacao.

## Responsividade

O layout deve funcionar em desktop, tablet e celular:

- Cards de resumo quebram em grid responsivo.
- Categorias viram grid estreito ou rolagem horizontal.
- Filtros empilham em telas pequenas.
- Cards de produto mantem acoes visiveis.
- CRM empilha rankings e nao corta textos importantes.

## Testes Obrigatorios

Validar manualmente e/ou por testes automatizados quando couber:

1. Criar categoria.
2. Editar categoria.
3. Apagar categoria.
4. Criar produto.
5. Editar produto.
6. Apagar produto.
7. Filtrar produto por nome.
8. Filtrar produto por categoria.
9. Filtrar produto por status.
10. Confirmar que o CRM de mais vendidos continua funcionando.
11. Confirmar que ranking visual mostra quantidade e valor vendido por produto.
12. Confirmar que dados continuam apos logout/login no ambiente Supabase.
13. Confirmar que Frente de Caixa nao quebrou.
14. Confirmar que Vitrine nao quebrou.
15. Confirmar que o App/PWA nao quebrou.

## Fora de Escopo

- Redesign geral do sistema.
- Mudanca no banco de dados.
- Novas tabelas ou colunas.
- Campos obrigatorios novos.
- Mudanca em Frente de Caixa.
- Mudanca em Vitrine.
- Mudanca em App mobile.
- Alteracao de regras de negocio de produto, estoque, venda ou vitrine.
- Remocao de dados do CRM atual.
- Refatoracao ampla de services.
