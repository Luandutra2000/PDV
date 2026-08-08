# Plano de implementação: remover produtos demonstrativos

1. Alterar `storage.service.js` para iniciar e resetar o catálogo de produção com `[]`, mantendo `mockProducts` exclusivamente no ambiente de testes.
2. Criar migração idempotente que exclua de `public.products` somente os onze IDs demonstrativos aprovados.
3. Adicionar teste de regressão para catálogo vazio em produção, categorias preservadas e escopo restrito da migração.
4. Executar os testes focados e a suíte completa; revisar o diff antes de aplicar a migração remota.

