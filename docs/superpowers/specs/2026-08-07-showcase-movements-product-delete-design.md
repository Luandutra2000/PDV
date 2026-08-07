# Exclusao de produto com historico da vitrine

## Objetivo

Permitir excluir um produto do catalogo mesmo quando existem movimentos historicos em `public.showcase_movements`, preservando esses movimentos para auditoria e relatorios.

## Diagnostico

O Supabase retorna `showcase_movements_product_id_fkey` ao excluir um produto. A tabela de movimentos guarda `product_id`, quantidade, tipo, venda/comanda, usuario, observacao e datas. A tela ja resolve o nome pelo catalogo e usa `Produto removido` quando o cadastro nao existe.

## Desenho aprovado

- Criar uma migration idempotente que execute `alter table public.showcase_movements drop constraint if exists showcase_movements_product_id_fkey`.
- Manter a coluna `product_id` e todos os registros historicos.
- Adicionar comentario na coluna documentando que ela e um snapshot textual e pode apontar para produto removido.
- Nao usar `on delete cascade`, nao apagar movimentos e nao alterar vendas/comandas.
- Adicionar teste estatico garantindo que a migration remove exatamente essa FK e preserva a tabela.

## Fluxo e seguranca

Depois da migration, o delete do catalogo pode concluir no Supabase; a fila local sera esvaziada pelo sincronizador. Consultas de historico continuam funcionando e exibem `Produto removido` quando necessario. A migration nao concede novas permissoes e nao altera RLS.

## Validacao

- Executar a suite completa.
- Fazer `supabase db push --linked --dry-run` antes da aplicacao.
- Aplicar a migration no projeto de producao.
- Repetir a verificacao do schema e publicar o frontend apenas se necessario.
- Pedir ao usuario para sincronizar a fila existente e testar exclusao/cadastro.

## Fora do escopo

- Excluir o projeto de homologacao.
- Remover dados historicos.
- Alterar outras FKs sem erro concreto que as identifique.
