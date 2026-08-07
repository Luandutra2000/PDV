# Diagnostico de erros da sincronizacao do catalogo

## Objetivo

Tornar visivel, na tela de Produtos, a mensagem real retornada pelo Supabase quando uma operacao de categoria ou produto permanece pendente. A mudanca deve permitir identificar a causa da falha sem apagar a fila local nem alterar dados do banco.

## Escopo

- Exibir a quantidade de alteracoes pendentes e o erro mais relevante do catalogo na faixa de sincronizacao.
- Priorizar o erro de produtos quando houver erro simultaneo de categorias e produtos; se ele nao existir, mostrar o erro geral ou o erro de categorias.
- Escapar o texto antes de inseri-lo no HTML.
- Depois de uma tentativa manual de sincronizacao, mostrar uma notificacao de erro quando ainda houver pendencias e uma notificacao de sucesso quando a fila for concluida.
- Preservar os botoes `Sincronizar` e `Limpar fila` e o comportamento atual da fila.

## Fora do escopo

- Excluir projetos de homologacao.
- Limpar automaticamente alteracoes pendentes.
- Alterar politicas, tabelas ou dados do Supabase antes de conhecer a mensagem real.
- Criar uma janela de diagnostico separada.

## Componentes e fluxo

O repositorio de sincronizacao continua responsavel por capturar e preservar `status.error`. O modulo de Produtos le o estado agregado retornado por `getCatalogSyncStatus()`, resolve a mensagem entre `products.error`, `categories.error` e o erro geral, e a renderiza na faixa existente.

Ao clicar em `Sincronizar`, o modulo aguarda `syncCatalogNow()`, recarrega o catalogo e consulta novamente o estado. Se `pending > 0`, mostra uma notificacao contendo o erro resolvido; caso contrario, confirma a sincronizacao.

## Tratamento de erros e seguranca

- Mensagens remotas sao consideradas texto nao confiavel e passam pelo utilitario de escape HTML ja usado pelo projeto.
- A fila permanece intacta em qualquer falha.
- A ausencia de mensagem especifica usa o texto `O Supabase recusou a sincronizacao. Tente novamente.`.
- Nenhuma credencial, token ou conteudo do armazenamento local e exibido.

## Testes e validacao

- Teste de regressao verifica que a faixa renderiza a mensagem resolvida e escapada.
- Teste verifica a notificacao apos sincronizacao manual com pendencias.
- A suite completa deve passar.
- A versao publicada deve responder HTTP 200 e conter os marcadores da nova exibicao de erro.

## Criterio de sucesso

Depois de clicar em `Sincronizar`, o usuario consegue ler na tela a causa retornada pelo Supabase, enquanto as alteracoes continuam pendentes e recuperaveis ate que a causa seja corrigida.
