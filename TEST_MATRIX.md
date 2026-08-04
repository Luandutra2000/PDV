# Matriz de Testes — 04/08/2026

| Área | Cenário | Resultado |
|---|---|---|
| Backup | exportação pública de 23 tabelas, checksums e migrações | aprovado com limitação de RLS |
| Automação | suíte completa | 47/47 |
| Produtos | criar produto com estoque inicial | aprovado após correção |
| Estoque | refletir estoque do cadastro na vitrine | aprovado |
| Vendas | venda real em dinheiro com troco | aprovado |
| Vendas | baixa única e cancelamento com estorno | aprovado |
| Financeiro | entradas e saídas reais | aprovado |
| Financeiro | fila sem perda de lançamentos | aprovado após correção |
| Relatórios | totais e formas de pagamento | aprovado |
| Realtime | entrada refletida em outra aba | aprovado em 293 ms |
| Autenticação | sessão restaurada após recarga | aprovado |
| Pessoas | criar e excluir administrador QA | aprovado; 4 → 3 usuários |
| Responsividade | 375×812 e 768×1024 | aprovado |
| Segurança | permissões, XSS e resiliência automatizados | aprovado |
| Carga ampla | 10.000 casos/50.000 gravações em produção | aprovado |
| Integridade da carga | 12.500 registros em cada uma das quatro tabelas | aprovado |
| Escala no navegador | totals de 12.500 vendas hidratados integralmente | aprovado após correções |
| App do Dono | total, caixa e feed sob carga | aprovado |
| Recuperação | restauração integral do backup | pendente em ambiente isolado |
| Equipamentos | impressão e pagamentos externos | pendente |
