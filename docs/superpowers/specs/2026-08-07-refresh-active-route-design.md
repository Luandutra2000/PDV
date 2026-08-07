# Atualizacao da rota ativa

## Objetivo

Permitir atualizar o modulo aberto pelo botao `Atualizar`, sem exigir F5 nem reiniciar a aplicacao.

## Desenho

- O shell identifica a rota ativa em `workspace.dataset.activeRoute`.
- O botao `Atualizar` chama o inicializador da rota atual, preservando a sessao, o shell e a tela selecionada.
- A rota Produtos continua usando a renderizacao local imediata e a reconciliacao remota.
- Se a rota atual nao tiver inicializador, apenas o resumo do caixa sera redesenhado.

## Validacao

- Teste estatico verifica que o refresh resolve e executa a rota ativa.
- Suite completa deve passar.
- Deploy deve responder HTTP 200 e servir o marcador do refresh de rota.

## Fora do escopo

- Recarregar a pagina inteira.
- Limpar filas, sessao ou dados locais.
