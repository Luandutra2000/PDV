# Produtos e Categorias no Supabase - Design

## Objetivo

Corrigir a primeira base da auditoria do PDV: produtos e categorias devem usar o Supabase como fonte principal, sem depender de `localStorage`, `sessionStorage`, mock data ou estado local permanente.

Esta fase garante que produtos e categorias:

- carreguem do banco;
- sejam criados, editados, excluidos e listados pelo banco;
- continuem aparecendo apos logout/login;
- aparecam em outro computador/navegador;
- atualizem em tempo real quando houver alteracao em outro cliente.

## Escopo

Incluido nesta fase:

- Produtos.
- Categorias.
- Repository generico Supabase com adapters por entidade.
- Cache local temporario.
- Fila local de sincronizacao para operacoes offline.
- Status geral de sincronizacao.
- Supabase Realtime para produtos e categorias.
- Testes unitarios e checklist manual da fase.

Fora desta fase:

- Vendas.
- Comandas.
- Caixa.
- Vitrine/estoque de producao.
- Dashboard/CRM.
- App/PWA alem da atualizacao de produtos/categorias via realtime.
- Migracao automatica de dados locais para Supabase.

## Decisoes Aprovadas

- Supabase sera a fonte principal.
- Cache local sera temporario e nao sera considerado banco principal.
- Quando salvar falhar, a operacao entra em fila local para sincronizar depois.
- A interface mostrara um status geral de sincronizacao, sem selo em cada item.
- Nao havera migracao automatica de produtos/categorias locais para o banco.
- Produtos e categorias devem atualizar em tempo real com Supabase Realtime.
- A abordagem sera um repository generico Supabase com adapters por entidade.

## Arquitetura

Criar uma camada central de repository para entidades simples. A primeira implementacao atende `products` e `categories`, mas a estrutura deve permitir reaproveitamento nas proximas fases.

### Repository Base

Responsabilidades:

- buscar registros no Supabase;
- criar, editar e excluir registros no Supabase;
- manter cache local temporario;
- registrar operacoes pendentes em fila local quando salvar falhar;
- processar fila de sincronizacao;
- assinar eventos de Realtime;
- emitir eventos internos para a UI atualizar;
- informar estado geral de sincronizacao.

O repository nao deve conhecer detalhes visuais das telas.

### Adapters

Criar adapters por entidade para isolar conversao entre modelo do app e modelo do banco.

`category.adapter.js`:

- converte `showInShowcase` para `show_in_showcase`;
- converte linhas do Supabase para o formato usado pelas telas.

`product.adapter.js`:

- converte `categoryId` para `category_id`;
- normaliza `price`, `cost`, `stock`, `active`, `aliases` e `favorite`;
- converte linhas do Supabase para o formato usado pelas telas.

### Services Existentes

`product.service.js` e os modulos que consomem produtos/categorias devem passar pela nova camada.

Quando Supabase estiver ativo:

- nao criar produtos/categorias mock como fonte principal;
- nao usar `localStorage` como origem permanente;
- nao esconder falha do banco com mock data;
- retornar estado vazio real quando o banco estiver vazio.

Quando Supabase nao estiver ativo:

- o comportamento local atual pode continuar para desenvolvimento offline.

## Fluxo de Leitura

1. A tela pede produtos/categorias ao service.
2. O service chama o repository.
3. O repository tenta buscar no Supabase.
4. Se o Supabase responder:
   - atualiza cache temporario;
   - retorna dados do banco;
   - define status `Sincronizado`.
5. Se o Supabase falhar:
   - retorna cache temporario se existir;
   - define status `Usando cache`;
   - se nao houver cache, retorna erro e estado vazio.

## Fluxo de Escrita

Para criar, editar ou excluir:

1. A tela chama o service.
2. O service chama o repository.
3. O repository tenta salvar no Supabase.
4. Se salvar:
   - atualiza cache;
   - retorna item atualizado;
   - define status `Sincronizado`.
5. Se falhar:
   - grava operacao na fila local;
   - atualiza cache com a alteracao pendente;
   - define status com contagem de pendencias.

Quando a conexao voltar ou o usuario clicar em sincronizar:

1. O repository processa a fila em ordem.
2. Operacoes bem-sucedidas saem da fila.
3. Operacoes com erro continuam pendentes.
4. O status geral e atualizado.

## Realtime

O app deve assinar eventos de `products` e `categories`.

Quando outro navegador alterar dados:

- o repository recebe o evento;
- atualiza cache ou recarrega a entidade;
- emite evento interno;
- telas atualizam sem refresh manual.

Realtime nao substitui leitura inicial do banco. Ele apenas mantem clientes sincronizados apos o carregamento.

## Interface

Adicionar status geral discreto nas telas de produtos/categorias.

Estados esperados:

- `Sincronizado`;
- `Sincronizando...`;
- `Usando cache`;
- `1 alteracao pendente`;
- `N alteracoes pendentes`;
- `Erro ao sincronizar`.

Quando houver pendencias, mostrar uma acao discreta `Sincronizar`.

Estados vazios:

- `Nenhuma categoria cadastrada no banco.`
- `Nenhum produto cadastrado no banco.`

Confirmacoes:

- Ao salvar no Supabase: confirmacao normal.
- Ao cair na fila: `Salvo localmente. Sincroniza quando voltar a conexao.`

## Dados Locais Permitidos

Permitido:

- cache temporario de produtos/categorias;
- fila local de operacoes pendentes;
- tema;
- sessao/token auxiliar;
- estados nao criticos de interface.

Nao permitido:

- usar mock data como fonte principal quando Supabase estiver ativo;
- recriar produtos/categorias locais apos logout/login;
- tratar cache como dado definitivo;
- deixar duas fontes permanentes divergentes.

## Testes Automatizados

Criar ou ajustar testes para:

- adapter de categoria;
- adapter de produto;
- repository carregando do Supabase;
- repository atualizando cache apos leitura;
- fallback para cache quando Supabase falhar;
- fila local quando escrita falhar;
- processamento da fila;
- status geral de sincronizacao;
- evento interno disparado por Realtime.

## Checklist Manual

### Persistencia apos logout

1. Fazer login.
2. Criar categoria no Supabase pelo sistema.
3. Criar produto no Supabase pelo sistema.
4. Fazer logout.
5. Fazer login novamente.
6. Confirmar que categoria e produto continuam aparecendo.

### Sincronizacao entre navegadores

1. Abrir o sistema no navegador A.
2. Abrir o sistema no navegador B.
3. Criar produto no navegador A.
4. Confirmar que aparece no navegador B sem refresh manual.
5. Editar categoria no navegador B.
6. Confirmar que aparece no navegador A sem refresh manual.

### Falha de conexao

1. Simular falha ao salvar.
2. Criar ou editar produto.
3. Confirmar status de alteracao pendente.
4. Restaurar conexao.
5. Clicar em sincronizar ou aguardar tentativa automatica.
6. Confirmar que pendencia foi salva no Supabase.

### Banco

1. Conferir registro criado em `products`.
2. Conferir registro criado em `categories`.
3. Conferir relacao `products.category_id`.
4. Confirmar que nao houve criacao de mock/localStorage como fonte final.

## Riscos

- Tabelas podem existir mas estar vazias.
- RLS pode permitir leitura e bloquear escrita.
- Realtime pode nao estar habilitado para as tabelas.
- Produtos/categorias locais antigos podem confundir testes se o cache nao for limpo.
- Fila local precisa ser pequena e clara para nao virar banco paralelo.

## Criterios de Aceite

- Produtos e categorias carregam do Supabase quando Supabase esta ativo.
- Criar/editar/excluir produto e categoria grava no Supabase.
- Logout/login nao remove produtos/categorias.
- Outro navegador recebe alteracoes em tempo real.
- Falha de escrita cria pendencia local e mostra status geral.
- Sincronizacao posterior limpa pendencias bem-sucedidas.
- Banco vazio mostra estado vazio real.
- Mock data nao aparece quando Supabase esta ativo.
- Testes automatizados da fase passam.
- Checklist manual da fase e documentado apos execucao.
