# Ambiente isolado de homologacao Supabase

## Situacao atual

O workspace estava vinculado ao projeto `inquppkbkmhnbtwpriuw`, o mesmo usado
pela configuracao atual do frontend. Esse identificador esta protegido no script
de reset e nao deve ser usado como ambiente descartavel.

## Criar o projeto de homologacao

1. Crie um novo projeto Supabase exclusivo para QA.
2. Nao reutilize banco, Auth, Storage ou chaves do ambiente atual.
3. Anote somente o `project ref` do novo projeto.
4. Vincule o workspace ao novo projeto:

```powershell
npx.cmd supabase link --project-ref SEU_PROJECT_REF_DE_HOMOLOGACAO
```

5. Aplique as migrations:

```powershell
npx.cmd supabase db push
```

## Usuários de QA

Crie pelo Supabase Auth, com senhas exclusivas de teste:

- `qa.admin@pdv.test`
- `qa.gerente@pdv.test`
- `qa.caixa@pdv.test`
- `qa.operador@pdv.test`

Não registre as senhas no Git, no seed SQL ou em documentação. Depois de criar
os usuários, execute o seed para associar os perfis e papéis.

## Seed reproduzível

O arquivo `supabase/seed.sql`:

- cria categorias e produtos com prefixo `qa-`;
- inclui produto com uma unidade para concorrência;
- inclui produto sem estoque;
- inclui produto inativo;
- associa usuários Auth conhecidos aos perfis;
- usa `upsert`, podendo ser executado novamente;
- não apaga vendas ou dados operacionais.

Para popular um banco local após reset:

```powershell
npx.cmd supabase db reset
```

## Reset remoto protegido

O reset remoto somente é permitido quando três verificações coincidem:

- o projeto vinculado não está na lista protegida;
- o argumento contém o project ref esperado;
- `SUPABASE_HOMOLOG_PROJECT_REF` contém o mesmo valor.

Exemplo:

```powershell
$env:SUPABASE_HOMOLOG_PROJECT_REF = 'SEU_PROJECT_REF_DE_HOMOLOGACAO'
.\scripts\reset-supabase-homologation.ps1 -ExpectedProjectRef $env:SUPABASE_HOMOLOG_PROJECT_REF
```

O script recusa explicitamente o projeto atual `inquppkbkmhnbtwpriuw`.

## Configuração do frontend de homologação

Configure o preview da Vercel com as chaves do projeto de QA:

```text
SUPABASE_URL=https://SEU_PROJECT_REF_DE_HOMOLOGACAO.supabase.co
SUPABASE_ANON_KEY=chave_publica_do_projeto_de_qa
```

Nunca exponha `service_role` no frontend.

## Validação mínima depois do provisionamento

1. Confirmar que cada perfil autentica.
2. Confirmar as permissões de administrador, gerente, caixa e operador.
3. Executar `npm.cmd test`.
4. Fazer uma venda com os produtos `qa-*`.
5. Comparar venda, itens, caixa, estoque e auditoria diretamente no banco.
6. Confirmar que nenhum registro aparece no projeto atual/produção.
