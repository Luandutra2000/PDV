# CRM e Fechar Caixa Gerencial - Design

## Objetivo

Criar uma area gerencial para a lanchonete, com foco em caixa, vendas, entradas, saidas, produtos, vitrine e fechamento. A nova tela deve ajudar o dono a entender rapidamente como o negocio esta performando no dia, semana, mes ou periodo personalizado.

O design usa como inspiracao visual os dashboards enviados pelo usuario: layout claro, cards brancos, laranja como cor principal, graficos simples e composicao moderna. A tela nao deve copiar a referencia nem usar fotos decorativas de produtos. O foco sera analise real do PDV.

## Decisao De Navegacao

A aba atual `Dashboard` nao sera substituida por esta nova tela.

A navegacao passara a tratar as areas assim:

- Grupo `Vendas`
  - `Frente de Caixa`
  - `Historico de Transacoes`
- Grupo gerencial/financeiro
  - `Fechar Caixa / CRM`
  - demais itens financeiros ja existentes

A tela atual de `Dashboard`, que hoje mostra historico de comandas e movimentos de dinheiro, sera renomeada visualmente para `Historico de Transacoes` e movida para o grupo `Vendas`.

A nova tela com cards, graficos, rankings, fechamento e indicadores sera `Fechar Caixa / CRM`.

## Identidade Visual

A nova base visual do sistema deve seguir esta direcao:

- Fundo principal claro puxado para creme.
- Cards e paineis brancos.
- Laranja como cor principal para destaque, botoes, icones e graficos.
- Texto principal escuro.
- Cinzas quentes para textos secundarios e bordas.
- Grafico com laranja, preto/cinza escuro e tons suaves.
- Layout limpo, com bastante hierarquia visual.

Essa base podera depois ser aplicada ao restante do sistema, mas nesta etapa o foco e a nova tela `Fechar Caixa / CRM` e os ajustes de navegacao ligados a ela.

## Escopo Da Primeira Entrega

Entram nesta etapa:

- Criar a tela `Fechar Caixa / CRM`.
- Manter a tela atual de Dashboard como `Historico de Transacoes`.
- Mover `Historico de Transacoes` para o grupo `Vendas`.
- Criar botao `Fechamento Rapido` na `Frente de Caixa`.
- Abrir fechamento rapido em modal grande sobre a Frente de Caixa.
- Criar filtros globais de periodo: hoje, ontem, semana, mes e periodo personalizado.
- Criar cards executivos.
- Criar graficos simples com HTML/CSS.
- Criar tabelas de movimentacoes e produtos.
- Criar ranking de produtos e categorias.
- Criar fechamento completo em area gerencial.
- Criar fechamento rapido com abas internas.
- Documentar estrutura futura de banco/app.
- Fazer commits pequenos por etapa.

Ficam fora desta etapa:

- Biblioteca externa de graficos.
- Impressao/exportacao de relatorio.
- Login real e permissao por usuario.
- App mobile real.
- Banco/API real.
- Edicao livre de fechamento ja fechado.
- Fotos de produtos no dashboard.

## Fechar Caixa / CRM

A tela `Fechar Caixa / CRM` sera a tela gerencial principal.

Ela tera:

- Topo com titulo, filtros globais e acoes rapidas.
- Cards executivos.
- Area central com graficos.
- Area de analise de produtos.
- Area de movimentacoes financeiras.
- Area de fechamento completo.
- Historico resumido de fechamentos.

### Filtros Globais

O filtro global controla a maioria da pagina:

- Hoje.
- Ontem.
- Semana.
- Mes.
- Periodo personalizado.

Produtos e fechamento podem ter filtros extras quando necessario, mas o periodo global sera a base dos calculos.

### Cards Executivos

Cards iniciais:

- Total vendido no periodo.
- Total de entradas.
- Total de saidas.
- Lucro estimado.
- Ticket medio.
- Comandas abertas.
- Comandas fechadas.
- Total em dinheiro.
- Total em Pix.
- Total em debito.
- Total em credito.
- Total em fiado/outros, quando existir.

Formula inicial do lucro estimado:

```text
lucro estimado = vendas + entradas - saidas
```

Essa formula e gerencial simples. Custos reais/margem por produto podem ser adicionados em fase posterior.

### Graficos

Graficos simples e uteis:

- Vendas por dia/periodo.
- Vendas por forma de pagamento.
- Produtos mais vendidos.
- Entradas vs saidas.

Os graficos podem ser feitos com HTML/CSS nesta etapa, sem biblioteca externa, para manter o projeto leve.

### Analise De Produtos

Indicadores e tabelas:

- Produto mais vendido.
- Produto menos vendido.
- Produto com maior faturamento.
- Produto que vendeu muito, mas faturou pouco.
- Ranking por quantidade vendida.
- Ranking por faturamento.
- Quantidade vendida por produto.
- Valor vendido por produto.
- Comparacao por categoria.
- Categoria mais vendida.
- Horario com maior volume de vendas.
- Dia com maior faturamento.
- Diferenca entre producao/vitrine e vendas, usando estoque quando houver dados.

Categorias esperadas:

- Salgados.
- Bebidas.
- Doces.
- Combos.
- Outros.

O sistema atual ja possui categorias dinamicas; esses nomes sao exemplos para dados reais ou mockados.

### Entradas E Saidas

O CRM deve permitir registrar e analisar entradas e saidas com categoria.

Categorias iniciais de entrada:

- Reforco de caixa.
- Pagamento de cliente.
- Dinheiro extra.
- Ajuste manual.
- Outros.

Categorias iniciais de saida:

- Compra de material.
- Compra de ingredientes.
- Pagamento de fornecedor.
- Despesa operacional.
- Retirada do dono.
- Troco.
- Manutencao.
- Outros.

Cada movimento deve guardar:

- Valor.
- Tipo: entrada ou saida.
- Categoria.
- Descricao.
- Data/hora.
- Usuario responsavel.
- Status.

Nesta etapa, usuario responsavel pode ser `Local` ou `Administrador`, ate existir login real.

### Tabelas

Tabelas principais:

- Movimentacoes financeiras.
- Vendas por produto.
- Ranking por faturamento.
- Historico de fechamentos.

As tabelas devem ser densas o suficiente para analise, mas ainda legiveis.

## Fechamento Completo Na Tela CRM

A tela `Fechar Caixa / CRM` tera uma area de fechamento completo e facil de entender, sem fluxo longo em varias paginas.

Campos e informacoes:

- Saldo inicial do caixa.
- Entradas manuais.
- Saidas manuais.
- Vendas do periodo/dia.
- Total esperado em dinheiro.
- Total esperado em Pix.
- Total esperado em cartao debito.
- Total esperado em cartao credito.
- Valor contado em dinheiro.
- Pix conferido, opcional.
- Debito conferido, opcional.
- Credito conferido, opcional.
- Diferenca/sobra/falta.
- Observacao do fechamento.
- Botao para fechar caixa.
- Historico de fechamentos anteriores.

Regras:

- Toda venda finalizada entra automaticamente nos totais do fechamento.
- Toda entrada e saida manual entra no historico.
- Dinheiro contado e obrigatorio para fechar.
- Pix/cartoes podem ficar como esperado se nao forem conferidos.
- Fechamento fechado nao pode ser editado livremente depois.
- Ajustes futuros devem ser registrados como novo movimento ou ajuste auditavel.

## Fechamento Rapido Na Frente De Caixa

Na `Frente de Caixa`, sera adicionado um botao `Fechamento Rapido`.

Esse botao abre um modal grande por cima da tela, sem sair da operacao.

O modal tera abas internas:

1. `Caixa`
2. `Pagamentos`
3. `Vitrine`
4. `Confirmar`

### Aba Caixa

Mostra:

- Saldo inicial.
- Vendas do dia.
- Entradas.
- Saidas.
- Lucro estimado.
- Dinheiro esperado.

### Aba Pagamentos

Mostra:

- Dinheiro esperado.
- Valor contado no caixa.
- Pix esperado.
- Pix conferido, opcional.
- Debito esperado.
- Debito conferido, opcional.
- Credito esperado.
- Credito conferido, opcional.
- Diferenca geral.

### Aba Vitrine

Mostra produtos lancados na vitrine no dia:

- Produto.
- Produzido.
- Vendido.
- Baixado/perda/consumo.
- Sobra esperada.
- Sobra contada.
- Diferenca.

### Aba Confirmar

Mostra:

- Resumo final.
- Diferencas principais.
- Observacao.
- Botao `Fechar caixa`.

Regras:

- Se houver diferenca, observacao e obrigatoria.
- Fechamento salvo aparece no historico da tela `Fechar Caixa / CRM`.
- Vendas depois do fechamento continuam permitidas, mas devem aparecer como vendas apos fechamento.

## Estrutura Tecnica

Manter JS modular e CSS modular.

### Services

Criar ou ampliar services:

- `crm-dashboard.service.js`
  - Calcula cards executivos.
  - Calcula graficos.
  - Calcula ranking de produtos.
  - Calcula movimentacoes por periodo.
  - Calcula indicadores de categoria e horario.
- `cash-closing.service.js`
  - Deve continuar concentrando regras de fechamento.
  - Pode receber melhorias para saldo inicial, categorias e fechamento rapido.
- `transaction.service.js`
  - Deve receber categorias de entrada/saida.
  - Deve preservar compatibilidade com movimentos antigos sem categoria.
- `estoque.service.js`
  - Fornece comparacao de vitrine/producao/vendas quando houver dados.

### Componentes

Criar componentes separados:

- `dashboard-resumo.component.js`
- `graficos-financeiros.component.js`
- `analise-produtos.component.js`
- `entradas-saidas.component.js`
- `historico-fechamentos.component.js`
- `fechamento-rapido-modal.component.js`

Esses componentes devem renderizar HTML e receber dados prontos dos services.

### Modulos

Modulo atual de `dashboard`:

- Passa a representar `Historico de Transacoes`.
- Pode manter grande parte da logica atual.
- Deve ter titulo, menu e textos ajustados.

Modulo de `caixa`:

- Vira `Fechar Caixa / CRM`.
- Renderiza o dashboard gerencial.
- Usa componentes e service de CRM.

Modulo de `vendas`:

- Ganha botao `Fechamento Rapido`.
- Abre modal importado de componente dedicado.

### CSS

Criar CSS focado para o CRM, mantendo modularidade:

- Variaveis da nova paleta no `base.css`.
- Classes especificas do CRM no `pdv.css` ou novo arquivo dedicado, se o projeto passar a importar esse arquivo.
- Evitar sobrescrever tudo de uma vez sem necessidade.

O objetivo e permitir migrar o visual do restante do sistema depois, sem quebrar telas ja existentes.

## Modelo Futuro De Banco/App

Documentar e preparar mentalmente estas tabelas/colecoes:

- `cash_sessions` / `caixas`
- `cash_movements` / `movimentacoes_caixa`
- `sales` / `vendas`
- `sale_items` / `itens_venda`
- `products` / `produtos`
- `categories` / `categorias`
- `payment_methods` / `formas_pagamento`
- `users` / `usuarios`

Campos minimos:

### cash_sessions

- id.
- opened_at.
- closed_at.
- initial_amount.
- expected_cash.
- counted_cash.
- cash_difference.
- expected_pix.
- expected_debit.
- expected_credit.
- note.
- status.
- user_id.

### cash_movements

- id.
- cash_session_id.
- type.
- amount.
- category.
- description.
- created_at.
- user_id.
- status.

### sales

- id.
- cash_session_id.
- comanda_id.
- total.
- payment_method.
- received_amount.
- change.
- created_at.
- user_id.
- status.

### sale_items

- id.
- sale_id.
- product_id.
- quantity.
- unit_price.
- total.

### products

- id.
- name.
- category_id.
- price.
- cost.
- stock.
- active.

### categories

- id.
- name.
- type.
- active.

### payment_methods

- id.
- name.
- active.

### users

- id.
- name.
- role.
- active.

## Estrategia De Commits

Como o projeto vai crescer, a implementacao deve ser feita com commits pequenos e claros.

Sugestao de commits:

1. `docs: design crm e fechamento gerencial`
2. `feat: add crm dashboard metrics service`
3. `feat: add crm dashboard components`
4. `feat: move transaction history under vendas`
5. `feat: build fechar caixa crm screen`
6. `feat: add quick closing modal to sales screen`
7. `feat: add categorized cash movements`
8. `test: cover crm metrics and quick closing`
9. `docs: document crm maintenance notes`

Cada commit deve ter um escopo claro para facilitar manutencao e rollback.

## Documentacao De Manutencao

Ao implementar, atualizar ou criar documentacao explicando:

- Onde ficam os services principais.
- Como os filtros de periodo funcionam.
- Como o fechamento calcula dinheiro esperado.
- Como entradas e saidas categorizadas entram no caixa.
- Como rankings de produtos sao calculados.
- Onde alterar a paleta visual.
- Quais estruturas sao temporarias em `localStorage`.
- Como migrar depois para banco real.

Essa documentacao pode ficar em `docs/ARCHITECTURE.md` ou documento especifico, sem sobrescrever material existente sem revisar.

## Tratamento De Erros

- Sem vendas no periodo: mostrar estados vazios uteis, nao zeros confusos.
- Sem produtos vendidos: ranking mostra mensagem clara.
- Sem vitrine no periodo: bloco de vitrine mostra aviso.
- Movimento sem categoria antigo: mostrar `Sem categoria`.
- Fechamento sem dinheiro contado: bloquear.
- Diferenca sem observacao no fechamento rapido: bloquear.
- Periodo personalizado incompleto: nao aplicar ate preencher inicio e fim.

## Testes

Testes de service:

- Resumo por periodo.
- Total vendido.
- Entradas por categoria.
- Saidas por categoria.
- Lucro estimado.
- Total por forma de pagamento.
- Ticket medio.
- Ranking por quantidade.
- Ranking por faturamento.
- Categoria mais vendida.
- Fechamento rapido salvando historico.
- Filtro global alterando todos os calculos.

Verificacao manual:

- Abrir `Historico de Transacoes`.
- Confirmar que a antiga tela Dashboard continua funcional.
- Abrir `Fechar Caixa / CRM`.
- Alterar filtros globais.
- Conferir cards e graficos.
- Registrar entrada e saida categorizadas.
- Abrir Frente de Caixa.
- Abrir modal `Fechamento Rapido`.
- Fechar caixa pelo modal.
- Ver fechamento no historico do CRM.

## Criterios De Aceite

- `Dashboard` atual nao e perdido; vira `Historico de Transacoes`.
- `Historico de Transacoes` fica no grupo `Vendas`.
- `Fechar Caixa / CRM` mostra a nova tela gerencial.
- A tela usa a nova paleta baseada em laranja/creme/branco.
- Filtro global altera os totais principais.
- Cards executivos mostram dados reais.
- Graficos simples mostram dados do periodo.
- Ranking de produtos funciona.
- Entradas e saidas podem ter categoria.
- Fechamento completo existe na tela CRM.
- Frente de Caixa tem botao `Fechamento Rapido`.
- Modal de fechamento rapido tem abas internas.
- Fechamento rapido salva historico.
- Commits sao pequenos e documentados.
- Documentacao de manutencao e atualizada.
