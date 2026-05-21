# Sistema PDV para Lanchonete - Design

## Objetivo

Criar a primeira versao de um sistema PDV modular para lanchonetes, usando HTML, CSS modular e JavaScript modular sem framework. A base deve permitir venda por comanda, controle inicial de caixa, produtos mockados, comanda lateral funcional, subtotal em tempo real e uma arquitetura preparada para substituir dados locais por banco/API no futuro.

Esta primeira entrega prioriza a Frente de Caixa e a estrutura do projeto. Caixa completo, estoque completo, relatorios completos e integracao real com aplicativo ficam preparados em modulos, mas nao entram como funcionalidades finais nesta primeira etapa.

## Referencia Visual

O layout inicial seguira a composicao da imagem de referencia enviada pelo usuario:

- Sidebar fixa a esquerda com agrupamento de menus.
- Barra superior com status resumido do caixa.
- Area central para Frente de Caixa, busca, categorias e cards de produtos.
- Painel lateral direito para Comanda.
- Rodape do painel de comanda com subtotal e acoes.

As cores nao sao prioridade nesta etapa. A paleta sera provisoria e podera ser alterada depois sem mudar a arquitetura.

## Estrutura de Pastas

```text
/
|-- index.html
`-- src/
    |-- app.js
    |-- modules/
    |   |-- caixa/
    |   |   `-- caixa.module.js
    |   |-- comandas/
    |   |   `-- comandas.module.js
    |   |-- produtos/
    |   |   `-- produtos.module.js
    |   |-- estoque/
    |   |   `-- estoque.module.js
    |   |-- vendas/
    |   |   `-- vendas.module.js
    |   |-- relatorios/
    |   |   `-- relatorios.module.js
    |   |-- despesas/
    |   |   `-- despesas.module.js
    |   |-- dashboard/
    |   |   `-- dashboard.module.js
    |   |-- pessoas/
    |   |   `-- pessoas.module.js
    |   `-- sync-app/
    |       `-- sync-app.module.js
    |-- components/
    |   |-- sidebar.component.js
    |   |-- product-card.component.js
    |   `-- order-panel.component.js
    |-- services/
    |   |-- storage.service.js
    |   |-- event-bus.service.js
    |   |-- product.service.js
    |   |-- comanda.service.js
    |   |-- caixa.service.js
    |   `-- sync.service.js
    |-- database/
    |   |-- mock-data.js
    |   `-- schema.js
    |-- utils/
    |   |-- currency.js
    |   `-- dom.js
    |-- styles/
    |   |-- base.css
    |   |-- layout.css
    |   |-- sidebar.css
    |   |-- buttons.css
    |   |-- cards.css
    |   |-- modal.css
    |   |-- forms.css
    |   `-- pdv.css
    `-- assets/
```

## Arquitetura

O projeto sera dividido em modulos de tela, componentes reutilizaveis, services de regra/dados e utilitarios. A comunicacao principal seguira este fluxo:

```text
Componentes de UI
  -> Modulo da tela
  -> Services de dominio
  -> storage.service.js
  -> localStorage
```

Eventos relevantes tambem serao publicados no `event-bus.service.js`. O `sync.service.js` assinara esses eventos e registrara eventos pendentes de sincronizacao no `localStorage`, simulando a fila que futuramente podera ser enviada para Firebase, Supabase ou WebSocket.

## Modulos

### Frente de Caixa / Vendas

Responsavel pela tela inicial do sistema. Deve renderizar produtos, filtros de categoria, busca, botao de item avulso, acoes de adicionar produto a comanda e atualizacao do subtotal.

### Comandas

Responsavel pelo estado da comanda ativa. Na primeira versao, deve suportar criar ou carregar uma comanda ativa, adicionar itens, remover itens, alterar quantidade e calcular subtotal.

Status previstos: `aberta`, `fechada`, `cancelada`.

### Caixa

Na primeira versao, tera estrutura inicial para representar caixa aberto, saldo atual e formas de pagamento futuras. A operacao completa de abrir caixa, fechar caixa, entradas, saidas e conferencia fica preparada para implementacao posterior.

### Produtos

Responsavel pelo acesso a lista mockada de produtos, categorias, busca e produtos ativos. Cadastro completo de produtos sera preparado no modulo, mas nao precisa estar funcional na primeira entrega.

### Estoque

Tera arquivo inicial e contrato preparado para baixa automatica futura. A primeira entrega nao precisa executar movimentacao real de estoque.

### Relatorios

Tera arquivo inicial e estrutura preparada para consumir vendas, comandas, caixa e produtos no futuro. Relatorios completos ficam fora da primeira entrega.

### Dashboard

Tera arquivo inicial para cards como caixa atual, vendas do dia, comandas abertas e despesas. A tela completa fica fora da primeira entrega.

### Pessoas, Despesas e Fichario / Fiado

Terao entradas na sidebar e arquivos base para crescimento futuro. A implementacao funcional desses fluxos nao entra na primeira versao.

### Sync App

Responsavel por preparar a integracao futura com aplicativo. Toda acao importante deve gerar evento de sincronizacao:

- Produto adicionado a comanda.
- Produto removido da comanda.
- Quantidade alterada.
- Venda finalizada.
- Entrada ou saida de caixa, quando o caixa for implementado.
- Fechamento de caixa, quando o caixa for implementado.

## Dados e Persistencia

A primeira versao usara dados mockados e `localStorage`.

`mock-data.js` definira produtos, categorias e estado inicial. `storage.service.js` sera o unico ponto de leitura e escrita no `localStorage`. Outros modulos nao devem acessar `localStorage` diretamente.

Esse isolamento permitira trocar a persistencia por Supabase, Firebase, WebSocket ou API REST sem reescrever a interface.

## Componentes Iniciais

`sidebar.component.js` renderiza a navegacao:

- Frente de Caixa
- Dashboard
- Produtos
- Pessoas
- Estoque
- Fechar Caixa
- Fichario / Fiado
- Despesas
- Relatorios
- Suporte

`product-card.component.js` renderiza um produto com nome, categoria e preco.

`order-panel.component.js` renderiza a comanda lateral, estado vazio, itens, controles de quantidade, remocao e subtotal.

## Funcionalidades da Primeira Entrega

- Estrutura de pastas obrigatoria.
- Arquivos iniciais por modulo.
- Layout base inspirado na referencia, com cores provisorias.
- Sidebar com os menus solicitados.
- Tela inicial da Frente de Caixa.
- Cards de produtos mockados.
- Busca de produto.
- Filtro por categoria.
- Botao visual de item avulso.
- Comanda lateral.
- Adicionar produto a comanda.
- Alterar quantidade.
- Remover item.
- Subtotal funcionando.
- Persistencia local da comanda ativa.
- Fila local de eventos de sincronizacao.

## Fora do Escopo da Primeira Entrega

- Banco de dados real.
- Login e permissoes.
- Impressao fiscal ou nao fiscal.
- Integracao real com aplicativo.
- Pagamento real.
- Relatorios completos.
- Estoque completo.
- Cadastro completo de produtos.
- Fechamento de caixa completo.

## Tratamento de Erros

Services devem retornar dados em formato previsivel e evitar que a UI quebre. Casos iniciais:

- Produto inexistente: nao adiciona a comanda e registra aviso no console.
- Quantidade menor que 1: remove o item.
- `localStorage` vazio: inicializa dados mockados.
- Dados locais invalidos: restaura o estado inicial mockado.

## Testes e Verificacao

Como a primeira versao nao usara framework de teste, a verificacao inicial sera manual e orientada por navegador:

- Abrir `index.html`.
- Confirmar renderizacao da sidebar e Frente de Caixa.
- Confirmar lista de produtos.
- Buscar produto por nome.
- Filtrar por categoria.
- Adicionar produto a comanda.
- Alterar quantidade.
- Remover item.
- Confirmar subtotal em reais.
- Recarregar a pagina e confirmar persistencia da comanda ativa.
- Verificar no console/localStorage se eventos de sincronizacao foram registrados.

## Criterios de Aceite

A entrega sera considerada pronta quando:

- A estrutura obrigatoria existir.
- A tela Frente de Caixa abrir sem servidor ou dependencias externas.
- Produtos mockados aparecerem em cards.
- A comanda lateral comecar vazia e atualizar ao adicionar produtos.
- Quantidade, remocao e subtotal funcionarem.
- O codigo estiver separado em modules, components, services, database, utils e styles.
- Nenhum arquivo central concentrar toda a logica do sistema.
- Eventos de sincronizacao forem registrados para acoes de comanda.
