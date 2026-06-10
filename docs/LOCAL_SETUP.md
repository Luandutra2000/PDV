# Guia de Instalacao e Execucao Local

Este guia descreve como rodar o PDV localmente no estado atual do projeto.

## Requisitos

- Navegador moderno.
- Node.js para executar os testes.
- Python disponivel no runtime local usado pelo script `scripts/start-server.cmd`.

## Rodando o sistema

Na raiz do projeto, execute:

```powershell
scripts\start-server.cmd
```

Acesse:

```text
http://127.0.0.1:5500/
```

## Rodando testes

Execute os testes um por um:

```powershell
node tests\transaction-service.test.mjs
node tests\product-service.test.mjs
node tests\estoque-service.test.mjs
node tests\cash-closing-service.test.mjs
```

Resultado esperado:

- `transaction service ok`
- `product service ok`
- `estoque service ok`
- `cash closing service ok`

## Reset de dados locais

O sistema usa `localStorage`. Para limpar os dados manualmente:

1. Abra o DevTools do navegador.
2. Va em Application/Aplicativo.
3. Abra Local Storage.
4. Remova as chaves que comecam com `pdv.`.
5. Recarregue a pagina.

Ao recarregar, `ensureSeedData()` recria os dados iniciais.

## Dados locais atuais

As chaves principais ficam em `src/database/schema.js`:

- `pdv.products`
- `pdv.categories`
- `pdv.activeComanda`
- `pdv.caixa`
- `pdv.transactions`
- `pdv.closedComandas`
- `pdv.stockLaunches`
- `pdv.hiddenStockComparisons`
- `pdv.cashClosings`
- `pdv.cashClosingDraft`
- `pdv.showcaseWriteOffs`
- `pdv.syncQueue`

## Observacoes para desenvolvimento

- O projeto usa ES Modules no navegador.
- A entrada principal e `src/app.js`.
- Novas telas devem entrar em `src/modules`.
- Novas regras de negocio devem entrar em `src/services`.
- Novos estilos devem seguir a divisao em `src/styles`.
- Testes devem focar primeiro nos services.

## Antes de iniciar uma task

1. Verifique o estado do Git:

```powershell
git status --short
```

2. Confirme se existem mudancas locais em andamento.
3. Rode os testes existentes.
4. Faça a task em commits pequenos.
5. Rode os testes novamente.

## Futuro setup com Supabase

Quando Supabase for adicionado, este guia deve ganhar:

- instalacao da Supabase CLI;
- uso de Docker para stack local;
- criacao de `.env`;
- comando para aplicar migrations;
- comando para popular seeds;
- instrucao para configurar Auth local;
- separacao entre ambiente local, teste e producao.
