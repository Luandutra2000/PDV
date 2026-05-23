# Criar usuario pela aba Pessoas

## Objetivo

Permitir que um administrador crie usuarios do PDV pela propria aba Pessoas, sem acessar o painel do Supabase no uso diario.

## Escopo

- A aba Pessoas deixa de ser placeholder e passa a exibir cadastro de usuario.
- O cadastro recebe nome, email, senha inicial e perfil: administrador ou operador.
- A criacao real do usuario acontece em uma Netlify Function.
- A chave `SUPABASE_SERVICE_ROLE_KEY` fica somente no ambiente do Netlify.
- Depois de criar o Auth user, a funcao cria ou atualiza a linha correspondente em `public.profiles`.

## Fora de escopo

- Recuperacao de senha.
- Edicao completa de permissoes por usuario.
- Convite por email.
- Cadastro publico sem admin logado.

## Arquitetura

O frontend usa a sessao Supabase atual para enviar `Authorization: Bearer <access_token>` para a funcao `/.netlify/functions/create-user`.

A funcao valida o token no Supabase, confirma que o usuario chamador tem permissao `users.manage` pela tabela `profiles`/`role_permissions`, cria o usuario via Admin Auth API e grava o perfil em `public.profiles`.

## UX

A aba Pessoas mostra:

- formulario compacto para criar usuario;
- lista de usuarios cadastrados;
- mensagens claras de sucesso e erro.

No modo local, a tela informa que cadastro online exige Supabase.

## Validacao

- Teste de payload e validacao do service de Pessoas.
- Teste da funcao Netlify para erro de campos obrigatorios.
- Teste da funcao Netlify para caminho feliz usando `fetch` falso.
- Suite existente do projeto continua passando.
