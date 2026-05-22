# Piloto online com Supabase e Netlify

## Contexto

O PDV Lanchonete hoje roda como frontend em JavaScript puro, HTML e CSS, com persistencia local em `localStorage`. O objetivo desta etapa e publicar uma versao online para piloto controlado com dados reais da equipe, sem tratar ainda como producao definitiva.

O piloto deve comecar com baixo custo, preferencialmente usando planos gratuitos ou de entrada, mas sem criar uma arquitetura descartavel. A aplicacao local atual deve continuar disponivel como contingencia ate o piloto estabilizar.

## Decisoes aprovadas

- Banco online: Supabase.
- Hospedagem inicial: Netlify.
- Escopo do piloto: equipe usando dados reais, com cuidado e possibilidade de voltar ao local atual.
- Prioridade: publicar rapido e sincronizar os dados principais.
- CRM no piloto: CRM gerencial/financeiro existente.
- CRM de clientes: fica para etapa futura.

## Objetivos

1. Criar uma base online no Supabase para os dados operacionais principais do PDV.
2. Publicar o frontend estatico no Netlify.
3. Criar uma camada de acesso a dados que permita migrar por partes do `localStorage` para Supabase.
4. Manter o CRM gerencial funcionando com dados online.
5. Adicionar login, permissoes iniciais e auditoria minima para dados reais.
6. Preservar a capacidade de operar localmente durante o periodo de piloto.

## Fora de escopo

- CRM comercial com cadastro completo de clientes, campanhas, fidelidade ou historico por cliente.
- Offline avancado com sincronizacao bidirecional.
- Migracao completa de todos os modulos em uma unica entrega.
- Infraestrutura propria em VPS.
- Troca para React, Next.js ou outro framework.

## Arquitetura

O app continua sendo um frontend estatico em JavaScript puro. O `index.html` e os modulos atuais serao publicados no Netlify. O Supabase sera usado para Postgres, Auth, politicas RLS e API de dados.

Fluxo aprovado:

```text
usuarios da lanchonete
  -> app PDV publicado no Netlify
  -> modulos e services atuais
  -> data provider
  -> Supabase ou localStorage temporario
```

A mudanca central e introduzir uma camada de dados com contrato estavel. Os services passam a depender dessa camada em vez de acessar diretamente o `localStorage` para todos os dominios. Durante a transicao, a camada pode usar Supabase para dados migrados e `localStorage` para o que ainda nao entrou no piloto.

## Dados do piloto

Primeira fatia online:

- Produtos e categorias.
- Vendas e itens de venda.
- Sessoes de caixa.
- Movimentos de caixa.
- Fechamentos de caixa.
- Producao e estoque essencial.
- Dados necessarios para o CRM gerencial.
- Perfis de usuario, roles, permissoes e auditoria minima.

Tabelas iniciais previstas:

- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `products`
- `categories`
- `sales`
- `sale_items`
- `cash_sessions`
- `cash_movements`
- `cash_closings`
- `stock_production`
- `stock_items`
- `audit_logs`

`commands` e `command_items` podem entrar na primeira fatia se o fluxo de comandas online for necessario para o piloto. Caso contrario, ficam para a etapa seguinte.

## CRM gerencial

O CRM atual do projeto e gerencial/financeiro. Ele deve continuar calculando:

- resumo por periodo;
- vendas;
- entradas;
- saidas;
- lucro estimado;
- ticket medio;
- totais por forma de pagamento;
- ranking de produtos;
- ranking por categoria;
- series de vendas;
- movimentacoes financeiras;
- historico de fechamento.

No inicio, o CRM nao precisa duplicar dados em tabelas proprias. Ele deve calcular indicadores a partir das tabelas operacionais online. Views ou funcoes no Supabase podem ser adicionadas depois se consultas ficarem pesadas ou repetitivas.

CRM de clientes fica explicitamente fora deste piloto e deve ser tratado como uma fase separada.

## Autenticacao, permissoes e auditoria

Como o piloto usa dados reais, login e controle minimo sao obrigatorios.

Regras:

- Acesso online exige login.
- Perfis iniciais: administrador e operador.
- Tabelas publicas expostas pelo Supabase devem ter RLS habilitado.
- Permissoes devem ser verificadas nos services, nao apenas escondendo itens de menu.
- O frontend nunca deve receber `service_role` ou chave secreta.
- O app usa apenas chave publica do Supabase.

Auditoria minima deve cobrir:

- login e logout;
- venda finalizada;
- venda ou comanda cancelada, quando existir no fluxo online;
- entrada e saida de caixa;
- fechamento de caixa;
- lancamento ou ajuste de estoque;
- produto criado ou editado;
- usuario criado, editado ou desativado.

## Fluxo de migracao e publicacao

1. Preparar Supabase
   - Criar projeto.
   - Criar migrations.
   - Criar tabelas iniciais.
   - Habilitar RLS.
   - Criar policies.
   - Criar usuario administrador inicial.

2. Criar camada de dados
   - Definir contratos para produtos, vendas, caixa, estoque e CRM.
   - Implementar provider local para preservar testes existentes.
   - Implementar provider Supabase para a primeira fatia online.

3. Migrar primeira fatia
   - Produtos e categorias.
   - Vendas e itens.
   - Caixa, movimentos e fechamentos.
   - Estoque essencial.
   - CRM gerencial lendo dados migrados.

4. Publicar no Netlify
   - Configurar deploy do app estatico.
   - Configurar variaveis publicas do Supabase.
   - Configurar URLs autorizadas no Supabase Auth.
   - Gerar link de teste para a equipe.

5. Validar piloto
   - Testar login de administrador e operador.
   - Testar venda completa.
   - Testar entrada e saida de caixa.
   - Testar fechamento.
   - Testar CRM por dia, semana e periodo personalizado.
   - Testar acesso pelo celular.
   - Manter operacao local como contingencia ate estabilizar.

## Tratamento de erros e contingencia

O app nao deve fingir sucesso quando uma gravacao online falhar.

Regras:

- Se o Supabase estiver indisponivel, mostrar erro claro.
- Evitar finalizar venda sem confirmacao de gravacao online.
- Registrar falhas relevantes para analise.
- Antes de migrar dados reais, exportar o conteudo local atual.
- Manter o fluxo local atual disponivel ate o piloto ser aprovado.

O modo offline completo nao entra neste piloto. Qualquer fila local de sincronizacao deve ser limitada e explicita, para nao esconder divergencias de dados.

## Testes

Testes automaticos devem cobrir:

- contratos da camada de dados;
- provider local;
- provider Supabase, quando houver ambiente configurado;
- produtos e categorias;
- vendas e itens;
- caixa, movimentos e fechamentos;
- estoque essencial;
- CRM gerencial com dados online;
- autenticacao;
- permissoes;
- auditoria.

Testes manuais do piloto:

- login como administrador;
- login como operador;
- criar ou editar produto;
- finalizar venda;
- registrar entrada;
- registrar saida;
- fechar caixa;
- conferir historico de fechamento;
- abrir CRM por periodo;
- validar acesso via link Netlify no celular.

## Criterios de aceite

- O app publicado no Netlify abre fora da maquina local.
- Usuario logado consegue acessar as telas permitidas.
- Produtos e categorias carregam do Supabase.
- Uma venda salva no Supabase com seus itens.
- Movimentos de caixa salvam no Supabase.
- Fechamento de caixa salva no Supabase.
- CRM gerencial calcula indicadores a partir dos dados online.
- Acoes sensiveis geram auditoria minima.
- Falha de gravacao online mostra erro claro.
- Nenhuma chave secreta do Supabase fica no frontend.
- O sistema local permanece disponivel como contingencia durante o piloto.

## Plano de evolucao posterior

Depois do piloto estabilizar:

1. Completar permissoes e auditoria.
2. Migrar comandas online, se nao entrarem na primeira fatia.
3. Criar CRM comercial de clientes.
4. Adicionar dominio proprio.
5. Avaliar upgrade de plano no Supabase e Netlify.
6. Planejar PWA mobile e offline avancado.
