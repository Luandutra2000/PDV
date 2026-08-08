# Remoção permanente dos produtos demonstrativos

## Objetivo

Remover do catálogo os produtos demonstrativos que não foram cadastrados pelo usuário e impedir que eles sejam recriados ao iniciar ou atualizar o sistema. As categorias padrão `Lanches`, `Bebidas`, `Porcoes` e `Combos` permanecem disponíveis.

## Causa identificada

Na inicialização, `ensureSeedData()` grava `mockProducts` quando a chave local de produtos está ausente. Como o sistema usa o provedor Supabase com cache local e sincronização, esses produtos podem reaparecer no catálogo remoto depois de uma atualização ou de uma reconstrução do armazenamento local.

## Produtos abrangidos

A limpeza será limitada aos IDs fixos dos onze produtos demonstrativos atuais:

- `x-burger`
- `x-salada`
- `x-bacon`
- `misto-quente`
- `batata-frita`
- `frango-passarinho`
- `refrigerante-lata`
- `suco-natural`
- `agua`
- `combo-casal`
- `combo-familia`

Nenhum produto com outro ID será removido, mesmo que tenha nome semelhante.

## Desenho da correção

### Inicialização e reset local

O catálogo inicial de produtos passará a ser uma lista vazia. `ensureSeedData()` continuará criando a chave de produtos quando ela não existir, mas gravará `[]`, não `mockProducts`. `resetAppData()` seguirá a mesma regra. As categorias padrão continuarão sendo inicializadas por `mockCategories`.

Os dados demonstrativos poderão permanecer no arquivo de fixtures apenas se forem necessários aos testes. O código de produção não poderá usá-los como catálogo inicial.

### Limpeza do Supabase

Uma migração SQL removerá da tabela de produtos somente os onze IDs listados acima. A migração deverá ser idempotente: executá-la novamente não produz erro nem remove outros registros. As categorias não serão alteradas.

As regras existentes de integridade referencial serão respeitadas. O repositório já possui migrações que permitem a exclusão de produtos preservando os históricos por snapshot; a nova migração não apagará vendas, movimentações ou registros financeiros.

### Cache e sincronização

Depois que o código atualizado for carregado, a ausência da chave local não recriará produtos demonstrativos. A hidratação do Supabase deverá refletir o catálogo remoto já limpo. Caso exista uma cópia antiga no cache do navegador, o fluxo normal de hidratação deve substituí-la; será acrescentada proteção específica somente se os testes mostrarem que o cache antigo pode reenviar os IDs removidos.

## Tratamento de erros

A migração deverá falhar de forma explícita se a estrutura esperada da tabela não existir. A inicialização local continuará tolerando armazenamento ausente ou inválido por meio do comportamento atual do provedor, mas nunca recorrerá aos produtos demonstrativos.

## Testes e critérios de aceite

- Inicializar sem chave local de produtos resulta em uma lista vazia.
- Inicializar repetidamente não recria nenhum dos onze produtos.
- As categorias `Lanches`, `Bebidas`, `Porcoes` e `Combos` continuam disponíveis.
- A migração contém uma exclusão restrita aos onze IDs fixos.
- Produtos cadastrados pelo usuário, identificados por outros IDs, permanecem no banco.
- Vendas e históricos existentes não são apagados.
- A suíte de regressão do catálogo e da sincronização continua passando.

## Fora do escopo

- Remover ou renomear categorias padrão.
- Alterar produtos cadastrados pelo usuário.
- Apagar históricos de vendas, estoque, caixa ou financeiro.
- Mudar o comportamento dos seeds exclusivos do ambiente isolado de homologação (`qa-*`).
