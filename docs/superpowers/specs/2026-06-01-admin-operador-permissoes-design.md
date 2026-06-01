# Admin, Operador e Permissoes Individuais

## Objetivo

Criar controle de acesso para o PDV com dois perfis base: Administrador e Operador. O Administrador deve ter acesso total ao app e conseguir cadastrar usuarios, editar usuarios e ajustar permissoes individuais dentro do proprio sistema. O Operador deve acessar apenas as rotinas operacionais: vendas, transacoes de caixa, lancamento de vitrine/producao e fechamento de caixa.

## Escopo

Esta etapa cobre:

- Login e sessao de usuario.
- Perfis base Administrador e Operador.
- Cadastro, edicao, ativacao e desativacao de usuarios.
- Permissoes padrao por perfil.
- Excecoes individuais por usuario.
- Bloqueio de menus e acoes sensiveis.
- Auditoria das acoes importantes.
- Motivo obrigatorio ao cancelar venda.

Fica fora desta etapa:

- Criacao de cargos customizados alem de Administrador e Operador.
- Recuperacao automatica de senha por e-mail.
- Controle multi-loja.
- Regras avancadas por horario ou turno.

## Perfis

### Administrador

O Administrador tem acesso total ao app:

- Frente de caixa.
- Transacoes e cancelamentos.
- Descontos.
- Entrada, saida e sangria de caixa.
- Fechamento de caixa.
- Vitrine/producao.
- Produtos.
- Relatorios.
- App do Dono.
- Usuarios.
- Permissoes.
- Auditoria.
- Configuracoes futuras.

O Administrador tambem pode criar usuarios, editar dados de usuarios, ativar ou desativar usuarios e alterar permissoes individuais.

### Operador

O Operador pode executar a rotina do dia:

- Acessar frente de caixa.
- Finalizar venda.
- Cancelar venda com motivo obrigatorio.
- Registrar entrada, saida e sangria de caixa.
- Lancar vitrine/producao.
- Fechar caixa.

O Operador nao pode:

- Aplicar desconto.
- Acessar App do Dono.
- Ver relatorios gerenciais.
- Gerenciar produtos.
- Gerenciar usuarios.
- Alterar permissoes.
- Ver auditoria geral.

## Permissoes

Permissoes iniciais:

| Codigo | Descricao |
| --- | --- |
| `sales.access` | Acessar frente de caixa |
| `sales.create` | Finalizar venda |
| `sales.cancel` | Cancelar venda |
| `sales.discount` | Aplicar desconto |
| `cash.movement` | Registrar entrada, saida e sangria |
| `cash.close` | Fechar caixa |
| `showcase.access` | Acessar vitrine |
| `showcase.launch` | Lancar vitrine/producao |
| `products.manage` | Gerenciar produtos |
| `reports.view` | Ver relatorios |
| `owner_app.view` | Acessar App do Dono |
| `users.manage` | Cadastrar e editar usuarios |
| `permissions.manage` | Editar permissoes |
| `audit.view` | Ver auditoria |

Permissoes padrao do Administrador:

- Todas as permissoes.

Permissoes padrao do Operador:

- `sales.access`
- `sales.create`
- `sales.cancel`
- `cash.movement`
- `cash.close`
- `showcase.access`
- `showcase.launch`

## Permissoes Individuais

Cada usuario tem um perfil base. Alem disso, pode ter excecoes individuais para liberar ou bloquear permissoes especificas.

Cada permissao individual tem tres estados:

- `default`: usa a regra padrao do perfil.
- `allow`: libera a permissao para aquele usuario.
- `deny`: bloqueia a permissao para aquele usuario.

A decisao final de acesso segue esta ordem:

1. Se o usuario estiver inativo, bloqueia.
2. Se for Administrador, permite tudo nesta primeira versao.
3. Se houver permissao individual `deny`, bloqueia.
4. Se houver permissao individual `allow`, permite.
5. Se nao houver excecao individual, usa o padrao do perfil.

O Administrador sempre fica com acesso total nesta primeira versao para reduzir o risco de alguem bloquear o proprio acesso administrativo.

## Tela Pessoas

A tela `Pessoas` passa a ser a central de usuarios e permissoes.

Para Administrador, ela deve permitir:

- Ver lista de usuarios.
- Cadastrar usuario.
- Editar usuario.
- Definir perfil: Administrador ou Operador.
- Ativar ou desativar usuario.
- Ajustar permissoes individuais.
- Ver historico basico de alteracoes daquele usuario.

As permissoes devem aparecer agrupadas por area:

- Vendas.
- Caixa.
- Vitrine/Estoque.
- Gestao.
- Sistema.

Para Operador, a tela Pessoas nao deve aparecer no menu e nao deve ser acessivel por rota direta.

## Bloqueio De Menus E Acoes

O sistema deve bloquear acesso em duas camadas:

- Interface: esconder menus, botoes e campos que o usuario nao pode usar.
- Services: validar permissao antes de executar a acao sensivel.

A validacao em service e obrigatoria para:

- Finalizar venda.
- Cancelar venda.
- Aplicar desconto.
- Registrar entrada, saida ou sangria.
- Fechar caixa.
- Lancar vitrine/producao.
- Gerenciar produtos.
- Gerenciar usuarios.
- Alterar permissoes.

Se uma acao for bloqueada, o app deve exibir uma mensagem curta informando que o usuario nao tem permissao.

## Cancelamento De Venda

Operador pode cancelar venda, desde que informe motivo obrigatorio.

O cancelamento deve registrar:

- ID da venda.
- Nome do operador.
- ID do operador quando houver.
- Data e hora.
- Motivo informado.
- Dados basicos da venda cancelada.

Administrador tambem deve informar motivo ao cancelar venda. A obrigatoriedade do motivo evita cancelamentos sem rastreabilidade.

## Auditoria

A auditoria deve registrar acoes importantes:

- Login.
- Logout.
- Venda finalizada.
- Venda cancelada.
- Entrada, saida ou sangria de caixa.
- Fechamento de caixa.
- Lancamento de vitrine/producao.
- Usuario criado.
- Usuario editado.
- Usuario ativado ou desativado.
- Permissao individual alterada.

Cada registro de auditoria deve conter:

- `id`
- `action`
- `entity_type`
- `entity_id`
- `user_id`
- `user_name`
- `reason`
- `metadata`
- `created_at`

## Dados Locais

Como o app ainda usa `localStorage` em parte da arquitetura, a primeira versao pode incluir chaves locais para:

- Usuarios.
- Sessao atual.
- Permissoes individuais.
- Auditoria.

Essas chaves devem ficar em `src/database/schema.js`, mantendo compatibilidade futura com Supabase.

## Supabase

A migration atual ja possui tabelas de `roles`, `permissions`, `role_permissions` e `profiles`. A implementacao deve alinhar os codigos de permissao locais com a estrutura do Supabase para evitar retrabalho na migracao.

Quando a autenticacao real com Supabase estiver ativa, as permissoes devem ser aplicadas tambem via RLS e funcoes de checagem no banco.

## Testes

Devem existir testes de service para:

- Administrador recebe todas as permissoes.
- Operador recebe apenas permissoes operacionais.
- `allow` individual libera permissao fora do padrao.
- `deny` individual bloqueia permissao do perfil.
- Usuario inativo nao consegue acessar.
- Operador nao consegue aplicar desconto.
- Cancelamento de venda exige motivo.
- Cancelamento registra auditoria com usuario e motivo.
- Alteracao de permissao registra auditoria.

## Criterios De Aceite

- Administrador consegue acessar todas as areas.
- Administrador consegue cadastrar e editar usuarios.
- Administrador consegue alterar permissoes individuais.
- Operador ve apenas as areas permitidas.
- Operador consegue vender, cancelar com motivo, registrar caixa, lancar vitrine e fechar caixa.
- Operador nao consegue aplicar desconto.
- Menus administrativos ficam ocultos para Operador.
- Rotas diretas tambem respeitam permissao.
- Acoes sensiveis sao validadas nos services.
- Auditoria registra usuario, data/hora e motivo quando aplicavel.
