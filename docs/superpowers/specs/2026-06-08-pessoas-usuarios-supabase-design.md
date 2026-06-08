# Pessoas/Usuarios com Supabase - Design

## Contexto

A pagina Pessoas ja existe no PDV Lanchonete, mas hoje o fluxo principal ainda e local. A tela usa `src/modules/pessoas/pessoas.module.js`, que chama `auth.service.js` para criar/editar usuarios e `permission.service.js` para alterar permissoes individuais. Esses services gravam em `localStorage` nas chaves `pdv.users` e `pdv.userPermissionOverrides`.

O projeto ja possui Supabase em andamento. A migration inicial criou `public.roles`, `public.profiles`, `public.permissions` e `public.role_permissions`, mas o provider Supabase atual nao hidrata nem persiste usuarios/permissoes. Tambem nao existe uma tabela local para excecoes individuais de permissao por usuario. Por isso a tela parece funcionar visualmente, mas usuarios e permissoes nao persistem no Supabase nem sobrevivem de forma confiavel entre navegadores.

## Objetivo

Corrigir a pagina Pessoas para gerenciar usuarios reais do Supabase, perfis e permissoes persistidas, mantendo o layout geral e melhorando o visual com as cores atuais do PDV.

O resultado esperado e:

- cadastrar usuario com login real no Supabase Auth;
- salvar perfil em `public.profiles`;
- editar nome, usuario/email, perfil, status e senha opcional;
- salvar permissoes padrao por perfil e excecoes individuais no Supabase;
- aplicar permissoes em menus e acoes sensiveis;
- manter a tela responsiva e alinhada ao visual atual.

## Fora de Escopo

- Substituir todo o sistema por outro framework.
- Trocar a identidade visual do PDV.
- Criar tabelas duplicadas como `users`, `usuarios`, `pessoas` se `profiles` ja cobre a necessidade.
- Expor `service_role` ou qualquer chave secreta no front-end.
- Reescrever todos os modulos do sistema em uma unica etapa.

## Abordagem Escolhida

A solucao aprovada e usar Supabase Auth + `public.profiles` + roles/permissoes + excecoes individuais.

O front-end chamara um service de usuarios/permissoes. Para criar ou editar usuarios com senha, esse service chamara uma Supabase Edge Function administrativa, por exemplo `admin-users`. A Edge Function usara a chave de servico somente no servidor, validara o usuario logado e executara as operacoes sensiveis no Auth e nas tabelas publicas.

Essa abordagem foi escolhida porque cumpre o objetivo completo sem salvar senha localmente e sem expor credenciais privilegiadas no navegador.

## Modelo de Dados

### Tabelas Existentes

Usar as tabelas ja previstas:

- `auth.users`: login real do Supabase Auth.
- `public.profiles`: dados publicos do usuario.
- `public.roles`: perfis do sistema.
- `public.permissions`: catalogo de permissoes.
- `public.role_permissions`: permissoes padrao de cada perfil.
- `public.audit_logs`: auditoria de alteracoes importantes.

### Nova Tabela

Adicionar uma tabela para excecoes individuais:

```sql
public.user_permission_overrides (
  user_id uuid references public.profiles(id) on delete cascade,
  permission_id text references public.permissions(id) on delete cascade,
  state text not null check (state in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission_id)
)
```

O estado `default` nao sera salvo como linha. Quando o usuario escolher `Padrao`, a linha correspondente sera removida.

### Perfis

O sistema passa a trabalhar com quatro perfis:

- `admin`: Administrador, acesso total.
- `gerente`: gestao, relatorios, caixa e estoque, sem editar usuarios por padrao.
- `caixa`: frente de caixa, venda, movimentos e fechamento de caixa.
- `operador`: frente de caixa, venda basica e vitrine/producao.

A migration deve alinhar os perfis atuais. Hoje existem `admin`, `dono` e `operador`; a nova etapa deve adicionar `gerente` e `caixa`. O perfil `dono` pode permanecer para compatibilidade se ja existir dado real, mas a tela Pessoas usara os quatro perfis aprovados.

## Catalogo de Permissoes

O catalogo do front e o catalogo do banco devem ficar alinhados. Permissoes minimas:

### Vendas

- `sales.access`: acessar frente de caixa.
- `sales.create`: finalizar venda.
- `sales.cancel`: cancelar venda.
- `sales.discount`: aplicar desconto.

### Caixa

- `cash.movement`: registrar entrada, saida e sangria.
- `cash.close`: fechar caixa.

### Vitrine/Estoque

- `showcase.access`: acessar vitrine.
- `showcase.launch`: lancar vitrine/producao.

### Gestao

- `products.manage`: gerenciar produtos.
- `reports.view`: ver relatorios.
- `crm.view`: ver CRM.

### Sistema

- `users.manage`: cadastrar e editar usuarios.
- `permissions.manage`: editar permissoes.
- `audit.view`: ver auditoria.

Se o banco ainda usa nomes antigos, como `cashier.access`, `sale.create`, `cash.movement.create`, `stock.view` e `stock.create`, a implementation deve escolher um caminho unico: migrar o banco para os ids do front ou criar um mapa explicito e testado. A preferencia e alinhar os ids para evitar traducao invisivel.

## Fluxo de Cadastro

Ao clicar em `Cadastrar usuario`, a tela deve:

1. Validar nome, email/usuario, senha, perfil e ativo.
2. Chamar o service de usuarios.
3. O service chama a Edge Function `admin-users`.
4. A Edge Function valida o JWT do administrador atual.
5. A Edge Function confirma que o usuario atual tem `users.manage`.
6. A Edge Function cria o usuario em Supabase Auth com email e senha.
7. A Edge Function grava `public.profiles` com nome, role e status.
8. A Edge Function registra auditoria.
9. O front atualiza a lista e mostra sucesso.

Se houver erro, a tela deve mostrar uma mensagem clara sem perder os dados digitados quando isso for seguro.

## Fluxo de Edicao

Ao clicar em `Editar`, a tela carrega os dados do usuario selecionado no formulario.

Campos editaveis:

- nome;
- email/usuario;
- perfil;
- ativo/inativo;
- senha somente se o campo nova senha for preenchido.

Ao salvar:

1. O front valida o formulario.
2. O service chama a Edge Function.
3. A Edge Function valida permissao administrativa.
4. A Edge Function atualiza Auth quando email ou senha mudarem.
5. A Edge Function atualiza `public.profiles`.
6. O front recarrega o usuario e as permissoes.
7. A lista e o painel de permissoes atualizam sem reload manual.

## Fluxo de Permissoes

As permissoes aparecem agrupadas por categoria. Cada permissao tem tres opcoes:

- `Padrao`: usa a permissao do perfil e remove override individual.
- `Liberado`: grava `allow` em `user_permission_overrides`.
- `Bloqueado`: grava `deny` em `user_permission_overrides`.

Administrador sempre tem acesso total. Overrides de `deny` nao bloqueiam administrador.

Para os demais perfis, a resolucao final sera:

1. usuario inexistente ou inativo: bloqueado;
2. perfil `admin`: liberado;
3. override `deny`: bloqueado;
4. override `allow`: liberado;
5. permissao presente no perfil: liberado;
6. caso contrario: bloqueado.

## Aplicacao das Permissoes

As permissoes devem ser usadas de verdade, nao apenas exibidas na tela.

Menus devem ser filtrados no sidebar conforme a permissao da rota. Acesso direto por rota tambem deve validar permissao e mostrar aviso.

Acoes sensiveis devem validar no service antes de executar:

- cancelar venda;
- aplicar desconto;
- registrar entrada, saida ou sangria;
- fechar caixa;
- lancar vitrine/producao;
- gerenciar produtos;
- acessar relatorios/CRM;
- cadastrar/editar usuarios;
- editar permissoes.

Mensagem padrao para bloqueio:

```text
Voce nao tem permissao para esta acao.
```

No Supabase, RLS e policies devem continuar protegendo as tabelas. A validacao no front melhora a experiencia, mas nao substitui seguranca no banco.

## Interface

Manter o layout geral aprovado:

- coluna esquerda com lista de usuarios;
- coluna direita com formulario de cadastro/edicao;
- permissoes abaixo em grid por categoria;
- botao principal muda entre `Cadastrar usuario` e `Salvar alteracoes`;
- botoes secundarios `Novo usuario` e `Cancelar edicao`;
- usuario selecionado destacado;
- feedback de sucesso e erro no proprio modulo.

### Visual

A melhoria visual deve respeitar as cores atuais do programa:

- fundo `#f8f2ec`;
- superficie branca `#ffffff`;
- borda `#eee0d6`;
- texto `#2e2a27`;
- texto secundario `#8b8179`;
- acao primaria `#ff6b1a`;
- primaria forte `#e65b11`;
- selecionado/acento suave `#fff0e6`.

Nao criar uma paleta nova. O objetivo e organizar melhor cards, espacos, formularios e estados usando o tema atual.

## Servicos do Front-End

Criar ou evoluir um service dedicado para usuarios online, mantendo a compatibilidade local.

Responsabilidades:

- listar usuarios de `profiles`;
- criar usuario via Edge Function;
- editar usuario via Edge Function;
- carregar catalogo de permissoes;
- carregar permissoes padrao por perfil;
- carregar/salvar overrides individuais;
- resolver permissao final;
- emitir eventos para atualizar sidebar e tela atual.

`auth.service.js` deve deixar de salvar novo usuario com senha em texto local quando o modo Supabase estiver ativo. O modo local pode permanecer para desenvolvimento, mas deve estar claramente separado do modo online.

## Supabase Edge Function

Criar uma Edge Function administrativa para operacoes de usuarios.

Operacoes esperadas:

- `listUsers` opcional, se a leitura direta de `profiles` nao for suficiente;
- `createUser`;
- `updateUser`;
- `setUserActive`;
- `changeUserPassword`;
- `savePermissionOverride` opcional, se a politica de RLS exigir caminho server-side.

Regras:

- validar JWT do usuario atual;
- consultar `profiles` e permissoes do usuario atual;
- exigir `users.manage` para cadastro/edicao;
- exigir `permissions.manage` para alterar permissoes;
- usar `service_role` somente dentro da function;
- nunca retornar senha;
- retornar erros seguros e compreensiveis para o front.

## RLS e Seguranca

Todas as tabelas publicas usadas devem ter RLS habilitado.

Politicas necessarias:

- usuario ativo pode ler seu proprio perfil;
- usuario com `users.manage` pode listar e alterar profiles;
- usuario ativo pode ler roles/permissoes necessarias para montar sua sessao;
- usuario com `permissions.manage` pode alterar role permissions e overrides;
- `user_permission_overrides` deve ser legivel por usuarios ativos e gravavel apenas por quem tem `permissions.manage`, ou via Edge Function administrativa.

Nao usar `user_metadata` como fonte confiavel de autorizacao. Role e permissoes devem vir de `public.profiles` e tabelas relacionadas.

## Migracao e Compatibilidade

Como existem usuarios locais em `localStorage`, a implementation deve tratar esse estado com cuidado:

- nao apagar usuarios locais automaticamente;
- no modo Supabase, preferir dados remotos;
- manter admin local apenas como fallback/desenvolvimento se o modo online nao estiver ativo;
- documentar que usuarios locais antigos nao sao contas Supabase Auth ate serem recriados ou migrados.

Se ja houver profiles reais no Supabase, a migration nao deve duplicar tabelas nem recriar usuarios.

## Testes

Testes obrigatorios automatizados:

- service de auth/usuarios cria usuario sem expor senha;
- service de auth/usuarios edita nome, email, perfil, status e senha opcional;
- service de permissoes resolve perfil + override;
- `default` remove override individual;
- administrador nao e bloqueado por override `deny`;
- provider/service Supabase mapeia `profiles`, `roles`, `permissions`, `role_permissions` e `user_permission_overrides`;
- Pessoas renderiza lista, formulario de cadastro, formulario de edicao e selects de permissao;
- menu/rota bloqueia usuario sem permissao;
- service sensivel bloqueia acao sem permissao.

Teste manual obrigatorio:

1. Fazer login como administrador.
2. Cadastrar usuario Operador.
3. Confirmar que aparece na lista.
4. Confirmar que aparece no Supabase Auth e em `public.profiles`.
5. Editar nome/perfil.
6. Desativar usuario.
7. Alterar permissao especifica para `Bloqueado`.
8. Fazer logout/login com esse usuario.
9. Confirmar que menu/acao bloqueada nao funciona.
10. Alterar permissao para `Liberado`.
11. Testar novamente.
12. Abrir em outro navegador/computador e confirmar sincronizacao.

## Entrega Esperada

Ao final da implementation, a resposta deve listar:

- arquivos alterados;
- tabelas Supabase usadas;
- migrations criadas;
- se havia localStorage/mock envolvido;
- o que foi corrigido no cadastro;
- o que foi corrigido nas permissoes;
- testes automatizados e manuais realizados;
- proximos ajustes recomendados.
