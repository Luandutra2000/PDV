# Correções do PDV para operação em campo

## Objetivo

Eliminar os bloqueios reproduzidos na auditoria ao vivo: lançamentos financeiros que desaparecem, fechamento que salva R$0,00, filtro de despesas instável, exposição operacional ao papel `anon`, elevação de papel de usuário e migrations que não reproduzem o esquema.

## Escopo

1. **Financeiro e caixa:** preservar lançamentos locais enquanto a sincronização remota estiver pendente ou indisponível; refletir entrada/saída no resumo, financeiro e fechamento; manter a fila até confirmação do Supabase.
2. **Fechamento:** persistir e reidratar valores esperados, conferidos, diferenças, observação, período e usuário; usar a mesma fonte de movimentos do caixa.
3. **Segurança:** remover políticas `anon` de leitura/escrita de dados operacionais; exigir sessão autenticada e permissões no banco; impedir alteração de `role` por operador.
4. **Migrations:** corrigir referências legadas (`comanda_id`/`comanda_number`), documentar ou substituir placeholders e adicionar verificação de replay estático.
5. **Regressões:** cobrir a falha de `Troco`, o ciclo entrada/saída, a persistência do fechamento, a fila de sincronização e a autorização de papel.

## Decisões de implementação

- O cache local é a fonte imediata da interface; dados remotos confirmados são mesclados por `id`, preservando operações `syncPending`.
- Falha de leitura remota não apaga cache local nem transforma sucesso local em erro visual; o estado de sincronização será exibido como pendente/erro.
- O fechamento será salvo com um registro completo e validado, sem zerar os campos antes de a gravação local e a fila remota estarem confirmadas.
- Nenhuma política `anon` será mantida para tabelas de vendas, caixa, financeiro, comandos, usuários ou estoque. O frontend continuará usando a chave pública apenas para iniciar uma sessão autenticada.
- A validação de papel será feita no servidor/RLS; a interface apenas esconde ações sem substituir autorização.

## Validação

- `npm.cmd test` sem falhas.
- `npm.cmd run test:startup` sem falhas.
- Verificação automatizada das migrations, sem referências a colunas inexistentes e sem políticas operacionais para `anon`.
- QA local reproduzindo entrada, saída, venda, estoque, fechamento e exclusão de registro de teste.
- Nova verificação no deployment somente depois de os testes locais passarem.

## Fora do escopo imediato

Impressora, gaveta, maquininha, Pix real, offline prolongado, backup/restauração e alteração de dados históricos de produção exigem ambientes e dispositivos próprios.
