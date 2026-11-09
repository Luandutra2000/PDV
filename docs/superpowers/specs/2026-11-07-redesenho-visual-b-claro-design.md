# Redesenho visual do PDV: estilo "B claro"

Data: 2026-11-07
Desenhos aprovados: `docs/superpowers/specs/mockups/2026-11-07-opcoes-design.html` (seção "B. Turno da noite, versão clara") e `docs/superpowers/specs/mockups/2026-11-07-telas-b-claro.html` (todas as outras telas e o app do dono). Os dois arquivos abrem direto no navegador e são a referência visual. Em caso de dúvida, o desenho vale mais que este texto.

## Por que

O PDV da Q'Delícia funciona, mas a aparência atrapalha o uso:

- São três identidades diferentes: o login em degradê azul e em inglês, o sistema creme com laranja e as janelas de pagamento pretas.
- Laranja e vermelho estão em quase tudo (preço, marca, alerta, "Sem estoque", Perda, Saída). A tela parece sempre em alerta, e o que é problema de verdade se perde.
- Os cartões de produto têm botões demais (+2, +5, Qtd em cada um).
- O menu lateral usa siglas (FC, VT, HT, PR...) que precisam ser decoradas.
- O recebimento não ajuda a calcular o troco: não há teclado numérico nem cédulas rápidas.
- O CSS cresceu em camadas: 11 arquivos, cerca de 5.700 linhas, 277 cores diferentes e 85 degradês só em `redesign.css`. A fonte Inter é pedida mas nunca carregada.

O dono escolheu, entre cinco opções, a direção "B claro": fundo claro, cartões brancos, uma faixa fina com a cor da categoria em cada produto e âmbar só na ação principal. A versão escura da mesma direção vira o modo escuro.

## Objetivos

1. Uma identidade visual única do login ao fechamento, em todas as telas do computador e no app do dono.
2. Cor com significado:
   - âmbar para a ação principal e o item selecionado;
   - verde para dinheiro entrando e estados "ok";
   - vermelho só para saída, erro ou vencido;
   - uma cor fixa por categoria.
3. Frente de caixa mais limpa e mais rápida de usar, mantendo produtos à esquerda e comanda à direita.
4. Recebimento com cálculo de troco fácil: cédulas rápidas e teclado numérico.
5. Tudo em português, com os nomes de tela que o usuário entende.
6. Uma base de estilos enxuta, que substitui as camadas atuais em vez de somar outra por cima.

## Fora do escopo

- Mudar regras de negócio, cálculos de caixa, estoque, financeiro ou permissões.
- Mexer em serviços de dados, provedores (`local.provider.js`, `supabase.provider.js`), fila offline, sincronização ou Supabase (tabelas, RLS, funções).
- Criar funções novas além das descritas aqui. As únicas novidades de comportamento são as cédulas rápidas, o teclado do recebimento, o toque longo nos produtos e a troca de lugar dos botões de Entrada e Saída.

## O que seria um fracasso, mesmo que "funcione"

- Perder qualquer função que existe hoje. Toda ação atual precisa continuar acessível, ainda que em outro lugar, e com a mesma checagem de permissão.
- Quebrar o funcionamento offline, a sincronização ou a instalação como app (PWA).
- Deixar a frente de caixa mais lenta para vender, com mais toques por item.
- Acabar com quatro conjuntos de estilos brigando entre si, em vez de um.
- Esconder alertas importantes (caixa fechado, produto esgotado, conta vencida) por excesso de neutralidade.

## Restrições do projeto

- JavaScript puro com módulos ES, sem framework e sem etapa de build. Cada `import` leva `?v=` para quebrar cache, e o `index.html` carrega os CSS com `?v=`. Ao mudar arquivos, atualize esses números como o projeto já faz.
- O service worker (`service-worker.js`, hoje `CACHE_NAME = 'pdv-v85'`) precisa ter a versão aumentada para os clientes pegarem os arquivos novos.
- Há 82 testes em `tests/` rodados com `npm test` (Node 20 ou mais). Vários conferem textos e marcação das telas (login, mobile, pessoas, despesas, caixa, produtos). Testes que quebrarem por mudança de texto ou marcação devem ser atualizados para o novo texto; testes de regra de negócio não devem mudar. Observação: a máquina onde o desenho foi feito não tem Node instalado.
- Permissões continuam vindo de `permission.service.js` e do `permission` de cada item em `src/components/sidebar.component.js`.

## A linguagem visual

### Cores (modo claro)

| Uso | Valor |
|---|---|
| Fundo da área de trabalho | `#F1F3F7` |
| Cartões, menu, barra do topo, comanda | `#FFFFFF` |
| Texto principal | `#1C2331` |
| Texto secundário | `#6B7488` |
| Linhas e bordas | `#E0E4EB` (fraca: `#EBEEF3`) |
| Âmbar: ação principal, item selecionado | `#FFB547`, com texto `#1C2331` por cima |
| Âmbar suave: fundo do menu ativo, avisos | `#FFF1D6`, com texto `#8A5500` |
| Verde: entrada, ok, caixa aberto | `#17784A`, fundo suave `#E3F5EC` |
| Vermelho: saída, erro, vencido | `#B8392F`, fundo suave `#FBE9E7` |
| Categoria Lanches | `#F5A524` |
| Categoria Porções | `#F0663F` |
| Categoria Bebidas | `#22A3DB` |
| Categoria Combos | `#9A68EE` |

**Modo escuro**, igual à opção "B. Turno da noite" do primeiro arquivo de desenhos:

| Uso | Valor |
|---|---|
| Fundo | `#1C2331` |
| Cartões | `#242D3E` |
| Menu e comanda | `#161C28` |
| Texto | `#EDF0F5` |
| Texto secundário | `#8E99AE` |
| Linhas | `#2F3A4E` |
| Âmbar | `#FFB547` |
| Categorias | `#FFB547`, `#FF7A59`, `#4FC3F7`, `#B58CFF` |

**Tema padrão:** passa a ser o **claro**. Hoje `theme.service.js` usa `'dark'` quando nada foi salvo. Quem já escolheu um tema e salvou (`pdv.theme`) continua com a escolha. O tema continua sendo por aparelho, guardado no `localStorage`, e é trocado no menu do usuário.

**Categorias além das quatro de exemplo:** o cadastro permite criar categorias. Categorias novas recebem uma cor de uma paleta fixa em ordem; os valores exatos ficam a cargo de quem implementar. A cor precisa ser a mesma em todas as telas (frente de caixa, vitrine, produtos, relatórios, celular).

**Cores da empresa:** a tela Empresa já guarda três cores (`corPrimaria`, `corSecundaria`, `corDestaque` em `empresa-config.service.js`, localmente e na tabela `empresa_configuracoes`). O modelo de dados não muda.

- **Cor principal** substitui o âmbar (`#FFB547`).
- **Cor secundária** é o tom de quando o botão principal é pressionado ou está com o mouse em cima.
- **Cor de destaque** é o fundo suave do menu ativo e dos avisos (no lugar de `#FFF1D6`).
- **Valores padrão antigos** (`#ff6b1a`, `#e65b11`, `#fff0e6`) contam como "não personalizado", então essas instalações passam a usar as cores novas.
- **Os dois temas:** as cores da empresa valem no claro e no escuro.
- **Contraste:** o texto sobre a cor principal escolhe automaticamente escuro ou branco para manter contraste AA.

### Tipografia

- Fonte **Sora**, carregada do Google Fonts, com pesos 400, 500, 600 e 700. Fallback: `system-ui, sans-serif`.
- A fonte Inter declarada hoje sai.
- Tamanhos de base:
  - texto: 13,5 a 14 px;
  - títulos de tela: 19 a 21 px, peso 600;
  - valores de destaque: 22 a 28 px, peso 700.
- Rótulos em frase normal, sem CAIXA ALTA. Os títulos que hoje estão em maiúsculas (como "NENHUMA COMANDA FINALIZADA" e "IDENTIDADE VISUAL") passam para frase normal.

### Formas

| Elemento | Raio da borda |
|---|---|
| Cartões | 12 a 14 px |
| Botões e campos | 10 px |
| Etiquetas (pills) | totalmente arredondadas |

- Sombra só muito leve nos cartões de produto. Sem degradês.
- Produto na frente de caixa: cartão branco com uma faixa de 4 px na cor da categoria, do lado esquerdo.

### Componentes que se repetem

- **Menu lateral:** cerca de 84 px de largura, ícone em traço com o nome embaixo, item ativo com fundo âmbar suave.
  - Itens e permissões: os mesmos de `sidebar.component.js`.
  - Nomes novos: Vender, Vitrine, Histórico, Produtos, Pessoas, Caixa, Financeiro, Relatórios, App do dono, Empresa. "Suporte" fica no rodapé e "Sair" continua existindo.
  - Os títulos de grupo (Vendas, Gestão...) saem; a ordem dos itens continua a mesma.
- **Barra do topo, em toda tela do computador:**
  - Uma faixa única com os cinco números do caixa: Caixa atual, Vitrine estimada, Total vendido, Entradas e Saídas. Rótulo pequeno em cinza, valor em escuro; só Entradas em verde e Saídas em vermelho.
  - O indicador "Caixa aberto" (verde) ou "Caixa fechado" (âmbar).
  - O botão Fechar caixa / Abrir caixa. Abrir caixa aparece em verde.
  - O usuário com avatar. O menu do usuário reúne Modo claro/escuro, Atualizar e Sair.
- **Cabeçalho de tela:** título, uma linha explicando a tela e, à direita, os botões da tela (a ação principal em âmbar) ou a escolha de período.
- **Escolha de período:** botões encostados (Hoje, Ontem, Mês, Período...), com o ativo em escuro.
- **Cartões de número:** rótulo pequeno, valor grande e, opcionalmente, uma linha de detalhe.
- **Tabelas:** cabeçalho cinza pequeno, linhas finas e valores alinhados à direita.
- **Etiquetas de status:**
  - verde: Ativo, Pago, Finalizada;
  - âmbar: Pendente, poucas unidades;
  - vermelho: Vencida, Cancelada, Esgotado;
  - cinza: neutro.
- **Botões:**
  - principal: âmbar;
  - comum: branco com borda;
  - de perda ou saída: texto vermelho com borda clara, sem fundo vermelho;
  - fantasma: só texto.

## Tela por tela

### Frente de caixa

O desenho de referência é o B claro do primeiro arquivo.

**Barra do topo**

- A barra padrão descrita acima.

**Cabeçalho da tela**

- Título "Frente de caixa" e busca.
- Ao lado: **+ Entrada** e **− Saída**, os movimentos de caixa que hoje ficam na comanda (ver "Entrada e Saída de caixa").
- **Fechamento rápido**, que abre o modal que já existe, com a mesma permissão `cash.close`.
- E **Perda / Consumo**, que é a ação que já existe.
- Se faltar espaço na largura, a busca encolhe primeiro. Os botões não quebram linha.

**Área de produtos**

- Escolha de categoria.
- A faixa "Acesso rápido" sai. As abas Favoritos e Mais vendidos que já existem na escolha de categoria continuam.

**Cartões de produto (4 colunas)**

- Nome, estoque e preço.
- Um toque adiciona 1 unidade.
- Um toque longo (ou clique com o botão direito) abre a escolha de quantidade que hoje está no botão "Qtd".
- Os botões +2, +5 e Qtd saem do cartão.
- Item que já está na comanda: contorno âmbar e um círculo âmbar com a quantidade.
- Estoque baixo (3 ou menos): texto âmbar "3 restantes".
- Esgotado: cartão apagado, com o texto "Esgotado" no lugar do estoque. O selo vermelho sai.
- A regra atual de venda sem estoque continua como está. Hoje o PDV registra "vendido sem estoque". Se o cartão esgotado já bloqueia ou permite a venda, isso não muda, só a aparência.

**Comanda (à direita)**

- Título "Comanda N" e Limpar.
- Itens com nome, preço por unidade, − e + e total da linha.
- Total. O sistema não tem desconto hoje, então a linha e o botão Desconto do desenho não entram. Observação só entra se já existir.
- Um único botão principal, em âmbar: "Receber R$ 74,00".
- Os botões **+ Entrada** e **− Saída** saem da comanda. Ver a seção "Entrada e Saída de caixa" abaixo.
- O botão "L" de hoje limpa a comanda. Ele vira o "Limpar" no título da comanda, com a mesma confirmação de hoje, se houver.

**Caixa fechado**

- A área de venda fica apagada e não aceita cliques até o caixa ser aberto.

### Entrada e Saída de caixa

- São movimentos de caixa (`registerCashMovement`), com as permissões `cash.movement` e `cash.withdrawal`. Não confundir com a "+ Entrada" do Financeiro, que é um lançamento financeiro.
- O operador de caixa tem essas permissões, mas não acessa Histórico, Caixa nem Financeiro.
- **Decisão do dono:** os botões **+ Entrada** e **− Saída** saem da comanda e vão para o cabeçalho da frente de caixa, ao lado de Fechamento rápido e Perda / Consumo.
  - Visual: botões comuns. O "− Saída" leva texto vermelho, como o de perda.
  - Cada botão só aparece para quem tem a permissão de hoje.
  - Eles abrem os mesmos modais e fazem os mesmos movimentos de caixa de hoje.
- **Tela Caixa:** também ganha esses botões, para quem tem acesso a ela.

### Receber comanda

Janela clara por cima da frente de caixa, no lugar da janela preta atual.

- **Total a receber** em destaque.
- **Formas de pagamento** em 4 botões grandes com ícone: Dinheiro, Pix, Débito e Crédito. A selecionada fica em âmbar suave.
- **Dinheiro:**
  - campo "Valor recebido";
  - cédulas rápidas: **Exato**, mais três valores redondos acima do total (no desenho, para R$ 74: R$ 80, R$ 100 e R$ 200); a regra exata fica com quem implementar;
  - teclado numérico ao lado (1 a 9, 00, 0, apagar);
  - **Troco** grande, em verde.
- **Pix e cartão:** o teclado e as cédulas somem, e aparece um aviso curto para confirmar na maquininha ou no app do banco antes de finalizar. Isso substitui o parágrafo longo atual.
- **Ações:** Cancelar e **Finalizar venda** (âmbar).
- **Valor menor que o total:** o botão Finalizar fica desativado, com o aviso de quanto falta.
- O sistema não tem pagamento dividido hoje, e ele não é criado.

### Entrar (login)

- Duas colunas:
  - à esquerda, a marca, o nome da empresa (vindo de Empresa) e uma frase curta;
  - à direita, o formulário.
- Tudo em português: "Entrar no PDV", E-mail, Senha (com "Mostrar"), botão **Entrar** em âmbar e "Esqueceu a senha? Fale com o administrador."
- Os botões "Sign in with Google", "Remember me" e "Sign up" de hoje não fazem nada no código e saem da tela. O "Entrar com Google" do desenho só volta quando existir login com Google de verdade.
- O fluxo de autenticação não muda, só a tela.

### Vitrine

- **Cabeçalho:** "Vitrine", com a frase atual ("Registre o que foi produzido e enviado para a vitrine. Isso não mexe no caixa.") e a escolha de período.
- **Cartões de número:** Estoque atual, Vitrine estimada, Produzido hoje, Vendido hoje, Sobra estimada e Zerados. Os outros números que a tela tem hoje (Vendido sem estoque, Produtos diferentes, Vendido em comandas, Valor produzido) continuam, numa segunda linha ou dentro de um painel; a decisão de onde fica com quem implementar.
- **À esquerda:** o estoque da vitrine em duas colunas, com a faixa da categoria, o nome, a categoria e a quantidade ou etiqueta (Esgotado / N restantes), e o filtro de categoria.
- **À direita:** "Novo lançamento" (Produto, Quantidade, Valor unitário e o botão Lançar na vitrine em âmbar), além de "Produção e vendas hoje" em barras.
- A lista de lançamentos do período e o comparativo continuam, abaixo ou rolando.

### Histórico de transações

- **Cabeçalho e período:** Hoje, Ontem, Mês, Ano, Tudo.
- **Cartões:** Dinheiro, Pix, Débito, Crédito e Comandas canceladas. Os cinco números do caixa já estão na barra do topo e não se repetem aqui.
- **Tabela de comandas:** Hora, Comanda, Itens, Pagamento, Valor e Status.
- **Movimento do dinheiro** ao lado, com ponto colorido: verde para entrada, vermelho para saída e âmbar para perda. No rodapé ficam + Entrada e − Saída.
- "Limpar histórico" continua, como botão fantasma com confirmação, igual a hoje.

### Produtos

- **Cabeçalho:** Nova categoria (comum) e Novo produto (âmbar).
- **Categorias:** um cartão por categoria, com a borda esquerda na cor dela, o número de produtos e se aparece na vitrine. Editar e Apagar ficam no cartão.
- **Tabela de produtos:**
  - colunas: faixa da categoria e nome, categoria, preço, estoque (0 em vermelho), status (Ativo/Inativo), Vitrine (Aparece/Oculto) e Editar;
  - o Apagar fica dentro de Editar ou num menu da linha, com confirmação como hoje;
  - filtros: busca, categoria e status.

### Pessoas e permissões

- **Cabeçalho:** Histórico de ações (comum) e Novo usuário (âmbar).
- **Cartões:** Usuários, Ativos, Administradores, Operadores e Última atividade.
- **À esquerda:** a equipe, com avatar, nome, perfil e status. A pessoa escolhida fica destacada em âmbar suave.
- **À direita:** as permissões da pessoa escolhida, agrupadas como hoje (Vendas, Caixa, Vitrine, Gestão, Financeiro, Sistema), com uma marcação liga/desliga e o botão Salvar permissões.
- A auditoria (histórico de ações com filtros) continua. Ela abre pelo botão do cabeçalho ou fica abaixo, a critério de quem implementar.
- Editar e excluir usuário continuam como hoje.

### Caixa (hoje "Fechar Caixa / CRM")

- **Nome no menu:** "Caixa".
- **Cabeçalho:** o texto "Aberto às HH:MM por Fulano, com R$ X de troco inicial", a escolha de período de hoje e os botões + Entrada, − Saída e Perda / Consumo.
- **Período:** a escolha de período continua. A conferência do fechamento só aparece com "Hoje" selecionado, como hoje ("Selecione Hoje para fechar").
- **Cartões:** Total vendido, Ticket médio, Comandas fechadas, Entradas e Saídas.
- **Conferência do fechamento:**
  - tabela Forma / Esperado / Contado (campo) / Diferença, para Dinheiro, Pix, Débito e Crédito;
  - a Observação;
  - no rodapé, a **Diferença geral** (vermelha se faltar, verde se sobrar ou zerar) e o botão **Fechar caixa** (âmbar).
- **À direita:** formas de pagamento em barras e Mais vendidos.
- O resto que existe hoje (vendas por período, ranking por faturamento, movimentações financeiras e lista de fechamentos salvos) continua, rolando abaixo.

### Financeiro

- **Cabeçalho:** + Entrada, − Saída e + Boleto (âmbar).
- **Cartões:** Entradas do mês, Saídas do mês, Saldo, A pagar e Vencidas.
- **Tabela de movimentações:**
  - colunas: Data, Descrição, Tipo, Categoria, Valor (entrada com +, em verde) e Status em etiqueta;
  - filtro Todos / Entradas / Saídas / Boletos;
  - os filtros de período, categoria e status de hoje continuam.
- **Ao lado:**
  - Contas a pagar, com as vencidas primeiro e um ponto vermelho;
  - "Saídas por categoria" em barras.
- Os demais grupos do mini CRM financeiro (entradas por categoria, pendentes, gastos por forma de pagamento) continuam, rolando.

### Relatórios

- **Período e exportação:** Hoje, Ontem, 7 dias, Mês e Período, mais o botão Exportar. Se não existe exportação hoje, o botão não entra.
- **Cartões:** Total vendido, Entradas, Saídas, Caixa líquido, Ticket médio e Comandas.
- **Vendas por hora:** gráfico de barras, com o pico em âmbar.
- **Ao lado:** formas de pagamento e categorias (cada uma na sua cor).
- Produtos mais vendidos e movimentações recentes continuam, rolando.

### Empresa (hoje "Design de Layout")

- **Nome no menu:** "Empresa".
- **Três colunas:**
  - Logo e as três cores que já existem (principal, secundária, destaque). A escolha de tema do desenho não entra aqui: o tema é por aparelho e fica no menu do usuário;
  - Dados da empresa;
  - Prévia, com a marca, o botão Receber e um cartão de produto usando as cores escolhidas.
- **Cabeçalho:** Restaurar padrão (fantasma) e Salvar (âmbar).
- "Remover logo" continua.

### Suporte

- Não foi desenhada. Segue o padrão de cabeçalho, cartões e painéis das outras telas.

## App do dono no celular

- **Mesmo visual, em coluna única:**
  - topo branco com a marca, o título da aba, uma linha de contexto e o indicador "Ao vivo" em verde;
  - abas fixas embaixo, com ícone e nome: Início, Caixa, Vitrine, CRM e Financeiro.
- **Início:**
  - período;
  - cartão grande com o Total vendido e a comparação com o mesmo dia da semana anterior, se o dado existir; se não, sem comparação;
  - quatro números: Caixa atual, Vitrine, Entradas e Saídas;
  - "Acontecendo agora", o feed ao vivo de hoje com os filtros Tudo, Vendas, Entradas, Saídas e Alertas.
- **Caixa:** caixa atual e troco inicial, formas de pagamento em barras e movimentos.
- **Vitrine:** aviso âmbar com quantos produtos precisam de atenção, e a lista com a faixa da categoria e a quantidade ou etiqueta.
- **CRM:**
  - período;
  - Total vendido com comparação;
  - Ticket médio, Comandas, Entradas e Saídas;
  - Vendas por dia, com hoje em âmbar;
  - mais abaixo: Mais vendidos (barras na cor da categoria), Produção x vendido (%) e Destaques (mais vendido, menos vendido, maior categoria).
  - É o mesmo conteúdo de `renderCrmTab()` hoje, reorganizado.
- **Financeiro:** saldo do mês, contas a pagar (vencidas primeiro), saídas por categoria e o restante do mini CRM financeiro.
- **Botões do topo atual:** "Sair" e "Modo claro" saem do topo e vão para um menu no topo da tela ou na própria aba. Onde, fica com quem implementar.
- **Fechar:** a aba "OK Fechar" de hoje continua acessível, como um botão no topo ou como item do menu.

## Como fazer, em linhas gerais

- **Estilos:**
  - Criar uma base nova de estilos, com tokens de cor, tipografia e espaçamento em variáveis CSS em `:root` e `[data-theme="dark"]`, e os componentes acima.
  - Ela substitui `redesign.css` e as partes dos outros arquivos que ela cobre. Ao final, o que não é mais usado sai.
  - Como os arquivos vão se dividir fica com quem implementar.
- **Marcação:** os módulos em `src/modules/*` geram HTML em strings. A troca é na marcação e nas classes desses módulos, sem mexer nos serviços.
- **Ordem sugerida:**
  1. base e tokens, menu e barra do topo;
  2. frente de caixa e receber;
  3. caixa;
  4. as demais telas do computador;
  5. login;
  6. app do dono.

  Cada passo deve deixar o sistema usável.
- **Conferência:** abrir cada tela com dados locais fictícios, como foi feito para os desenhos (`dataProvider: 'local'`), nunca contra o Supabase de produção. Conferir os dois temas, a largura de celular das telas do dono, o foco visível no teclado e o contraste.

## Decisões deixadas para quem implementar

Estas são marcadas aqui para o dono conferir:

- Cores das categorias além das quatro de exemplo.
- Regra das cédulas rápidas no recebimento.
- Onde ficam os números extras da Vitrine.
- Onde ficam Sair, tema e Fechar no app do dono.
- Divisão dos novos arquivos de CSS.

## Decisões tomadas depois da revisão do documento

Estas foram decididas por mim (o assistente) depois de olhar o código. O dono deve conferir:

- O tema padrão passa a ser o claro, e o tema continua sendo por aparelho.
- As cores da empresa continuam sendo três (principal, secundária e destaque), e o laranja antigo conta como "não personalizado".
- Os botões de login que não funcionam (Google, Remember me, Sign up) saem.
- A tela Caixa mantém a escolha de período, e o fechamento só é feito em "Hoje".
- Desconto e pagamento dividido não existem hoje e não são criados. O "L" vira "Limpar".
