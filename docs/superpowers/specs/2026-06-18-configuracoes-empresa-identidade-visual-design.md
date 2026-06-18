# Configuracoes da Empresa e Identidade Visual - Design

## Contexto

O PDV Lanchonete ja possui shell modular em JavaScript puro, menu lateral, tema claro/escuro, permissoes, Supabase, PWA e deploy em Vercel. A marca exibida no sistema ainda e fixa no codigo, como `Zelo` e `PDV`, e as cores principais tambem vivem nos arquivos CSS.

A nova aba deve permitir que cada empresa assinante personalize a identidade visual usada dentro do proprio sistema: nome do programa, logo e cores. O pedido inicial citava PDFs, propostas, recibos, comprovantes e impressoes, mas o escopo foi revisado e aprovado para nao incluir documentos nesta entrega.

Esta especificacao deve ser implementada sobre a base do ultimo deploy informado:

- branch: `codex/showcase-stock-sync`;
- commit: `1bad1f6`;
- deploy: `dpl_5EZZa8Jeih87hRsffAzNqETwvMHE`;
- app: `app.js?v=20260618-02`;
- cache/PWA: `pdv-v59`;
- Supabase project: `inquppkbkmhnbtwpriuw`;
- ultima migration aplicada: `20260618194000_add_user_delete_permission.sql`.

A workspace local vista durante o brainstorming estava em outra branch e com mudancas pendentes. A implementacao deve reconciliar a base antes de editar codigo.

## Objetivo

Criar uma aba funcional chamada **Configuracoes da Empresa** para que o cliente configure:

- nome exibido do programa;
- logo exibida no sistema;
- cor primaria;
- cor secundaria;
- cor de destaque;
- dados basicos internos da empresa.

Ao salvar, o sistema deve refletir a identidade visual sem alterar codigo manualmente. A sidebar, o header e as telas atuais devem herdar nome, logo e cores quando possivel.

## Fora de Escopo

- Gerar PDFs.
- Imprimir documentos.
- Criar propostas comerciais.
- Criar recibos, comprovantes ou relatorios em PDF.
- Upload de assinatura digital.
- Textos comerciais, termos e condicoes, mensagem de rodape para documentos.
- Motor completo de filiais.
- Refatorar todo o tema visual do sistema.
- Remover funcionalidades existentes.

## Decisoes Aprovadas

### Primeira Entrega Integrada

A entrega escolhida e a opcao B do brainstorming: criar a aba funcional e integrar identidade visual nas telas atuais do sistema. Nao sera criado um motor real de PDF agora.

### Permissao Especifica

A aba deve usar uma nova permissao:

```text
company_settings.manage
```

Essa permissao deve ser liberada por padrao para `admin` e `dono`. Usuarios sem a permissao nao veem a aba no menu e recebem bloqueio ao tentar acessar a rota diretamente.

### Estrutura SaaS Real

A implementacao deve criar uma base multiempresa de verdade:

- tabela `empresas`;
- coluna `empresa_id` em `profiles`;
- tabela `empresa_configuracoes` vinculada a `empresa_id`;
- RLS por `empresa_id`.

Nao usar apenas um `empresa_id` fixo como solucao principal.

## Arquitetura

Criar um modulo dedicado:

```text
src/modules/empresa-config/empresa-config.module.js
src/styles/empresa-config.css
src/services/empresa-config.service.js
```

O service central deve:

- carregar a configuracao da empresa atual;
- retornar uma configuracao padrao quando ainda nao houver registro;
- salvar alteracoes;
- validar nome, cores e dados basicos;
- aplicar cores como CSS custom properties;
- disponibilizar nome e logo para sidebar/header;
- fazer upload/remocao de logo no Supabase Storage quando Supabase estiver ativo;
- manter fallback local em `localStorage` quando o app estiver em modo local.

O bootstrap do app deve carregar a configuracao depois do login e antes de montar o shell principal:

```text
login -> carregar dados/Supabase -> carregar empresa_configuracoes -> aplicar identidade -> renderizar sidebar/topbar
```

## Interface

A aba deve ter layout moderno, limpo e responsivo em cards:

### Card 1: Identidade Visual

- upload, troca e remocao da logo;
- preview da logo;
- cor primaria;
- cor secundaria;
- cor de destaque;
- preview de botoes, titulo e destaque usando as cores escolhidas.

### Card 2: Nome do Programa

- campo `nome_sistema`;
- preview de como o nome aparecera no menu lateral/header.

### Card 3: Dados Basicos da Empresa

Campos:

- nome fantasia;
- razao social, opcional;
- CNPJ, opcional;
- telefone/WhatsApp, opcional;
- e-mail, opcional;
- endereco basico, opcional.

### Card 4: Pre-visualizacao

Mostrar uma miniatura do shell do sistema com:

- logo escolhida;
- nome do programa;
- cores aplicadas em botao, titulo e destaque.

### Acoes

- Salvar configuracoes.
- Restaurar padrao.
- Trocar logo.
- Remover logo.

Mostrar feedback visual de sucesso ou erro usando o padrao de notificacoes/toasts existente.

## Modelo de Dados

### `empresas`

Campos minimos:

- `id uuid primary key`;
- `nome text not null`;
- `slug text unique`;
- `is_active boolean not null default true`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

### `profiles`

Adicionar:

- `empresa_id uuid references public.empresas(id)`.

Perfis existentes devem ser associados a uma empresa padrao criada pela migration ou por rotina segura de bootstrap.

### `empresa_configuracoes`

Campos:

- `id uuid primary key`;
- `empresa_id uuid not null references public.empresas(id) unique`;
- `nome_sistema text not null`;
- `nome_fantasia text not null`;
- `razao_social text`;
- `cnpj text`;
- `telefone text`;
- `whatsapp text`;
- `email text`;
- `endereco text`;
- `logo_url text`;
- `cor_primaria text not null`;
- `cor_secundaria text not null`;
- `cor_destaque text not null`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

As cores devem ser salvas como hex valido, por exemplo `#2563eb`.

## Supabase Storage

Criar bucket:

```text
logos
```

O caminho recomendado para arquivos e:

```text
{empresa_id}/logo-{timestamp}.{ext}
```

Cada usuario autenticado so pode ler e escrever arquivos da propria empresa. A regra de Storage deve seguir o mesmo isolamento por `empresa_id`.

Nao criar bucket de assinaturas nesta entrega.

## RLS E Seguranca

Habilitar RLS em `empresas` e `empresa_configuracoes`.

Politicas esperadas:

- usuario autenticado e ativo pode ler a propria empresa;
- usuario autenticado e ativo pode ler a configuracao da propria empresa;
- usuario com `company_settings.manage` pode inserir/atualizar configuracao da propria empresa;
- nenhum usuario pode ler ou editar configuracao de outra empresa;
- policies devem usar `TO authenticated` com predicado de propriedade por `empresa_id`;
- updates precisam de `USING` e `WITH CHECK`.

Evitar autorizacao baseada em `user_metadata`. A autorizacao deve usar `profiles`, permissoes e `empresa_id`.

## Integracao Visual No Sistema

A configuracao deve afetar:

- brand da sidebar;
- nome exibido do sistema;
- logo exibida no menu/header quando houver;
- cores principais via variaveis CSS;
- botao principal, foco, destaques e elementos que ja usam tokens globais;
- App do Dono e demais telas por heranca das variaveis CSS.

O tema claro/escuro continua existindo. A identidade visual deve complementar o tema, nao substituir toda a paleta.

## Fallback Local

Em modo local:

- salvar configuracao em `localStorage`;
- guardar logo como data URL/base64 se necessario;
- aplicar a mesma identidade visual ao shell;
- manter defaults seguros quando nao houver configuracao.

Adicionar uma chave em `STORAGE_KEYS`, por exemplo:

```text
companySettings: 'pdv.companySettings'
```

## Validacoes

Obrigatorio:

- `nome_sistema`;
- `nome_fantasia`;
- `cor_primaria`;
- `cor_secundaria`;
- `cor_destaque`.

Validar:

- cores hex;
- tamanho e tipo da imagem da logo;
- CNPJ quando preenchido;
- e-mail quando preenchido;
- telefone/WhatsApp quando preenchido.

Se upload da logo falhar, nao perder os dados digitados. A tela deve mostrar erro claro e permitir nova tentativa.

## Testes

Adicionar testes para:

- normalizacao da configuracao padrao;
- validacao de cores e campos obrigatorios;
- salvar/ler configuracao em modo local;
- permissao `company_settings.manage` nos defaults de `admin` e `dono`;
- sidebar renderizando nome/logo configurados;
- migration criando `empresas`, `profiles.empresa_id`, `empresa_configuracoes`, permissao e RLS;
- regressao dos testes existentes de auth, permissoes, Supabase provider e cache/PWA.

## Criterios De Aceite

- Existe uma aba "Configuracoes da Empresa" no menu para usuarios autorizados.
- Usuario sem permissao nao ve a aba e nao acessa a rota.
- O cliente consegue trocar nome do programa, logo e cores.
- Ao salvar, sidebar/header refletem as mudancas.
- Ao recarregar, configuracao persiste.
- Modo local continua funcionando.
- Supabase isola configuracoes por empresa.
- Nao ha alteracao em funcionalidades existentes fora do necessario para aplicar identidade visual.
- Nenhum PDF, impressao, proposta, recibo ou assinatura digital entra nesta entrega.
