# Teste controlado no PDV publicado — 15/09/2026

## Resultado

Fluxo de venda, troco, cancelamento, estoque e sincronização aprovado no navegador autenticado do proprietário. Venda fictícia de R$ 9,00 autorizada expressamente pelo usuário, registrada e cancelada; permanece no histórico. Venda anterior de R$ 18,00 em Pix preservada.

## Falha encontrada e correção

Antes do teste, as filas locais tinham financeiro 1, vitrine 1 e auditoria 0. Logs do Supabase mostravam 401 nos acessos REST financeiros, enquanto acessos pelo SDK funcionavam. O cliente REST capturava a credencial de `pdv.currentSession`, que não acompanhava a renovação automática do SDK.

O cliente agora consulta a sessão atual do SDK em cada requisição. Em resposta 401, renova e repete uma única vez, preservando corpo e opções da operação. Sem sessão, retorna erro sem tentar usar credenciais locais antigas ou acesso anônimo. A fila existente sincronizou após a publicação, preservando o total de R$ 18,00.

A hipótese inicial de ausência de colunas no banco foi descartada com consulta agregada completa; nenhuma alteração de esquema foi necessária.

## Conferência no navegador e no banco

| Verificação | Evidência |
| --- | --- |
| Situação inicial | Comanda 0001, 2 Empadas de Costela, R$ 18,00 Pix; carrinho vazio; Hamburguer com estoque 62 |
| Venda controlada | Comanda 0002, 15/09/2026 13:05, 1 Hamburguer, R$ 9,00 dinheiro; recebido R$ 20,00; troco R$ 11,00 |
| Efeito da venda | Total R$ 27,00; estoque do Hamburguer 61 |
| Cancelamento | Comanda 0002 cancelada com motivo `TESTE CONTROLADO autorizado pelo proprietario em 15/09/2026: validar venda, troco, sincronizacao e estorno de estoque.` |
| Efeito do cancelamento | Total R$ 18,00; estoque do Hamburguer 62; carrinho vazio; financeiro 0, vitrine 0 e auditoria 0 pendentes |
| Persistência | Após recarregar, histórico mostra comanda 0001 ativa e 0002 cancelada; total R$ 18,00 |
| Servidor | Consulta somente de leitura em `public.sales`: exatamente duas vendas hoje, 0001 ativa/R$ 18/Pix e 0002 cancelada/R$ 9/dinheiro/recebido R$ 20/troco R$ 11 |
| Fechamento | Financeiro sincronizado; uma comanda válida; dinheiro esperado R$ 0,00; Pix R$ 18,00; nenhum fechamento salvo |

## Validação e publicação

- 79 arquivos de testes aprovados, incluindo regressão com sessão renovada, repetição única de 401, preservação da operação e sessão ausente.
- Testes do service worker aprovados após atualização para `pdv-v82`.
- 98/98 arquivos públicos conferidos com a versão publicada; verificações de leitura anônima e arquivos privados sem exposição.
- Publicação: https://pdv-qu1c0wvt2-luandutra2000s-projects.vercel.app
- Endereço de uso: https://pdv-qdelicia.vercel.app/

Este teste valida o registro manual dos pagamentos. Não executou cobrança bancária, impressão física, emissão fiscal ou fechamento definitivo do dia. Demais limites operacionais continuam descritos em `OPERACAO_DIARIA.md`.
