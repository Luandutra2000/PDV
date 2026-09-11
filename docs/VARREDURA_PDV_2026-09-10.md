# Varredura do PDV — 10/09/2026

**Resultado: código publicado alinhado ao código local; segurança do banco precisa de correção prioritária.** Não é possível afirmar que está tudo correto ou aprovar o uso em produção com a exposição encontrada.

## Do que se trata

É um sistema web de ponto de venda para lanchonete, com frente de caixa, comandas, produtos e categorias, entradas/saídas e fechamento de caixa, produção e estoque de vitrine, despesas, relatórios, gestão de usuários e painel mobile do dono. Tem estrutura de PWA, cache local, fila de operações e sincronização com Supabase.

O frontend usa HTML, CSS e JavaScript modular, publicado na Vercel. O Supabase fornece banco PostgreSQL, autenticação, sincronização em tempo real e uma função administrativa para usuários. O código de pagamentos registra formas de pagamento e tem interfaces para autorização/conciliação; esta inspeção não comprova integração operacional com banco, Pix ou maquininha.

## Identidade e alinhamento

| Componente | Evidência atual | Resultado |
|---|---|---|
| GitHub | `Luandutra2000/PDV` | Repositório correto |
| Branch local e remota de trabalho | `feature/fechamento-caixa`, commit `aae0725a830152117a8543ac8745bee60639b223` | Mesmo commit |
| Vercel | `luandutra2000s-projects/pdv`; status GitHub de publicação bem-sucedida | Projeto correto |
| Site | `https://pdv-blue.vercel.app/` redireciona para `https://pdv-qdelicia.vercel.app/` | HTTP 200 e tela de login |
| Arquivos publicados | 96 arquivos de HTML, CSS, JS, manifesto e service worker comparados, normalizando apenas CRLF/LF | 96 iguais; nenhuma divergência |
| Configuração em produção | Provedor `supabase`; URL `https://inquppkbkmhnbtwpriuw.supabase.co` | Projeto correto; chave pública com papel `anon` |
| Consultas dos adapters | 13 tabelas consultadas com os campos usados pelo código e `limit=0` | Todas responderam HTTP 200 |
| Testes automatizados | `npm.cmd test`, 54 arquivos de teste, 5.234 ms informados pelo executor | 54 aprovados, 0 reprovados |

A tela de login abriu sem erros ou avisos capturados no console. A função `admin-users`, na ação de leitura `listUsers`, respondeu HTTP 401 à chamada sem sessão de usuário. Os 11 IDs do catálogo original de demonstração não foram encontrados em `products`.

As 13 tabelas verificadas foram: `cash_closings`, `cash_movements`, `categories`, `command_items`, `commands`, `financial_categories`, `financial_transactions`, `out_of_stock_sales`, `product_stock`, `products`, `sale_items`, `sales` e `showcase_movements`. Essas verificações confirmam compatibilidade das consultas de leitura, não integridade de todos os dados nem funcionamento de todas as escritas.

## Achados, em ordem de prioridade

### 1. Alto — valores de vendas, caixa e financeiro acessíveis sem login

**Local:** API pública do Supabase do PDV.

**Comprovação:** requisições usando somente a chave pública publicada no site, sem sessão de usuário, retornaram HTTP 200 e um registro em cada uma das consultas abaixo:

| Tabela | Colunas consultadas | Registros retornados |
|---|---|---:|
| `sales` | `id,total` | 1 |
| `cash_movements` | `id,amount` | 1 |
| `financial_transactions` | `id,amount` | 1 |

Os valores e identificadores não foram incluídos neste relatório. Nenhuma escrita, alteração ou exclusão foi usada para testar esse acesso.

**Causa:** a autorização efetiva do banco permite leitura pelo papel não autenticado. O repositório também contém políticas explicitamente permissivas para `anon` em `202606030002_restore_anon_online_sync.sql`, inclusive para vendas e caixa. A definição exata de todas as políticas remotas não foi obtida nesta sessão, portanto não atribuo a exposição financeira a uma política remota específica.

**Correção recomendada:** revisar os privilégios e as políticas RLS das tabelas e funções operacionais; exigir sessão e permissões apropriadas no banco. Depois, testar bloqueio anônimo e acesso legítimo por perfil. A chave `anon` ser pública é esperado; esconder a chave ou a tela de login não corrige a autorização. Referência: [RLS e permissões no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

### 2. Alto — repositório não contém toda a estrutura necessária para reconstruir o banco

**Local:** `supabase/migrations/`.

**Comprovação:** existem 26 arquivos de migração, dos quais 9 são marcadores sem o SQL original. Não há criação, nos arquivos SQL do diretório Supabase, de tabelas usadas pelo aplicativo como `product_stock`, `showcase_movements` e `out_of_stock_sales`. Também não estão definidas as funções `process_showcase_production`, `process_showcase_sale` e `adjust_showcase_stock`, chamadas por `src/services/showcase-sync.service.js`.

As três tabelas citadas existem no ambiente remoto e aceitaram as consultas dos adapters. Portanto há estrutura operacional remota que não está representada integralmente nas migrações locais. Isso compromete a reprodução de um ambiente novo e a recuperação baseada apenas no Git. Não foi executado reset nem replay das migrações.

**Correção recomendada:** obter o esquema remoto autorizado e reconciliar uma base completa e versionada, preservando o histórico existente; verificar a criação de um banco de homologação vazio antes de considerá-lo reproduzível.

### 3. Médio — branch padrão do GitHub difere da versão publicada

**Local:** configuração de branch padrão de `Luandutra2000/PDV`.

**Comprovação:** a branch padrão informada pelo GitHub é `codex/piloto-online-supabase-netlify`, no commit `b34268658f4b9b676d242117d923bb07a720ad20`. A branch local e remota `feature/fechamento-caixa` está em `aae0725a830152117a8543ac8745bee60639b223`, com 138 commits não presentes na branch padrão.

Os arquivos publicados coincidem com os locais; este achado não indica que o site atual esteja desatualizado. Indica que um clone da branch padrão ou uma nova integração que use essa branch pode começar com uma versão diferente. A configuração da branch de produção no painel da Vercel não foi consultada nesta sessão.

**Correção recomendada:** definir e documentar qual branch representa produção e alinhar as configurações do GitHub e da Vercel, sem trocar a branch nem fazer merge automaticamente durante a auditoria.

### 4. Baixo — documentação inicial desatualizada

**Local:** `README.md`, seções de estado atual, tecnologias e próximas etapas.

O README ainda apresenta autenticação, Supabase, PWA e publicação como evolução futura, embora o código e o site já contenham essas partes. Isso dificulta entender a arquitetura e configurar um ambiente novo.

**Correção recomendada:** atualizar o README com a arquitetura atual, URL canônica, branch de produção definida, configuração necessária e limitações verificadas.

## Limites da varredura

Não foram realizados venda real, movimentação de estoque, alteração de usuário, escrita de teste, publicação, migração, reset ou exclusão de dados. O único novo arquivo dentro do projeto é este relatório; `.codex/config.toml` já estava presente antes da varredura.

As duas conexões MCP possuem autenticação e inventário de ferramentas reconhecidos. Entretanto, a tarefa já aberta não disponibilizou a execução das novas ferramentas administrativas: a tentativa de reutilizar a tarefa por outro cliente foi recusada por já existir um escritor ativo. Autenticar uma conexão não significa que suas ferramentas foram carregadas nesta tarefa. As verificações remotas efetivas foram feitas pelo conector GitHub, pelo site e por requisições de leitura à API do próprio PDV.

Por isso, não foram certificados o histórico de migrações aplicado, todas as políticas e privilégios remotos, gatilhos, publicação Realtime, logs de produção, backups, restauração, funcionamento offline em vários dispositivos, pagamentos, impressão nem a jornada completa após login. Testes locais aprovados não substituem essas verificações.

## Próxima ação

Priorizar a restrição do acesso anônimo no Supabase, com testes de autorização que preservem o funcionamento dos usuários legítimos. O alinhamento de arquivos está comprovado; a exposição de informações operacionais é o bloqueio mais importante encontrado.
