# Decisão de liberação do PDV — 29/07/2026

## Decisão

**NO-GO — não liberar para produção nem aceitar pagamentos reais.**

A regressão automatizada local está aprovada, mas os critérios obrigatórios de
produção não foram atendidos. Esta decisão não invalida as correções concluídas;
ela impede que validações locais sejam confundidas com homologação operacional.

## Resultado por critério

| Critério | Resultado | Evidência |
|---|---|---|
| Suíte automatizada | Aprovado | 45 de 45 suítes |
| Jornada crítica local | Aprovado | Venda, cancelamento, estoque, sangria e fechamento |
| Inicialização no Chrome | Aprovado | 5 de 5 inicializações |
| Autenticação sem conta local padrão | Implementado, reteste remoto pendente | TASK-001 e TASK-002 |
| Concorrência entre dois caixas | Bloqueado | Supabase exclusivo de QA indisponível |
| Registro de formas de pagamento | Aprovado localmente | Sem cobrança online ou integração com provedor |
| Cozinha e impressão | Não aplicável | Fora do escopo operacional atual |
| Reconciliação com banco real | Bloqueado | Snapshot local aprovado; consulta de QA pendente |
| XSS nas renderizações críticas | Aprovado localmente | Escape central e regressão sobre 14 arquivos |
| Backup PostgreSQL restaurado | Bloqueado | Apenas backup local restaurado |
| Dispositivos reais | Bloqueado | Dispositivos de caixa ainda não homologados em conjunto |

## Bloqueadores para mudar para GO

1. Criar e vincular um Supabase exclusivo de QA; nunca executar reset no projeto atual.
2. Validar RLS, isolamento entre empresas, perfis e manipulação de identificadores no backend.
3. Executar concorrência com dois caixas e venda simultânea do último item.
4. Reconciliar vendas, itens, formas registradas, caixa e estoque diretamente com o banco de QA.
5. Restaurar um backup PostgreSQL em projeto vazio e comparar a reconciliação.
6. Aprovar os fluxos principais nos dispositivos de caixa utilizados.
7. Executar novamente a regressão completa sem bug crítico ou alto aberto.

## Plano de implantação quando houver GO

1. Congelar alterações funcionais e identificar a versão candidata.
2. Gerar backup validado do banco e exportar configurações necessárias.
3. Publicar primeiro em homologação e executar smoke test.
4. Publicar em janela de baixo movimento.
5. Liberar um caixa piloto e depois o segundo caixa.
6. Comparar os primeiros pedidos no PDV, banco, caixa, estoque e relatórios.
8. Registrar responsável, horário e resultado de cada etapa.

## Gatilhos de rollback

- login ou autorização administrativa incorretos;
- venda ou baixa de estoque duplicada;
- divergência entre caixa, vendas e banco;
- fila de sincronização crescendo sem convergir;
- vulnerabilidade crítica/alta reproduzida;
- taxa de erro operacional acima de 1% nos primeiros 30 minutos.

## Procedimento de rollback

1. Interromper novas vendas no sistema e registrar o horário.
2. Voltar a implantação para a última versão aprovada.
3. Não apagar filas, vendas ou auditoria.
4. Conciliar operações ocorridas desde o início da implantação.
5. Restaurar banco somente após preservar evidências e validar o backup.
6. Reabrir operação apenas após smoke test e autorização do responsável.

## Monitoramento e suporte

Monitorar durante a implantação:

- erros de autenticação e autorização;
- tamanho e idade das filas de sincronização;
- divergências do reconciliador;
- cancelamentos e alterações operacionais;
- disponibilidade e latência do Supabase;
- erros JavaScript e falhas do service worker.

Responsabilidades mínimas:

- responsável técnico pela implantação e rollback;
- responsável financeiro pela conciliação das formas registradas e do caixa;
- responsável operacional pelo caixa;
- canal único de incidente com horário, venda/comanda e evidências;
- atualização de status a cada 15 minutos durante o piloto.

## Próxima revisão

A decisão poderá ser reavaliada somente após todos os bloqueadores acima terem
evidência anexada e a regressão final continuar totalmente aprovada.
