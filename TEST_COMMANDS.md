# Comandos de Verificação

## Regressão completa

```powershell
npm.cmd test
```

Resultado atual: 46 aprovados e 0 reprovados.

## Qualidade do diff

```powershell
git diff --check
```

## Migrações pendentes

```powershell
npx.cmd supabase db push --dry-run
```

## Implantação

```powershell
npx.cmd vercel --prod
```

Os testes de carga, restauração e falha de infraestrutura devem ser executados somente em homologação.
