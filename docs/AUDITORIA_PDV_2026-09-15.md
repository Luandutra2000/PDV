# Auditoria do PDV — 15/09/2026

## Decisão: não liberar para uso normal na lanchonete

A venda básica funciona, mas ainda há falhas capazes de produzir fechamento incorreto, deixar estoque remoto sem baixa e perder operações pendentes. Recomendo usar apenas para treinamento com dados fictícios até corrigir e retestar os bloqueios abaixo.

Esta é uma auditoria técnica ampla com evidências novas. **Não é uma homologação completa da operação publicada:** não houve login autenticado disponibilizado nesta sessão, teste de hardware ou restauração de banco real. Essa limitação não muda a reprovação: os problemas reproduzidos no código atual já são suficientes para impedir a liberação.

## Identificação e alcance

| Item | Verificado nesta execução |
|---|---|
| Código local | Branch `feature/fechamento-caixa`, commit `b8206cca2be374b932603abc694d383be71a2dba` |
| Site consultado | https://pdv-qdelicia.vercel.app/ — endereço encontrado na documentação do projeto; o usuário ainda não confirmou se é o endereço usado na operação |
| Banco configurado | Supabase `inquppkbkmhnbtwpriuw` |
| Métodos | Testes existentes, reproduções isoladas com serviços reais e rede bloqueada, Playwright, comparação dos arquivos publicados e consultas remotas de leitura |
| Segurança dos testes | Vendas e fechamento simulados apenas em navegador separado em `127.0.0.1:5501`, com usuário e produtos fictícios, provedor local e bloqueio de rede externa |

Os registros operacionais reais não foram usados para simular vendas. Não foram aplicadas correções, migrations, publicação ou alterações nas permissões remotas. Os arquivos novos são somente relatório e evidências de auditoria.

## O que funcionou

| Verificação | Resultado e limite |
|---|---|
| Suíte existente | **60 arquivos aprovados, 0 reprovados**, duração informada de 7.835 ms. São arquivos de teste, não 60 jornadas reais de produção. Incluem inicialização, regras, permissões locais, XSS, sincronização simulada e backup local. |
| Venda em dinheiro no navegador | 2 unidades de R$ 7,50 = R$ 15,00; recebido R$ 20,00; troco R$ 5,00; estoque local de 10 para 8; venda e estoque mantidos após recarregar. |
| Pix, débito e crédito | Três vendas locais de R$ 7,50 registradas. Total das quatro vendas: R$ 37,50; 5 unidades vendidas; estoque local final 5. A confirmação é manual, sem processamento financeiro externo. |
| Entrada e fechamento no mesmo dia | Entrada de R$ 50,00; dinheiro esperado R$ 65,00; fechamento gravado com R$ 65,00 contado e diferença zero. Valor integral foi preenchido de uma vez para contornar a falha de digitação descrita adiante. |
| Navegação | Frente de Caixa, Vitrine, Histórico, Produtos, Pessoas, CRM, Financeiro, Relatórios, Configurações e App do Dono renderizaram com dados fictícios. Mobile em 390 × 844 sem rolagem horizontal na tela de fechamento examinada. Suporte exibiu apenas mensagem de módulo futuro. |

Abrir uma tela não comprova todas as operações de cadastro, alteração, exclusão ou permissões daquela tela. Não houve compra, transferência Pix, captura em cartão ou emissão fiscal real.

## Bloqueios para liberação

### 1. Fechamento e digitação — prioridade alta

**1A. Fechamento rápido e mobile incluem histórico de outros dias.**

Reprodução isolada: uma venda em dinheiro de R$ 100,00 ontem e outra de R$ 10,00 hoje. `buildClosingSummary()` retornou R$ 110,00 esperados; o CRM filtrado por Hoje retornou corretamente R$ 10,00 vendidos. O App do Dono usa o mesmo serviço de fechamento sem fornecer um recorte da sessão. Portanto, o acerto observado na simulação de um único dia não garante acerto após vários dias de operação.

Causa: `getClosingTransactions()` filtra somente cancelamentos; não filtra data, sessão ou último fechamento. Local: `src/services/cash-closing.service.js:216`; consumidor: `src/services/mobile-closing.service.js:9`.

Correção necessária: definir a sessão de caixa e usar o mesmo conjunto de transações em fechamento rápido, CRM e mobile. Validar dias diferentes, dois turnos no mesmo dia, venda após fechamento e cancelamento posterior.

**1B. O campo de dinheiro contado perde foco a cada tecla.**

Reprodução real com Playwright: clicar em Dinheiro contado, pressionar `6`, depois `5`. Resultado: valor `6`, foco no `BODY`, diferença exibida de -R$ 59,00. O esperado era `65`.

Causa: o evento de digitação reconstrói toda a tela e remove o campo que estava em foco. Local: `src/modules/caixa/caixa.module.js:138`. Correção: atualizar apenas o resumo ou preservar campo, foco e posição do cursor. Retestar valores decimais e observação digitados normalmente.

### 2. Persistência e sincronização — prioridade alta

**2A. Uma operação nova pode desaparecer da fila enquanto outra é enviada.**

Reprodução: A estava pendente; seu envio começou e ficou aguardando resposta. B foi criada nesse intervalo e falhou, entrando na fila. Quando A terminou, a fila ficou com **0 pendências**, embora B não tivesse sido enviada. Esperado: **1 pendência**.

Causa: o envio trabalha sobre uma fotografia da fila e substitui a fila inteira ao terminar. Local: `src/services/financial-sync.service.js:339`, especialmente linha 365. Correção: remover somente operações confirmadas, preservando as adicionadas durante o envio, e controlar envios concorrentes. A fila de vitrine contém padrão semelhante; não foi reproduzido separadamente.

**2B. Filas grandes são truncadas após recarregar.**

Reprodução: persistir 1.100 registros pendentes com aproximadamente 2.000 caracteres de conteúdo cada e reiniciar o cache de memória. Restaram **1.000**, perdendo 100 registros da persistência local. Esse volume é uma condição de reprodução, não uma estimativa de quando acontecerá na lanchonete.

Causa: coleções maiores que 2.000.000 de caracteres são salvas somente com os primeiros 1.000 elementos. O limite é genérico e também atinge a fila financeira. Locais: `src/services/providers/local.provider.js:65` e `src/services/financial-sync.service.js:1116`.

**2C. Armazenamento cheio é tratado como gravação bem-sucedida.**

Reprodução com falha simulada do armazenamento: a gravação de uma segunda venda retornou normalmente, mas após reiniciar a memória só a primeira permaneceu. O erro é registrado no console; o chamador não recebe falha.

Correção de 2B/2C: usar armazenamento durável adequado ao volume; nunca truncar operações pendentes; informar e interromper a confirmação quando não for possível persistir. Dados já confirmados no servidor podem ser recarregados; operações não enviadas não têm essa garantia.

**2D. Outra aba pode continuar lendo o saldo antigo.**

Reprodução: armazenamento atualizado de uma para duas vendas por um escritor externo; a leitura pela aba com cache retornou somente uma. Causa: o valor em memória prevalece mesmo quando o conteúdo persistido muda; o evento de outra aba solicita atualização visual sem invalidar esse cache. Local: `src/services/providers/local.provider.js:5` e `src/services/realtime.service.js:44`.

Correção: invalidar os caches afetados por eventos externos e testar duas abas gravando e consultando o mesmo caixa. A reprodução atual prova leitura desatualizada; não foi uma carga concorrente contra dois terminais reais.

### 3. Estoque remoto — prioridade alta

**O contrato da venda enviada não corresponde ao SQL versionado.**

O fluxo real do cliente envia itens com `productId` e `unitPrice`. A função `process_showcase_sale` versionada lê `product_id` e `unit_price` e descarta itens sem `product_id`. A reprodução capturou o argumento real enviado ao cliente de RPC: `product_id` estava ausente. A adaptação atual não converte os nomes.

Locais: `src/services/transaction.service.js:76`, `src/services/showcase-sync.service.js:252` e `supabase/migrations/202609120001_fix_online_sales_showcase_and_company.sql:164`.

Consequência pelo código versionado: a venda pode ser registrada e o estoque local baixado, enquanto a função remota não processa os itens. **Não foi lida a definição instalada dessa função no banco nem executada uma venda autenticada remota; o comportamento ao vivo permanece pendente de confirmação.**

Correção: alinhar o formato na fronteira cliente/banco e exigir confirmação dos itens processados; retestar venda, repetição da mesma operação e cancelamento diretamente no banco de homologação.

Outra inconsistência observada na simulação: após cinco unidades vendidas, a Frente de Caixa e a Vitrine mostraram estoque 5, mas Produtos mostrou estoque 10. O cadastro usa `products.stock`, enquanto a vitrine usa o saldo próprio. É necessário alinhar o saldo exibido ou distinguir claramente os dois conceitos para o operador.

### 4. Versão publicada e rastreabilidade — prioridade alta/média

**4A. O site não contém duas proteções já existentes na pasta.**

Foram comparados 97 arquivos de HTML, JS, CSS e manifesto, normalizando quebras de linha: **95 iguais e 2 diferentes**.

| Arquivo publicado divergente | Proteção ausente no site consultado |
|---|---|
| `src/modules/caixa/caixa.module.js` | Bloqueio de fechamento quando o período selecionado não é Hoje |
| `src/modules/produtos/produtos.module.js` | Confirmação antes de apagar produto ou categoria |

As diferenças foram obtidas dos arquivos servidos pelo site, não inferidas somente do histórico Git. Correção: publicar a versão escolhida e comparar novamente os arquivos críticos; publicar esses dois arquivos, por si só, não resolve os demais bloqueios desta auditoria.

**4B. Os registros de auditoria do cliente não são enviados pelo provedor.**

Reprodução: gravar um registro em `pdv.auditLogs` no provedor Supabase e aguardar o envio; número de gravações remotas: **0**, esperado: 1. O mapeamento tem leitura, mas não conversão para escrita. Local: `src/services/providers/supabase.provider.js`, entrada `STORAGE_KEYS.auditLogs`; produtor: `src/services/audit.service.js:37`.

Isso prova a ausência de envio nesse caminho. Não comprova ausência de todos os logs ou triggers que possam existir no servidor. Correção: persistência central de auditoria com autoria conferida no servidor e reteste da leitura em outro aparelho.

### 5. Recursos operacionais ainda não homologados

| Área | Situação encontrada |
|---|---|
| Pagamentos | Pix, débito e crédito finalizam como registro manual. As quatro vendas de navegador deixaram a lista de tentativas de autorização vazia. O serviço separado de pagamentos não participa da finalização. Pode servir para anotar recebimentos confirmados fora do PDV; não equivale a integração bancária ou com maquininha. |
| Cozinha, impressão e fiscal | As quatro vendas deixaram a fila de cozinha vazia. O serviço de cozinha/impressão não está ligado à finalização. Não foi encontrado fluxo operacional de emissão fiscal na busca do código. Impressora, gaveta e equipamentos físicos não foram testados. |
| Backup e recuperação | O teste existente recupera dados em armazenamento simulado. Não há ação de backup/restauração conectada às telas examinadas. O exportador técnico remoto não inclui `empresa_configuracoes` em sua lista e não representa, sozinho, restauração completa de Auth/Storage/banco. O backup local também inclui a chave de sessão, que pode conter tokens; precisa separar dados operacionais de credenciais. |
| Segurança autenticada e banco | Não foram testados usuários reais de operador/gerente/admin nem isolamento entre empresas. O histórico contém 9 arquivos que são apenas marcadores de migrations anteriores. A migration de 12/09 adiciona estruturas antes ausentes, mas o replay em banco vazio não foi executado. |
| Operação e interface | Suporte exibe módulo futuro; recuperar senha, cadastro e Google no login não têm fluxo associado. A captura desktop mostrou títulos de produto com contraste visual muito baixo. Offline prolongado, atualização da PWA durante operação, falha de energia e carga sustentada com terminais reais não foram homologados. |

## Reteste de segurança sem login

Foi usada somente a chave pública da configuração, sem sessão de usuário, consultando no máximo um ID por tabela. IDs e dados de negócio não foram incluídos nas evidências.

| Alvo | Resultado |
|---|---|
| `sales`, `cash_movements`, `financial_transactions` | HTTP 401; acesso negado |
| `products`, `cash_closings` | HTTP 401; acesso negado |
| `profiles`, `product_stock` | HTTP 200; nenhuma linha retornada |
| `audit_logs`, `empresa_configuracoes` | HTTP 200; nenhuma linha retornada |
| `admin-users`, ação de consulta `listUsers` | HTTP 401 |

A exposição de dados relatada na auditoria de 10/09 **não se repetiu nessas leituras**. Resposta vazia não demonstra todas as políticas de segurança, e não foram tentadas escritas anônimas. O login publicado apresentou uma tentativa automática de gravar categorias sem autenticação, rejeitada com HTTP 401; isso deve ser removido do bootstrap, embora a rejeição em si seja a proteção funcionando.

## Por que os 60 testes passaram mesmo assim

Os testes existentes validam cenários delimitados. Por exemplo, o teste de cache grande exige que apenas 1.000 registros sejam persistidos, mas não exige preservar uma fila operacional completa depois de recarregar. O teste de convergência offline envia a fila após as alterações; não cria uma nova operação durante o envio. Há testes que verificam texto de migrations, sem executar o SQL real contra o payload do frontend.

As reproduções novas obtiveram **7 verificações reprovadas e 2 controles aprovados**. A falha de digitação foi reproduzida adicionalmente no navegador. Não foram feitas tentativas de correção nesta auditoria.

## Sequência para liberar

1. Corrigir sessão/período de fechamento, foco dos campos e contrato da baixa de estoque; fazer as reproduções correspondentes passarem.
2. Corrigir durabilidade, concorrência da fila e atualização entre abas; validar desconexão, reconexão e reinício sem perder nem duplicar registros.
3. Publicar a versão corrigida, validar as funções/políticas reais e demonstrar venda, cancelamento e fechamento com operador e gerente em homologação.
4. Executar backup e restauração verificáveis; testar os equipamentos e o procedimento manual ou integrado dos meios de pagamento escolhidos.
5. Fazer um turno piloto acompanhado, conferindo dinheiro físico, comprovantes externos, vendas, estoque e fechamento. Só liberar uso normal quando não houver divergência sem explicação.

## Evidências e reprodução

Pasta: `output/playwright/audit-20260915/`.

| Evidência | Conteúdo |
|---|---|
| `remote-readonly.json` | Comparação de publicação e códigos de resposta das consultas sem login |
| `audit-probes.mjs` e `audit-probes-results.json` | Reproduções isoladas contra serviços reais; rede bloqueada; saída diferente de zero indica os bloqueios reproduzidos |
| `browser-sales-values.txt` e `browser-menus-result.txt` | Valores das vendas fictícias e conteúdo das telas percorridas |
| `local-sales.png` e `local-mobile.png` | Capturas visuais de desktop e mobile com dados fictícios |
| `published-caixa.js` e `published-produtos.js` | Cópias dos dois arquivos públicos divergentes, para comparação |

Para repetir as reproduções isoladas, na raiz do projeto: `node output/playwright/audit-20260915/audit-probes.mjs`. O arquivo é instrumento de auditoria, não alteração do aplicativo. Os snapshots adicionais da navegação estão em `.playwright-cli/` com timestamps de 15/09/2026.

**Próxima ação (1 minuto): ler a seção “Bloqueios para liberação” antes de colocar o sistema no caixa real.**
