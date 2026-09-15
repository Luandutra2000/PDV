# Correções para uso diário — plano de implementação

**Objetivo:** corrigir os bloqueios reproduzidos na auditoria, validar a operação e atualizar `https://pdv-qdelicia.vercel.app/`, autorizado pelo usuário em 15/09/2026.

**Especificação:** `docs/AUDITORIA_PDV_2026-09-15.md`, especialmente Bloqueios para liberação e Sequência para liberar.

**Arquitetura:** manter JavaScript modular e os serviços atuais. Compartilhar leitura/gravação local confiável; proteger filas com identificação das operações confirmadas; usar o dia operacional no fechamento e um contrato explícito de itens na fronteira Supabase. Pagamentos continuam registros manuais de recebimentos confirmados externamente.

**Restrições:** preservar dados reais, não executar limpeza/reset de produção, não publicar antes dos testes. Não adicionar integração bancária/fiscal sem fornecedor definido. Registrar claramente testes que dependam de sessão autenticada ou hardware.

## 1. Fechamento e entrada de valores

- [ ] Transformar a reprodução R$ 100 ontem + R$ 10 hoje em regressão de `buildClosingSummary` e verificar R$ 10 para hoje. Manter CRM, fechamento rápido e mobile consistentes. Documentar semântica diária e testar virada de dia.
- [ ] Corrigir `src/services/cash-closing.service.js`, consumidores mobile/CRM e o evento de digitação em `src/modules/caixa/caixa.module.js`.
- [ ] Verificar no navegador que teclas `6` e `5` preservam foco e produzem `65`, incluindo decimais e observação.

## 2. Contrato e fila da vitrine

- [ ] Capturar `_payload` real de `processShowcaseSale` e exigir `items[0].product_id === 'qa-produto'` e `unit_price === 7.5` na chamada RPC.
- [ ] Corrigir `src/services/showcase-sync.service.js`; manter a representação camelCase local. Preservar novas operações durante envio e serializar envios da mesma fila.
- [ ] Corrigir o saldo apresentado no cadastro de Produtos e testar venda/cancelamento local e contrato SQL.

## 3. Armazenamento e fila financeira

- [ ] Em `tests/local-provider-large-cache.test.mjs`, exigir que todos os registros persistidos sobrevivam ao reinício do cache e que erro de quota seja informado ao chamador.
- [ ] Cobrir atualização por outra aba e gravação parcial/fracasso sem confirmação falsa. Remover truncamento da fila financeira e garantir persistência antes da confirmação.
- [ ] Em teste de concorrência com promises controladas, iniciar envio de A, enfileirar B com falha durante esse envio e exigir que B permaneça pendente após A concluir. Corrigir `financial-sync.service.js` sem remover versões novas da mesma operação.

## 4. Auditoria, recuperação e operação

- [ ] Testar e corrigir envio central de auditoria, evitando reenvio indiscriminado de registros antigos; evitar sincronização de seeds antes do login.
- [ ] Excluir credenciais do backup, disponibilizar exportação autorizada na interface e atualizar inventário de backup remoto. Restauração não pode sobrescrever sessão nem disparar sincronização de dados durante rollback.
- [ ] Melhorar contraste e esclarecer confirmação manual de pagamentos. Fornecer orientações reais de suporte/recuperação em lugar do módulo vazio.

## 5. Validação e publicação

- [ ] Executar `npm.cmd test`, os novos casos de regressão e Playwright com dados locais isolados. Revisar mudanças com agentes independentes.
- [ ] Verificar acesso à Vercel/Supabase e publicação do endereço confirmado. Aplicar somente migrations necessárias e revisadas, com recuperação disponível; nenhuma escrita de teste em produção sem escopo definido.
- [ ] Atualizar versão de cache, publicar, comparar arquivos críticos servidos e retestar segurança sem login. Validar operação autenticada quando o usuário disponibilizar sessão.
- [ ] Entregar resultado com evidências, estado real da publicação e somente pendências concretas. Hardware ou integrações não verificados não podem ser declarados homologados.
