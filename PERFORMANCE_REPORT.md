# Desempenho — 29/07/2026

## Resultado observado

- Fluxos principais permaneceram responsivos durante os testes reais.
- Atualização entre duas abas ocorreu automaticamente dentro da janela de espera de 2,2 segundos.
- Regressão completa com 46 testes terminou em aproximadamente 5 segundos.
- Não foi observado bloqueio de interface durante venda, cancelamento, relatórios ou fechamento.

## Limites

Não foram executados 10.000 cenários, 50.000 operações ou sete dias simulados contra o Supabase Free de produção. Esses ensaios devem usar uma cópia isolada, com instrumentação e limpeza reproduzível, para evitar consumo de cota e poluição do banco real.
