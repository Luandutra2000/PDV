# Vendas e Caixa Supabase - Checklist Manual

## Ambiente

- URL testada:
- Data/hora:
- Usuario:
- Navegador A:
- Navegador B:

## Venda e historico

- [ ] Fazer login.
- [ ] Finalizar uma venda em dinheiro.
- [ ] Confirmar venda em `sales`.
- [ ] Confirmar itens em `sale_items`.
- [ ] Fazer logout/login.
- [ ] Confirmar que historico e resumo continuam corretos.

## Movimento de caixa

- [ ] Registrar entrada.
- [ ] Registrar saida.
- [ ] Registrar sangria.
- [ ] Conferir registros em `cash_movements`.
- [ ] Confirmar dashboard/caixa atualizados.

## Cancelamento

- [ ] Cancelar uma venda.
- [ ] Confirmar status `cancelada` em `sales`.
- [ ] Confirmar resumo sem total da venda cancelada.
- [ ] Cancelar movimento de caixa.
- [ ] Confirmar status `cancelada` em `cash_movements`.

## Fechamento

- [ ] Gerar fechamento.
- [ ] Confirmar fechamento.
- [ ] Conferir registro em `cash_closings`.
- [ ] Fazer nova venda depois do fechamento.
- [ ] Confirmar que o fechamento anterior nao muda.

## Sincronizacao entre navegadores

- [ ] Abrir navegador A.
- [ ] Abrir navegador B.
- [ ] Fazer venda no navegador A.
- [ ] Confirmar resumo no navegador B sem refresh manual.
- [ ] Registrar entrada no navegador B.
- [ ] Confirmar caixa no navegador A sem refresh manual.

## Falha de conexao

- [ ] Simular falha de escrita.
- [ ] Finalizar venda.
- [ ] Confirmar status de pendencia.
- [ ] Restaurar conexao.
- [ ] Sincronizar.
- [ ] Confirmar venda e itens no Supabase.

## Observacoes

Registre aqui falhas, prints e ajustes necessarios.
