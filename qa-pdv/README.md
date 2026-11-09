# QA do PDV — auditoria com semana simulada (2026-11)

Pasta com a massa de testes, as ferramentas de automação e os relatórios da auditoria. Resultados: `relatorio-final.md`.

## Ambiente usado

| Item | Valor |
| --- | --- |
| Código | branch `qa/auditoria-semana-2026-11` (base `redesenho/b-claro`, commit `de14187`) |
| Banco | Supabase de produção `inquppkbkmhnbtwpriuw` — autorizado pelo usuário (sistema ainda não em uso). Sem acesso administrativo ao banco: leitura e escrita pela sessão autenticada do app |
| Frontend | servido localmente por `ferramentas/servidor-qa.mjs` (porta 5510), sem alterar arquivos do app |
| Navegador | painel de navegador do Claude (Chromium), 1366×768 |
| Usuários | admin (login feito pelo usuário) e operadora (login feito pelo usuário) |
| Datas | relógio de teste injetado só pelo servidor de QA (`localStorage['qa.clockOffsetMs']`); o relógio do computador não foi alterado |
| Integrações | não há integração de pagamento, fiscal ou impressora no PDV |

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `cenarios-semana.json` / `cenarios-semana-R2.json` | massa reproduzível (semente 20261102) e referência independente calculada em centavos |
| `transacoes.csv` | 200 compras principais + operações extras de cada execução, com esperado x observado |
| `conciliacao.csv` | esperado x observado por dia: dinheiro, Pix, cartões, vendas no servidor, vitrine |
| `inventario-cobertura.csv` | matriz de cobertura (97 itens) com status e evidência |
| `bugs.md` | 29 achados priorizados e situação das correções |
| `design-usabilidade.md` | avaliação das telas |
| `progresso.md` | estado da execução e ponto de retomada |
| `evidencias/` | resumos e resultados de cenários manuais, sem dados pessoais |
| `ferramentas/` | servidor de QA, gerador da massa, referência, automação de interface e geradores de relatório |

Fora do Git (contêm dados reais): `backup-inicial/` (cópia das 24 tabelas antes dos testes) e `dados/` (resultados brutos e fotografias do servidor por dia).

## Como reproduzir

1. Gerar a massa e a referência (determinístico):

```bash
node qa-pdv/ferramentas/gerar-cenarios.mjs R1 2026-11-02
```

2. Subir o servidor de QA (ou usar a configuração `pdv-qa` de `.claude/launch.json`):

```bash
node qa-pdv/ferramentas/servidor-qa.mjs
```

3. Abrir `http://localhost:5510`, entrar com um usuário administrador e, no console da página:

```js
window.__QA_CLOCK__.set('2026-11-02T06:55:00'); location.reload();
// depois do recarregamento:
const H = await import('/qa-pdv/ferramentas/harness.mjs?v=1');
const M = await H.carregar('R1');
H.iniciarDia(M, 1);            // acompanhar window.__QA_RUN__
await H.resumoDia(M, 1);       // compara com a referencia
await H.snapshotServidor('R1', 1, M.dias[0].data);
```

Os cenários marcados como manuais (venda sem conexão, recarregar no pagamento, duplo clique, duas abas, alteração de preço) estão descritos em `progresso.md` e foram executados com os mesmos passos registrados em `evidencias/`.

4. Consolidar relatórios:

```bash
node qa-pdv/ferramentas/gerar-relatorios.mjs
```

```bash
node qa-pdv/ferramentas/gerar-inventario.mjs
```

5. Testes automatizados do projeto:

```bash
npm.cmd test
```

## Restaurar o estado inicial

`backup-inicial/` tem as 24 tabelas exportadas antes da execução (JSON por tabela + `manifest.json`). Os dados de teste estão identificados por: produtos e categorias com id `qa-`; descrições de movimentos iniciadas por "QA"; vendas entre 25/10/2026 e 08/11/2026 feitas pela automação. A remoção desses dados no banco de produção **não foi feita** e depende da sua decisão (ver `relatorio-final.md`).
