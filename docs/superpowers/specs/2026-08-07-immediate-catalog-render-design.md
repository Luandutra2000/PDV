# Atualizacao imediata do catalogo

## Objetivo

Fazer a tela de Produtos refletir imediatamente um cadastro, edicao ou exclusao concluida localmente, sem exigir recarregar a pagina.

## Desenho

- Manter as operacoes remotas e a fila existentes.
- Depois de cada acao de categoria/produto, atualizar o estado de sincronizacao e renderizar o catalogo a partir do cache local, que ja foi atualizado pelo repositorio.
- Executar a leitura remota de reconciliacao em seguida para confirmar o estado final do Supabase.
- Preservar mensagens de erro e pendencias; uma falha de reconciliacao nao desfaz a alteracao local nem apaga a fila.

## Validacao

- Adicionar teste estatico garantindo que os handlers renderizam apos salvar/excluir e continuam chamando a reconciliacao.
- Executar a suite completa.
- Publicar o frontend e verificar que o dominio de producao responde com o marcador da nova rotina.

## Fora do escopo

- Alterar tabelas, politicas ou historicos no Supabase.
- Limpar a fila automaticamente.
