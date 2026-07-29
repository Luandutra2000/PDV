# Plano de Testes — Estado Atual

## Escopo concluído

- Jornadas de autenticação, cadastro, vitrine, venda e financeiro.
- Quatro formas de pagamento e troco.
- Cancelamento com reversão do estoque.
- Fechamento e reconciliação financeira.
- Relatórios operacionais.
- Sincronização entre duas abas.
- XSS armazenado.
- Responsividade básica.
- Regressão automatizada.

## Regras dos testes de produção

- Usar somente registros identificados por `[QA]`.
- Preservar backup anterior às gravações.
- Não enviar fechamento durante a conferência.
- Restaurar imediatamente qualquer cadastro alterado para segurança.
- Cancelar vendas criadas exclusivamente para reteste.

## Próxima fase

Executar carga, recuperação, restauração, matriz completa de navegadores, impressão física e integrações externas em ambiente de homologação isolado.
