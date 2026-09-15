# Atualização para operação — 15/09/2026

## Escopo

Correções dos bloqueios reproduzidos na auditoria, preservando o modelo de recebimento manual e as permissões dos operadores.

## Correções

- Fechamento por dia local, campos que mantêm foco e distinção entre falha de confirmação e avisos posteriores.
- Fila financeira persistida antes da rede, reenvio serial e preservação de novas revisões; estoque com contrato SQL compatível, paginação e bloqueios de repetição no banco.
- Gravação local sem truncamento silencioso, leitura coerente com alterações externas e reversão de falhas de quota nas operações compostas.
- Auditoria persistente com autoria validada no servidor; backup sem credenciais e Suporte com exportação e pendências reais.
- Contraste dos produtos, orientação de recebimento manual e cache restrito a arquivos públicos da aplicação.

## Evidências

Jornada Playwright em ambiente local isolado: quatro meios de pagamento, total R$37,50, troco R$5,00; cancelamento de crédito leva a R$30,00 e repõe o estoque de 5 para 6 unidades. Entrada R$65,00 e saída R$14,65; fechamento contado R$65,35 com diferença zero. Digitação por tecla, observação, recarregamento e exportação de backup aprovados.

Banco Supabase `inquppkbkmhnbtwpriuw`: migrations `202609150001_harden_showcase_operations.sql` e `202609150002_harden_audit_authorship.sql` aplicadas pelo painel autenticado. Pré-verificação: zero produtos com saldos duplicados, 100 vendas e 30 registros de auditoria.

Teste SQL no banco real, dentro de transação revertida: entrada, venda, repetição e estorno preservam o saldo esperado. Teste sob perfil real Operador/Caixa: venda imutável, reenvio, baixa de estoque e auditoria aprovados. Nenhuma venda fictícia desses testes foi mantida.

Revisão independente em PostgreSQL/PGlite: contrato de itens, idempotência e rejeição segura de índice com duplicatas; autoria correta, nome obtido do perfil, recusa de outro autor/inativo/anônimo e envio por operador sem leitura da auditoria.

## Publicação

Endereço confirmado pelo usuário: https://pdv-qdelicia.vercel.app/ . Atualizar esta seção após validar a implantação.

Implantação anterior para recuperação: `dpl_LKcPns9hvYeJzLaaHBxm1R5LCFfH`, `https://pdv-4495h1zpk-luandutra2000s-projects.vercel.app`.

## Limites

Veja `OPERACAO_DIARIA.md`. A homologação do navegador usa dados fictícios; a validação real do banco usa permissões de operador e rollback, sem cobrança real. Impressão física, emissão fiscal, integração bancária e concorrência entre várias abas não foram homologadas. Backup completo remoto não foi validado como arquivo recuperável nesta sessão; o download e conteúdo do backup local foram verificados.
