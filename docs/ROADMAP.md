# Roadmap Tecnico

Este roadmap organiza as proximas etapas do PDV em blocos pequenos, testaveis e seguros.

## Ordem recomendada

1. Preparacao documental e GitHub.
2. Login, usuarios, permissoes e auditoria.
3. Supabase e banco de dados.
4. Design visual mantendo o layout atual.
5. PWA mobile.
6. Publicacao com dominio para testes.

## Task 0 - Preparacao documental

Objetivo: deixar o projeto compreensivel antes de novas implementacoes.

Checklist:

- [x] Criar README inicial.
- [x] Documentar arquitetura atual.
- [x] Documentar roadmap tecnico.
- [x] Documentar setup local.
- [ ] Atualizar `.gitignore` para logs, `.env` e dependencias futuras.
- [ ] Criar commit apenas de documentacao.

Arquivos:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/ROADMAP.md`
- `docs/LOCAL_SETUP.md`
- `.gitignore`

Commit sugerido:

```bash
docs: document project roadmap and local setup
```

## Task 1 - Login, usuarios, permissoes e auditoria

Objetivo: criar controle de acesso com administrador e operador de caixa.

Checklist:

- [ ] Criar tela de login.
- [ ] Criar sessao do usuario logado.
- [ ] Criar usuario administrador inicial.
- [ ] Criar usuario caixa.
- [ ] Criar cadastro e edicao de usuarios.
- [ ] Ativar e desativar usuarios.
- [ ] Criar roles/funcoes.
- [ ] Criar permissoes por funcao.
- [ ] Bloquear menus conforme permissao.
- [ ] Bloquear acoes sensiveis nos services.
- [ ] Registrar auditoria para acoes importantes.
- [ ] Exibir usuario logado.
- [ ] Implementar logout.
- [ ] Testar permissoes e auditoria.

Arquivos provaveis:

- Criar `src/modules/auth/login.module.js`
- Alterar `src/modules/pessoas/pessoas.module.js`
- Criar `src/services/auth.service.js`
- Criar `src/services/permission.service.js`
- Criar `src/services/audit.service.js`
- Criar `src/database/auth-seed.js`
- Alterar `src/app.js`
- Alterar `src/components/sidebar.component.js`
- Alterar `src/database/schema.js`
- Alterar `src/services/storage.service.js`
- Criar `tests/auth-service.test.mjs`
- Criar `tests/permission-service.test.mjs`
- Criar `tests/audit-service.test.mjs`

Permissoes iniciais:

- `dashboard.view`
- `cashier.access`
- `cashier.open`
- `cashier.close`
- `sale.create`
- `sale.cancel`
- `sale.discount`
- `commands.history.view`
- `reports.view`
- `stock.view`
- `stock.create`
- `stock.update`
- `products.view`
- `products.create`
- `products.update`
- `products.delete`
- `users.manage`
- `roles.manage`
- `audit.view`
- `settings.manage`

Acoes com auditoria:

- Login e logout.
- Venda finalizada.
- Venda ou comanda cancelada.
- Desconto aplicado.
- Entrada ou saida de caixa.
- Abertura e fechamento de caixa.
- Produto criado, editado ou desativado.
- Estoque lancado ou cancelado.
- Usuario criado, editado ou desativado.
- Permissao alterada.

Commits sugeridos:

```bash
feat: add local auth session and permission model
feat: add user management module
feat: add audit log service
test: cover auth permissions and audit logs
```

## Task 2 - GitHub e Supabase

Objetivo: preparar versionamento e banco real.

Checklist GitHub:

- [ ] Revisar mudancas locais pendentes.
- [ ] Atualizar `.gitignore`.
- [ ] Criar README final da fase inicial.
- [ ] Criar repositorio remoto.
- [ ] Configurar branch principal.
- [ ] Fazer commits pequenos por etapa.

Checklist Supabase:

- [ ] Inicializar Supabase no projeto.
- [ ] Criar `.env.example`.
- [ ] Criar migrations.
- [ ] Criar tabela `profiles`.
- [ ] Criar tabelas de roles e permissoes.
- [ ] Criar tabelas operacionais do PDV.
- [ ] Ativar RLS nas tabelas publicas.
- [ ] Criar policies por papel/permissao.
- [ ] Criar seeds iniciais.
- [ ] Integrar Auth primeiro.
- [ ] Migrar dados por dominio, sem trocar tudo de uma vez.

Tabelas iniciais:

- `profiles`
- `roles`
- `permissions`
- `role_permissions`
- `products`
- `categories`
- `commands`
- `command_items`
- `sales`
- `sale_items`
- `cash_sessions`
- `cash_movements`
- `stock_production`
- `stock_items`
- `audit_logs`

Campos comuns:

- `id uuid primary key`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid`
- `updated_by uuid`
- `is_active boolean`
- `deleted_at timestamptz`, quando fizer sentido

Boas praticas:

- Nunca expor `service_role` no frontend.
- Nao usar `user_metadata` para autorizacao.
- Usar RLS em tabelas publicas.
- Escrever migrations versionadas.
- Separar ambiente local, teste e producao.

Commits sugeridos:

```bash
chore: prepare repository documentation
chore: initialize supabase project structure
feat: add initial supabase database schema
feat: add supabase auth and profile integration
```

## Task 3 - Melhorar design mantendo layout

Objetivo: deixar a interface mais bonita e profissional sem mudar a estrutura principal.

Checklist:

- [ ] Receber esboco visual.
- [ ] Revisar tokens em `base.css`.
- [ ] Melhorar botoes.
- [ ] Melhorar cards.
- [ ] Melhorar inputs e formularios.
- [ ] Melhorar modais.
- [ ] Melhorar tabelas.
- [ ] Melhorar abas.
- [ ] Melhorar hover, focus e disabled.
- [ ] Melhorar responsividade.
- [ ] Validar tema claro e escuro.
- [ ] Testar telas principais.

Arquivos provaveis:

- `src/styles/base.css`
- `src/styles/layout.css`
- `src/styles/sidebar.css`
- `src/styles/buttons.css`
- `src/styles/cards.css`
- `src/styles/forms.css`
- `src/styles/modal.css`
- `src/styles/pdv.css`
- Possivel `src/styles/tables.css`
- Possivel `src/styles/responsive.css`

Commit sugerido:

```bash
style: refine pdv visual system without layout changes
```

## Task 4 - PWA mobile

Objetivo: criar app instalavel pelo navegador.

Checklist:

- [ ] Criar `manifest.json`.
- [ ] Criar `service-worker.js`.
- [ ] Criar icones do app.
- [ ] Criar layout mobile.
- [ ] Criar dashboard mobile.
- [ ] Integrar login.
- [ ] Respeitar permissoes.
- [ ] Mostrar vendas do dia.
- [ ] Mostrar caixa do dia.
- [ ] Mostrar produtos mais vendidos.
- [ ] Mostrar comandas abertas e fechadas.
- [ ] Mostrar producao x vendido.
- [ ] Criar alertas importantes.
- [ ] Definir estrategia de cache.
- [ ] Testar instalacao no celular.

Arquivos provaveis:

- `manifest.json`
- `service-worker.js`
- `src/modules/mobile/mobile-dashboard.module.js`
- `src/styles/mobile.css`
- `index.html`
- `src/app.js`
- `src/services/sync.service.js`
- `src/services/auth.service.js`

Commit sugerido:

```bash
feat: add pwa shell and mobile dashboard
```

## Task 5 - Publicar com dominio

Objetivo: deixar o sistema acessivel para testes reais.

Checklist:

- [ ] Escolher hospedagem.
- [ ] Configurar projeto de deploy.
- [ ] Configurar variaveis de ambiente.
- [ ] Configurar dominio.
- [ ] Ativar HTTPS.
- [ ] Configurar URLs do Supabase Auth.
- [ ] Criar ambiente de teste.
- [ ] Planejar ambiente de producao futuro.
- [ ] Definir rotina de backup.
- [ ] Testar login remoto.
- [ ] Testar acesso pelo celular.

Opcoes recomendadas:

- Vercel.
- Netlify.
- Cloudflare Pages.

Arquivos provaveis:

- `.env.example`
- `docs/DEPLOY.md`
- Possivel `vercel.json`
- Possivel `netlify.toml`

Commit sugerido:

```bash
docs: add deployment guide for test environment
```

## Cuidados gerais

- Fazer commits pequenos.
- Rodar testes antes e depois de cada task.
- Evitar migrar tudo para Supabase de uma vez.
- Validar permissoes nos services.
- Preservar layout atual durante melhorias visuais.
- Nao misturar design, banco e auth no mesmo commit.
- Nao sobrescrever mudancas locais em andamento.
