# Matriz de Testes — 04/08/2026

| Área | Cenário | Resultado |
|---|---|---|
| Backup | exportação pública de 23 tabelas, checksums e migrações | aprovado com limitação de RLS |
| Automação | suíte completa | 46/46 |
| Produtos | criar produto com estoque inicial | aprovado após correção |
| Estoque | refletir estoque do cadastro na vitrine | aprovado |
| Vendas | venda real em dinheiro com troco | aprovado |
| Vendas | baixa única de duas unidades | aprovado |
| Vendas | cancelamento e estorno de estoque | aprovado |
| Financeiro | entrada e saída reais | aprovado |
| Financeiro | duas entradas consecutivas sem perda | aprovado após correção |
| Financeiro | reconciliar lançamento órfão sem duplicar caixa | aprovado |
| Relatórios | totais operacionais e formas de pagamento | aprovado |
| Realtime | entrada refletida em outra aba | aprovado em 293 ms |
| Autenticação | sessão restaurada após recarga | aprovado |
| Pessoas | criar administrador QA | aprovado |
| Pessoas | excluir administrador QA com confirmação interna | aprovado; 4 → 3 usuários |
| Responsividade | 375×812 | aprovado |
| Responsividade | 768×1024 | aprovado |
| Segurança | permissões, XSS e resiliência automatizados | aprovado |
| Desempenho leve | 20 GETs de produção | média 57,6 ms; p95 66,3 ms; p99 234,1 ms |
| Carga ampla | 10.000 casos/50.000 operações | não executado em produção |
| Recuperação | restauração integral do backup | não executado em produção |
| Equipamentos | impressão e pagamentos externos | pendente |
