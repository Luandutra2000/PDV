# Liberacao para uso real — passos no Supabase e no deploy (23/11/2026)

Ordem para colocar a lanchonete em operacao com a versao da `main` (PRs #41 em diante).
Tudo no Supabase e feito no **SQL Editor** do projeto de producao, como dono do projeto.
Antes de comecar, faca um backup (Database > Backups).

## 1. Migracoes pendentes (rodar nesta ordem)

| # | Arquivo | O que resolve |
| --- | --- | --- |
| 1 | `supabase/migrations/202611090001_allow_sellers_read_catalog.sql` | **Operador e caixa conseguem ler o catalogo e vender** (BUG-017, P0). Sem ela o operador nao vende. |
| 2 | `supabase/migrations/202611090002_cash_sessions_for_cashiers.sql` | Sessao de caixa (troco inicial) gravada no servidor (BUG-011). |
| 3 | `supabase/migrations/202611090003_restore_audit_read.sql` | Administrador volta a ler a auditoria (BUG-018). |
| 4 | `supabase/migrations/202611230001_protect_sales_history.sql` | Vendas, comandas e caixa viram registro permanente: ninguem apaga pelo app e operador nao altera itens de venda ja enviados. |

Para cada arquivo: abrir, copiar o conteudo inteiro, colar no SQL Editor e executar.
Se algum der erro, pare e anote a mensagem.

## 2. Remover os dados de teste da QA

Arquivo: `supabase/scripts/2026-11-23_limpar_dados_qa.sql`.

1. Rode **so a Parte 1** (conferencia). Compare com o esperado: cerca de 415 vendas,
   18 fechamentos, 13 produtos e 4 categorias `qa-`.
2. Se a linha "vendas do periodo QA SEM itens qa-" mostrar algo diferente de 0, confira
   essas vendas antes de seguir (o script nao as apaga).
3. Rode a Parte 2. A conferencia final deve mostrar 0 em tudo.

## 3. Deploy

1. Fazer o merge do PR na `main` (a Vercel publica sozinha).
2. Em cada aparelho que ja abriu o PDV: conferir que o topo nao mostra envios pendentes,
   sair e limpar os dados do site no navegador (Chrome: cadeado ao lado do endereco >
   Configuracoes do site > Excluir dados). Assim o aparelho baixa so os dados reais.

## 4. Conferencia no primeiro dia

- Entrar como **operador**: o catalogo aparece, abrir caixa, vender em dinheiro e Pix.
- Entrar como **administrador** em outro aparelho: a venda do operador aparece em Historico.
- Fechar o caixa: diferenca R$ 0,00 quando a contagem bate.
- Relatorios > Periodo com data de mais de 60 dias atras (quando houver): aparece
  "consultadas no servidor".

## O que mudou no comportamento

- Cada aparelho guarda os ultimos 60 dias (no IndexedDB do navegador); o servidor guarda tudo.
- Nao existe mais "Limpar historico". Venda errada se corrige cancelando a venda.
