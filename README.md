# PDV Lanchonete

Sistema de ponto de venda para lanchonete, criado em JavaScript modular, HTML e CSS puro. A base atual roda localmente pelo navegador e usa `localStorage` como persistencia temporaria enquanto o projeto evolui para autenticacao, permissoes, auditoria, Supabase, PWA e deploy.

## Estado atual

- Frente de caixa com produtos, categorias, comanda ativa e finalizacao de venda.
- Controle de entradas e saidas de caixa.
- Fechamento de caixa guiado com historico local.
- Lancamento e conferencia de estoque/producao.
- Dashboard, produtos, pessoas, comandas, relatorios e despesas preparados como modulos.
- CSS separado por responsabilidade.
- Testes de servicos em arquivos `.mjs`.

## Tecnologias atuais

- HTML
- CSS modular
- JavaScript ES Modules
- `localStorage`
- Servidor local simples com Python

## Estrutura principal

```text
.
|-- index.html
|-- scripts/
|   `-- start-server.cmd
|-- src/
|   |-- app.js
|   |-- components/
|   |-- database/
|   |-- modules/
|   |-- services/
|   |-- styles/
|   `-- utils/
|-- tests/
`-- docs/
```

## Como rodar localmente

Abra o projeto pelo servidor local:

```powershell
scripts\start-server.cmd
```

Depois acesse:

```text
http://127.0.0.1:5500/
```

Tambem e possivel abrir o `index.html` direto no navegador, mas o servidor local e recomendado para manter o comportamento dos ES Modules mais previsivel.

## Testes atuais

Os testes atuais validam regras de negocio dos servicos principais:

```powershell
node tests\transaction-service.test.mjs
node tests\product-service.test.mjs
node tests\estoque-service.test.mjs
node tests\cash-closing-service.test.mjs
```

## Proximas etapas

O plano tecnico esta em [docs/ROADMAP.md](docs/ROADMAP.md).

Resumo da ordem recomendada:

1. Documentar e estabilizar a base.
2. Criar login, usuarios, permissoes e auditoria.
3. Preparar GitHub e Supabase.
4. Melhorar o design mantendo o layout atual.
5. Criar PWA mobile.
6. Publicar ambiente de testes com dominio.

## Decisoes importantes

- O projeto permanece em JavaScript puro por enquanto.
- React nao sera adicionado apenas para design.
- A melhoria visual sera feita primeiro com CSS modular e componentes existentes.
- Supabase entrara de forma gradual para evitar quebrar o fluxo atual.
- Regras sensiveis devem ficar em servicos, nao apenas em botoes escondidos na interface.
