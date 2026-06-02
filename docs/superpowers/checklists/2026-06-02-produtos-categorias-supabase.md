# Produtos e Categorias Supabase - Checklist Manual

## Ambiente

- URL testada:
- Data/hora:
- Usuario:
- Navegador A:
- Navegador B:

## Persistencia apos logout

- [ ] Fazer login.
- [ ] Criar categoria pelo sistema.
- [ ] Criar produto pelo sistema.
- [ ] Fazer logout.
- [ ] Fazer login novamente.
- [ ] Confirmar que categoria continua aparecendo.
- [ ] Confirmar que produto continua aparecendo.
- [ ] Conferir registro em `categories`.
- [ ] Conferir registro em `products`.

## Sincronizacao entre navegadores

- [ ] Abrir sistema no navegador A.
- [ ] Abrir sistema no navegador B.
- [ ] Criar produto no navegador A.
- [ ] Confirmar produto no navegador B sem refresh manual.
- [ ] Editar categoria no navegador B.
- [ ] Confirmar categoria no navegador A sem refresh manual.

## Falha de conexao

- [ ] Simular falha de escrita no Supabase.
- [ ] Criar ou editar produto.
- [ ] Confirmar status de alteracao pendente.
- [ ] Restaurar conexao.
- [ ] Clicar em Sincronizar.
- [ ] Confirmar que pendencia sumiu.
- [ ] Confirmar registro no Supabase.

## Estado vazio

- [ ] Testar com banco sem produtos.
- [ ] Confirmar mensagem `Nenhum produto cadastrado no banco.`
- [ ] Testar com banco sem categorias.
- [ ] Confirmar mensagem `Nenhuma categoria cadastrada no banco.`

## Observacoes

Registre aqui falhas, prints e ajustes necessarios.
