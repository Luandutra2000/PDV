# Pessoas, permissoes e auditoria

## Contexto

A aba Pessoas/Usuarios precisa corrigir o modal de usuario e transformar o checklist de permissoes em uma fonte confiavel de autorizacao. A base de trabalho e a branch `codex/showcase-stock-sync` no commit `c82798a`, em worktree isolada, para preservar intactas as mudancas pendentes da pasta principal.

Hoje o modal recalcula o checklist quando o select de perfil muda, mas o perfil exibido volta para o usuario editado ou para o padrao `operador` porque o estado do modal nao guarda explicitamente o perfil selecionado. Tambem ha uma centralizacao parcial em `permission.service.js`, mas algumas permissoes financeiras estao duplicadas, algumas acoes usam chaves antigas, e nem todos os botoes/servicos validam a mesma permissao que aparece no checklist.

## Objetivos

- Corrigir a troca visual e funcional do campo Perfil no modal Novo/Editar usuario.
- Salvar e carregar o perfil correto localmente e no Supabase.
- Centralizar o catalogo de permissoes com metadados completos.
- Renderizar o checklist a partir do catalogo central.
- Garantir que cada permissao do checklist tenha efeito real ou seja removida/normalizada com cuidado.
- Bloquear rotas, abas, botoes e acoes sensiveis com helpers padronizados.
- Auditar criacao/edicao de usuarios, troca de perfil, alteracao de permissoes, ativacao/desativacao e tentativas bloqueadas.
- Manter o administrador com todas as permissoes e proteger o ultimo administrador ativo.

## Perfis

Os perfis validos sao:

- `admin`: Administrador.
- `gerente`: Gerente.
- `operador`: Operador/Caixa.
- `dono`: Visualizador/Dono.

O alias legado `caixa` e `operator` pode ser aceito na leitura para compatibilidade, mas novas gravacoes devem usar `operador` para Operador/Caixa. O Administrador sempre recebe todas as permissoes, mesmo se houver override antigo.

## Catalogo de permissoes

O catalogo central deve ficar em um unico ponto importavel pelo frontend, preferencialmente mantendo `permission.service.js` como fachada publica ou extraindo para `permission-catalog.service.js` se isso reduzir acoplamento. Cada item deve expor:

- `key` ou `id`, mantendo compatibilidade com os testes atuais.
- `name`/`label`.
- `description`.
- `group`.
- `module`.
- `defaultRoles`.

O checklist deve ser gerado somente desse catalogo. Nenhuma tela deve manter lista manual paralela de permissoes.

As permissoes esperadas sao:

- Vendas: `sales.access`, `sales.create`, `sales.cancel`, `sales.discount`.
- Caixa: `cash.movement`, `cash.withdrawal`, `cash.close`, `cash.balance.view`.
- Vitrine/Estoque: `showcase.access`, `showcase.launch`, `showcase.edit`, `stock.writeoff`.
- Gestao: `products.manage`, `categories.manage`, `reports.view`, `crm.view`, `owner_app.view`.
- Financeiro/Despesas: `financial.expense.access`, `financial.income.create`, `financial.expense.create`, `financial.entries.edit`, `financial.entries.delete`, `financial.categories.manage`, `financial.bill.pay`.
- Sistema: `users.manage`, `users.edit`, `permissions.manage`, `audit.view`, `data.export`.

Chaves financeiras legadas como `financial.view`, `financial.transaction.create`, `financial.transaction.edit`, `financial.transaction.cancel`, `financial.category.manage` e `financial.payable.pay` devem ser mapeadas ou substituidas no codigo para evitar duplicidade entre banco, checklist e regra real.

## Comportamento do modal

O estado do modal deve incluir `modalRole`. Ao abrir:

- Novo usuario inicia com `operador`.
- Editar usuario inicia com o perfil salvo no usuario/banco.
- O checklist inicial reflete as permissoes efetivas do usuario ou o padrao do perfil.

Ao alterar o select de Perfil:

- `modalRole` deve ser atualizado imediatamente.
- O select renderizado deve continuar mostrando o perfil escolhido.
- O checklist deve ser recalculado para o padrao do novo perfil.
- Overrides manuais anteriores no modal devem ser descartados na troca de perfil, porque a mudanca de perfil representa escolher um novo ponto de partida.

Depois da troca de perfil, qualquer alteracao manual no checklist deve ser persistida como override em relacao ao perfil escolhido. Para Administrador, o checklist fica todo marcado e bloqueado para edicao.

## Autorizacao

Os helpers publicos devem ficar padronizados:

- `hasPermission(user, permissionKey)`: checa permissao sem efeitos colaterais.
- `can(permissionKey, user?)`: atalho para o usuario atual quando `user` nao for informado.
- `requirePermission(permissionKey, user?)`: bloqueia a acao e registra auditoria de tentativa negada quando aplicavel.
- `assertPermission(user, permissionKey)`: pode continuar existindo como compatibilidade, chamando a nova regra.

As rotas e menus devem continuar fechados por permissao. O acesso direto por query string ou menu escondido deve renderizar acesso bloqueado. Services que salvam, excluem, cancelam, fecham caixa, pagam conta, alteram usuario ou alteram permissoes devem chamar `requirePermission`/`assertPermission`, para que esconder botao nao seja a unica barreira.

## Auditoria

As acoes administrativas devem registrar no `audit_logs`:

- `user.create`.
- `user.update`.
- `user.role.change`.
- `permission.override`.
- `user.activate`.
- `user.deactivate`.
- `permission.denied`.

As tentativas bloqueadas devem incluir modulo, permissao exigida, acao tentada, usuario e detalhes suficientes para aparecer no historico. No modo local, o registro vai para o storage de auditoria; no Supabase, a Edge Function e os services devem persistir em `audit_logs` quando houver sessao valida.

## Supabase

As tabelas usadas sao:

- `profiles`, com `role_id` correto.
- `permissions`.
- `role_permissions`.
- `user_permission_overrides`.
- `audit_logs`.

Uma migration deve alinhar roles, permissoes e defaults com o catalogo central. Se algum ambiente nao tiver `user_permission_overrides`, a migration deve cria-la com RLS. Policies devem continuar usando `private.current_profile_has_permission`, considerando admin, defaults por perfil e overrides `allow`/`deny`.

A Edge Function `admin-users` deve validar permissoes no servidor, salvar `role_id`, impedir remover/desativar o ultimo administrador ativo, salvar overrides, e registrar auditoria. Ela nao deve autorizar com `user_metadata`.

## Testes

Os testes devem cobrir:

- Select de Perfil muda para Administrador, Gerente, Operador/Caixa e Visualizador/Dono.
- Checklist padrao muda conforme o perfil.
- Administrador tem todas as permissoes.
- Usuario Gerente salvo carrega novamente com perfil Gerente.
- Operador/Caixa nao acessa Gestao, financeiro avancado e Sistema sem permissao.
- Rota bloqueada por URL direta e negada.
- Acao bloqueada impede execucao e registra auditoria.
- Catalogo central e migration possuem as mesmas permissoes.
- Supabase provider hidrata perfil e overrides para outro navegador/computador.

## Fora de escopo

- Redesenhar visualmente a aba Pessoas.
- Criar novos modulos funcionais que nao existam na base.
- Trocar a arquitetura para framework frontend.
- Remover suporte local/offline.

## Riscos e mitigacoes

- Risco: duplicidade de permissoes financeiras quebrar usuarios existentes. Mitigacao: mapear aliases legados e migrar chamadas para as chaves canonicas.
- Risco: o frontend ficar correto, mas Supabase continuar com permissao antiga. Mitigacao: teste de migration e alinhamento explicito de seed SQL.
- Risco: botao escondido sem bloqueio no service. Mitigacao: auditoria modulo a modulo e testes de acao bloqueada.
- Risco: alterar perfil de administrador sem perceber. Mitigacao: regra de ultimo administrador no frontend e na Edge Function.
