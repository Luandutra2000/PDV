# Segurança — 29/07/2026

## Resultado final

O XSS armazenado catalogado como P0 foi corrigido e retestado diretamente na produção.

## Evidência

- Payload usado: `<img src=x onerror=alert('QA-XSS-RETEST')>`.
- O conteúdo apareceu somente como texto literal.
- Nenhum diálogo JavaScript foi disparado.
- O nome original `[QA] Produto 20260729` foi restaurado depois do teste.
- A regressão automatizada de XSS está incluída nos 46 testes aprovados.

## Proteções adicionais

- Escape de conteúdo persistido em produtos, estoque e relatórios.
- Backups SQL, relatórios exportados, arquivos `.env` e configurações locais não são enviados ao GitHub.
- Backups e documentação de QA não fazem parte do artefato Vercel.

## Limites

Brute force, testes destrutivos de SQL injection, adulteração de tokens e isolamento completo entre empresas devem ser realizados em homologação isolada.
