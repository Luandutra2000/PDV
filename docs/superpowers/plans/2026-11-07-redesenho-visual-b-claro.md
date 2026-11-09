# Redesenho visual B claro — plano de implementação

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para executar este plano tarefa por tarefa. Os passos usam caixas de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** aplicar a identidade "B claro" (e o modo escuro correspondente) em todas as telas do PDV e no app do dono, sem mudar regra de negócio.

**Arquitetura:**
- Uma base nova de estilos, com tokens em variáveis CSS e componentes reutilizáveis, substitui `redesign.css` e as camadas antigas.
- Os módulos em `src/modules/*` e os componentes em `src/components/*` trocam a marcação HTML (strings) para usar essa base. Os serviços não mudam.
- A lógica nova é pouca e fica em funções puras testáveis:
  - cores de categoria;
  - cores da empresa;
  - cédulas rápidas e teclado do recebimento;
  - tema padrão.

**Tecnologia:** JavaScript puro com módulos ES (sem build), CSS com variáveis, testes `.test.mjs` com `assert` próprio rodados por `npm test` (Node 20 ou mais), PWA com `service-worker.js`.

**Spec:** `docs/superpowers/specs/2026-11-07-redesenho-visual-b-claro-design.md`. Os desenhos de referência estão em `docs/superpowers/specs/mockups/`. Leia os dois antes de cada tarefa. Quando o texto e o desenho divergirem, vale o texto da spec, que já incorpora as decisões posteriores aos desenhos.

## Restrições gerais

- **Tokens claros:**

  | Token | Valor |
  |---|---|
  | `--bg` | `#F1F3F7` |
  | `--card` | `#FFFFFF` |
  | `--ink` | `#1C2331` |
  | `--muted` | `#6B7488` |
  | `--line` | `#E0E4EB` |
  | `--line-soft` | `#EBEEF3` |
  | `--accent` | `#FFB547` |
  | `--accent-soft` | `#FFF1D6` |
  | `--accent-ink-soft` | `#8A5500` |
  | `--green` | `#17784A` |
  | `--green-soft` | `#E3F5EC` |
  | `--red` | `#B8392F` |
  | `--red-soft` | `#FBE9E7` |

- **Tokens escuros**, sob `[data-theme="dark"]`:

  | Token | Valor |
  |---|---|
  | `--bg` | `#1C2331` |
  | `--card` | `#242D3E` |
  | `--rail` | `#161C28` |
  | `--ink` | `#EDF0F5` |
  | `--muted` | `#8E99AE` |
  | `--line` | `#2F3A4E` |
  | `--accent` | `#FFB547` |

- **Categorias:**
  - claro: lanches `#F5A524`, porções `#F0663F`, bebidas `#22A3DB`, combos `#9A68EE`;
  - escuro: `#FFB547`, `#FF7A59`, `#4FC3F7`, `#B58CFF`.
- **Fonte:** Sora 400/500/600/700 do Google Fonts, com fallback `system-ui, sans-serif`. A Inter sai.
- **Texto:** sem CAIXA ALTA em rótulos; tudo em português.
- **Formas:** raio de 12 a 14 px em cartões e de 10 px em botões e campos; nenhum degradê.
- **Tema:** o padrão é o claro, guardado por aparelho em `localStorage['pdv.theme']`. Escolha salva é respeitada.
- **Cores da empresa:** `corPrimaria` vira `--accent`, `corSecundaria` vira `--accent-strong` e `corDestaque` vira `--accent-soft`. Os valores antigos `#ff6b1a`, `#e65b11` e `#fff0e6` contam como não personalizados. O texto sobre o `--accent` é escuro ou branco, o que der contraste AA.
- **Proibido mexer** em serviços de dados, provedores, sincronização, Supabase e regras de permissão. Toda ação de hoje continua acessível, com a mesma permissão.
- **Cache:** a cada arquivo alterado, atualize o `?v=` dos imports e links que o carregam, seguindo o padrão do projeto. Na tarefa final, `CACHE_NAME` em `service-worker.js` passa de `'pdv-v85'` para `'pdv-v86'`.
- **Testes:** os que conferem texto ou marcação antiga são atualizados para o novo texto. Os testes de regra de negócio não mudam.
- **Conferência visual:** sempre com `dataProvider: 'local'` e dados fictícios (ver `docs/LOCAL_SETUP.md`), nunca contra o Supabase de produção. Confira os dois temas.

## Ambiente

- A máquina onde a spec foi feita **não tem Node**. Para rodar `npm test`, instale o Node 20 ou mais, ou rode em outra máquina. Sem Node, registre que os testes não rodaram em vez de dizer que passaram.
- A pasta pode não estar em git. Se não estiver, os passos "Commit" viram "anote os arquivos alterados na tarefa". Não rode `git init` sem pedir ao dono.

## Pontos de atenção na revisão

1. **Operador de caixa (perfil `operador`)** tem `cash.movement`, `cash.withdrawal` e `stock.writeoff`, mas não tem `cash.close` nem `reports.view`. Ele precisa continuar vendo + Entrada, − Saída e Perda / Consumo na frente de caixa, e não vê Fechamento rápido. *Teste na Tarefa 5.*
2. **Caixa fechado:** a grade e a comanda ficam apagadas e não aceitam clique, e o aviso continua. *Teste na Tarefa 5.*
3. **Valor recebido menor que o total, em dinheiro:** Finalizar desativado e o texto "Faltam R$ X". Valor vazio ou com vírgula ("100,50") é lido corretamente. *Teste na Tarefa 6.*
4. **Cor da empresa clara demais** (ex.: `#FFFFFF`) ou escura demais: o texto do botão principal continua legível. *Teste na Tarefa 1.*
5. **Categoria criada pelo usuário** (fora das quatro): recebe uma cor estável, a mesma na frente de caixa, nos produtos, na vitrine e no celular. *Teste na Tarefa 3.*

---

### Tarefa 1: Tokens, fonte, tema padrão e cores da empresa

**Arquivos:**
- Criar: `src/styles/tokens.css`, `src/styles/components.css`
- Alterar: `index.html` (links de CSS e fonte), `src/services/theme.service.js`, `src/services/empresa-config.service.js`
- Teste: `tests/theme-service.test.mjs` (novo), `tests/company-brand-colors.test.mjs` (novo)

**Interfaces:**
- Produz:
  - Em `tokens.css`, os tokens das Restrições gerais e mais `--accent-strong`, `--accent-ink`, `--rail`, `--cat-lanches`, `--cat-porcoes`, `--cat-bebidas`, `--cat-combos`, `--cat-extra-1` a `--cat-extra-4`, `--radius-card: 14px`, `--radius-control: 10px` e `--font: "Sora", system-ui, sans-serif`. Os valores escuros ficam em `[data-theme="dark"]`.
  - Em `components.css`, as classes reutilizáveis usadas por todas as tarefas seguintes:
    - `.ui-btn` e variantes `--primary`, `--ok`, `--loss`, `--ghost`, `--sm`;
    - `.ui-seg` (com `.is-on`);
    - `.ui-stats`, `.ui-stat`;
    - `.ui-panel`, `.ui-head` (título, linha e `.ui-head__actions`);
    - `.ui-table`;
    - `.ui-pill` e variantes `--ok`, `--warn`, `--danger`;
    - `.ui-field`, `.ui-input`;
    - `.ui-bars` / `.ui-bar-row`;
    - `.ui-stripe` (que usa `--c`).
  - Valores visuais exatos: o arquivo `docs/superpowers/specs/mockups/2026-11-07-telas-b-claro.html`, classes `.btn`, `.seg`, `.stat`, `.panel` etc. O prefixo `ui-` evita colisão com o CSS antigo enquanto ele existir.
  - `theme.service.js`: o padrão passa a ser `'light'` em `initTheme`, `toggleTheme` e `getThemeLabel`.
  - `empresa-config.service.js`:
    - `export function resolveBrandColors(settings) -> { accent, accentStrong, accentSoft, accentInk }`;
    - `export function pickReadableInk(hex) -> '#1C2331' | '#FFFFFF'`;
    - `applyCompanyIdentity` passa a definir `--accent`, `--accent-strong`, `--accent-soft` e `--accent-ink` e continua definindo as variáveis antigas enquanto o CSS antigo existir.

- [ ] **Passo 1: Escrever os testes que falham.** `tests/theme-service.test.mjs`, com `localStorage` falso como em `tests/login-module.test.mjs` e `globalThis.document = { documentElement: { dataset: {} } }`:
  - sem nada salvo, `initTheme()` retorna `'light'` e `document.documentElement.dataset.theme === 'light'`;
  - com `localStorage['pdv.theme'] = 'dark'`, `initTheme()` retorna `'dark'`;
  - `getThemeLabel()` com o tema claro retorna `'Modo escuro'`.

  `tests/company-brand-colors.test.mjs`:
  - `resolveBrandColors({ corPrimaria: '#ff6b1a', corSecundaria: '#e65b11', corDestaque: '#fff0e6' })` retorna `accent === '#FFB547'` e `accentSoft === '#FFF1D6'`;
  - `resolveBrandColors({ corPrimaria: '#0055aa', corSecundaria: '#003377', corDestaque: '#e6f0ff' }).accent === '#0055aa'`;
  - `pickReadableInk('#FFB547') === '#1C2331'`;
  - `pickReadableInk('#0055aa') === '#FFFFFF'`;
  - `pickReadableInk('#FFFFFF') === '#1C2331'`.

- [ ] **Passo 2: Rodar e ver falhar.** Execute `node tests/theme-service.test.mjs` e `node tests/company-brand-colors.test.mjs`. Esperado: erro (padrão `'dark'`, ou função inexistente).

- [ ] **Passo 3: Implementar.**
  - `resolveBrandColors` compara cada cor, sem diferenciar maiúsculas, com o padrão antigo. Se for igual, usa o token novo correspondente; `accentStrong` padrão é `#F0A030`.
  - `pickReadableInk` usa a luminância relativa do WCAG e escolhe o texto com o maior contraste.
  - Os padrões em `DEFAULT_COMPANY_SETTINGS` passam a ser `#FFB547`, `#F0A030` e `#FFF1D6`.
  - Em `index.html`:
    - adicionar o `<link>` do Google Fonts para Sora (com `preconnect`);
    - carregar `tokens.css` e `components.css` **depois** de `redesign.css`, para que valham sobre ele durante a transição;
    - o `body` passa a usar `font-family: var(--font)` e `background: var(--bg)`.

- [ ] **Passo 4: Rodar e ver passar.** Os dois testes novos e `npm test` completo. Esperado: tudo passa.

- [ ] **Passo 5: Conferir.** Abra o app local e confira que a fonte é a Sora (DevTools → Computed) e que, sem `pdv.theme` salvo, o tema é o claro.

- [ ] **Passo 6: Commit.** `feat(visual): tokens B claro, fonte Sora, tema claro padrão e cores da empresa`.

### Tarefa 2: Ícones, menu lateral e barra do topo

**Arquivos:**
- Criar: `src/components/icons.js`, `src/components/topbar.component.js`
- Alterar: `src/components/sidebar.component.js`, `src/app.js` (montagem do shell, `renderCashStrip`, `renderCashSessionIndicator`), `src/styles/components.css` (rail e topo)
- Teste: `tests/shell-components.test.mjs` (novo)

**Interfaces:**
- Consome: as classes `ui-*` e os tokens da Tarefa 1.
- Produz:
  - `export function icon(name: string) -> string`, que devolve um SVG inline em traço, com `aria-hidden="true"`. Nomes: `sell, store, hist, box, people, cash, wallet, chart, phone, gear, help, home, pix, card, search, crm, logout`. Os traços estão no objeto `P` do arquivo de mockup.
  - `export function renderCashKpis(resumo: { caixaAtual, vitrineEstimada, totalVendido, entradas, saidas }) -> string`: os cinco `.ui-kpi`, sendo Entradas com `.is-plus` e Saídas com `.is-minus`.
  - `export function renderCashSessionStatus(status: { open: boolean }) -> string`, com o indicador e o botão:
    - aberto: "Caixa aberto" e "Fechar caixa" com `data-action="go-to-cash-closing"`;
    - fechado: "Caixa fechado" e "Abrir caixa" (`.ui-btn--ok`) com `data-action="open-cash-session"`.
  - `export function renderUserMenu(currentUser, themeLabel: string) -> string`: o avatar com a inicial e o nome; um menu (`<details>`) com o rótulo do tema (`data-action="toggle-theme"`), "Atualizar" (`data-action="refresh"`) e "Sair" (`data-action="logout"`).
  - O menu lateral mantém `data-menu-id`, a ordem e as permissões de `menuGroups`. Os títulos de grupo saem.
    - Rótulos: frente-caixa "Vender", estoque "Vitrine", dashboard "Histórico", produtos "Produtos", pessoas "Pessoas", fechar-caixa "Caixa", despesas "Financeiro", relatorios "Relatórios", mobile "App do dono", empresa-config "Empresa", suporte "Suporte" (no rodapé).
    - Ícones, na mesma ordem: `sell, store, hist, box, people, cash, wallet, chart, phone, gear, help`.
  - O botão "App do Dono" da barra do topo sai: já existe no menu, com a mesma permissão.

- [ ] **Passo 1: Escrever o teste que falha.** `tests/shell-components.test.mjs`:
  - `renderSidebar(adminUser)` contém `data-menu-id="fechar-caixa"` e o texto `Caixa`, e não contém `Fechar Caixa / CRM` nem `sidebar__title`;
  - para um usuário `operador`, não contém `data-menu-id="despesas"`;
  - `renderCashKpis({ caixaAtual: 332, vitrineEstimada: 1486, totalVendido: 212, entradas: 50, saidas: 30 })` contém `R$ 1.486,00` e `is-minus`;
  - `renderCashSessionStatus({ open: false })` contém `Abrir caixa` e `data-action="open-cash-session"`;
  - `renderUserMenu({ name: 'Luan' }, 'Modo escuro')` contém `data-action="toggle-theme"` e `data-action="logout"`.

  Para montar usuários, use o fixture de `tests/test-auth-fixture.mjs`.

- [ ] **Passo 2: Rodar e ver falhar.** `node tests/shell-components.test.mjs`. Esperado: erro de import.

- [ ] **Passo 3: Implementar.**
  - Os componentes acima.
  - `app.js` monta a barra do topo com `renderCashKpis`, `renderCashSessionStatus` e `renderUserMenu`.
  - Os handlers existentes (`toggle-theme`, `refresh`, `logout`, `open-mobile`) continuam funcionando pelos mesmos `data-action`.
  - O fundo de bolhas (`renderBubbleBackground`) sai do shell.

- [ ] **Passo 4: Rodar.** `npm test`. Atualize os testes que conferem a marcação antiga do shell, se houver (ex.: `tests/security-resilience-load.test.mjs`).

- [ ] **Passo 5: Conferir.** No app local, os itens do menu batem com as permissões de admin e de operador. O tema troca pelo menu do usuário. Abrir caixa e Fechar caixa funcionam.

- [ ] **Passo 6: Commit.** `feat(visual): menu lateral com ícones e barra do topo B claro`.

### Tarefa 3: Cores de categoria

**Arquivos:**
- Criar: `src/utils/category-colors.js`
- Teste: `tests/category-colors.test.mjs` (novo)

**Interfaces:**
- Produz: `export function getCategoryColorVar(category: { id, name }, allCategories: Array<{ id, name }>) -> string`.
  - Devolve `'var(--cat-lanches)'`, `'var(--cat-porcoes)'`, `'var(--cat-bebidas)'` ou `'var(--cat-combos)'` quando o `id` ou o nome normalizado (minúsculas, sem acento) for lanches, porções, bebidas ou combos.
  - Para outras categorias, devolve `'var(--cat-extra-N)'`, com N de 1 a 4. N é a posição da categoria entre as não fixas, ordenadas por `id`, módulo 4, mais 1.
  - Categorias internas que começam com `__` (favoritos, mais vendidos) devolvem `'var(--muted)'`.

- [ ] **Passo 1: Escrever o teste que falha.**
  - `getCategoryColorVar({ id: 'porcoes', name: 'Porções' }, list) === 'var(--cat-porcoes)'`;
  - `getCategoryColorVar({ id: 'x1', name: 'Porções' }, list) === 'var(--cat-porcoes)'`, ou seja, identifica pelo nome;
  - duas chamadas para uma categoria `{ id: 'sobremesas' }` devolvem o mesmo valor, que começa com `var(--cat-extra-`;
  - `{ id: '__favoritos' }` devolve `'var(--muted)'`.
- [ ] **Passo 2: Rodar e ver falhar.** `node tests/category-colors.test.mjs`.
- [ ] **Passo 3: Implementar.** Defina os valores de `--cat-extra-1` a `--cat-extra-4` em `tokens.css`, claros e escuros, escolhidos para se distinguirem das quatro cores fixas (sugestão: verde-água, rosa, oliva e azul-ardósia).
- [ ] **Passo 4: Rodar e ver passar.**
- [ ] **Passo 5: Commit.** `feat(visual): cor estável por categoria`.

### Tarefa 4: Modais de Entrada, Saída e Perda reutilizáveis

Hoje esses modais e o envio deles vivem dentro de `vendas.module.js`. As Tarefas 5 e 8 precisam deles na frente de caixa e na tela Caixa. Esta tarefa só os extrai, sem mudança visual.

**Arquivos:**
- Criar: `src/components/cash-actions.component.js`
- Alterar: `src/modules/vendas/vendas.module.js` (usar o componente)
- Teste: `tests/cash-actions-component.test.mjs` (novo)

**Interfaces:**
- Produz:
  - `export function renderCashMovementModal(type: 'entrada' | 'saida') -> string`, com a mesma marcação de hoje;
  - `export function renderWriteOffModal() -> string`, com a mesma assinatura e a mesma marcação de hoje (lê produtos e estado do jeito que a função atual já lê);
  - `export function renderCashActionButtons(currentUser, { includeQuickClosing: boolean }) -> string`, com os botões em ordem e cada um só com a permissão de hoje:
    - "+ Entrada" (`data-action="open-entry"`, `cash.movement`);
    - "− Saída" (`data-action="open-output"`, `cash.withdrawal`, `.ui-btn--loss`);
    - "Fechamento rápido" (`data-action="open-quick-closing"`, `cash.close`, só com `includeQuickClosing`);
    - "Perda / Consumo" (`data-action="open-write-off"`, `stock.writeoff`, `.ui-btn--loss`);
  - `export async function submitCashMovementForm(formData) -> Promise<void>` e `export async function submitWriteOffForm(formData) -> Promise<void>`, com o corpo exato dos handlers de submit atuais em `vendas.module.js` (`registerCashMovement` e a baixa de estoque), incluindo os toasts.

- [ ] **Passo 1: Escrever o teste que falha.**
  - `renderCashActionButtons(operadorUser, { includeQuickClosing: true })` contém `open-entry`, `open-output` e `open-write-off`, e não contém `open-quick-closing`;
  - com `adminUser`, contém os quatro;
  - `renderCashMovementModal('saida')` contém `Registrar saída` e `name="description"`.
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Implementar.** Mova o código e faça `vendas.module.js` importar do componente. `gateOrderPanelActions` perde as substituições de Entrada e Saída quando a Tarefa 5 tirar esses botões da comanda; até lá, continua igual.
- [ ] **Passo 4: Rodar.** `npm test`, tudo passando, incluindo os testes atuais de caixa e vendas.
- [ ] **Passo 5: Commit.** `refactor: extrai modais de entrada, saída e perda para componente`.

### Tarefa 5: Frente de caixa

**Arquivos:**
- Alterar: `src/components/product-card.component.js`, `src/components/order-panel.component.js`, `src/modules/vendas/vendas.module.js` (`renderScreen`, `renderQuickAccess`, `gateOrderPanelActions`, eventos), `src/styles/components.css` (ou `src/styles/pdv-b.css` novo, carregado depois de `components.css`)
- Teste: `tests/frente-caixa-markup.test.mjs` (novo)

**Interfaces:**
- Consome: `getCategoryColorVar` (Tarefa 3), `renderCashActionButtons` (Tarefa 4), `icon` (Tarefa 2).
- Produz:
  - `renderProductCard(product, categoryName = '', { colorVar = 'var(--muted)', quantityInOrder = 0 } = {})`. É um único botão `data-action="add-product"`, com `style="--c: <colorVar>"`, nome, estoque e preço, e:
    - estoque de 1 a 3: `<span class="… is-low">N restantes</span>`;
    - estoque 0 ou menos: classe `is-out` e o texto `Esgotado`, sem selo vermelho;
    - `quantityInOrder > 0`: classe `is-in` e o círculo com a quantidade;
    - sem os botões `quick-add` e `Qtd`.
  - `renderOrderPanel(comanda)`:
    - título `Comanda` mais ` ${comanda.number}`, se existir;
    - o botão "Limpar" (`data-action="clear-order"`) no título;
    - os itens com −, + e remover;
    - a linha `Total`;
    - um único botão principal `Receber R$ X` (`data-action="open-payment"`, `.ui-btn--primary`);
    - sem `open-entry` e `open-output`.
  - Toque longo: no `pointerdown` de `[data-action="add-product"]`, um temporizador de 500 ms. Se ele disparar, cancela a adição e abre o modal de quantidade existente (o mesmo de `data-action="open-quantity"`). O `contextmenu` faz o mesmo.
  - Cabeçalho: título "Frente de caixa", busca e `renderCashActionButtons(user, { includeQuickClosing: true })`. Com o caixa fechado, a seção recebe a classe `is-cash-closed`, que apaga a área e bloqueia cliques (`pointer-events: none`) na grade e na comanda. O aviso atual continua.
  - A faixa `renderQuickAccess` sai. As abas Favoritos e Mais vendidos continuam na escolha de categoria.

- [ ] **Passo 1: Escrever o teste que falha.** `tests/frente-caixa-markup.test.mjs`:
  - `renderProductCard({ id: 'p1', name: 'Suco', price: 8, showcaseStock: 3 }, 'Bebidas', { colorVar: 'var(--cat-bebidas)' })` contém `3 restantes` e `--cat-bebidas`, e não contém `quick-add`;
  - com `showcaseStock: 0`, contém `is-out` e `Esgotado`, e não contém `Sem estoque`;
  - com `quantityInOrder: 2`, contém `is-in`;
  - `renderOrderPanel({ items: [{ productId: 'p1', name: 'Suco', unitPrice: 8, quantity: 2, total: 16 }] })` contém `Receber R$ 16,00` e `clear-order`, e não contém `open-entry` nem `open-output`.
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Implementar** cartão, comanda, cabeçalho, toque longo e caixa fechado. Siga o desenho "B. Turno da noite, versão clara" do arquivo de opções.
- [ ] **Passo 4: Rodar.** `npm test`, atualizando os testes que conferiam a marcação antiga do cartão e da comanda.
- [ ] **Passo 5: Conferir no app local.**
  - Como admin e como operador, os botões do cabeçalho seguem as permissões (Ponto de atenção 1).
  - Toque simples adiciona 1; toque longo abre a quantidade.
  - Com o caixa fechado, nada é clicável na grade (Ponto de atenção 2).
  - Os dois temas.
- [ ] **Passo 6: Commit.** `feat(visual): frente de caixa B claro`.

### Tarefa 6: Receber comanda

**Arquivos:**
- Criar: `src/utils/payment-keypad.js`
- Alterar: `src/modules/vendas/vendas.module.js` (`renderPaymentModal`, `renderPaymentChange`, eventos do modal)
- Teste: `tests/payment-keypad.test.mjs` (novo)

**Interfaces:**
- Produz:
  - `export function getQuickCashOptions(total: number) -> number[]`. Devolve três valores maiores que `total`, em ordem crescente e sem repetição: o próximo múltiplo de 10, o próximo de 50 e o próximo de 100. Quando dois coincidem, o seguinte é o próximo múltiplo de 100 ainda não usado. Para 74: `[80, 100, 200]`. Para 100: `[110, 150, 200]`.
  - `export function applyKeypadKey(current: string, key: '0'..'9' | '00' | 'back') -> string`. Edita o texto do valor em reais, sem centavos implícitos: `'10' + '0' → '100'`, `'100' + 'back' → '10'`, `'' + '00' → ''` (não começa com zero).
  - `export function parseReceivedAmount(text: string) -> number`. Aceita `'100'`, `'100,50'` e `'100.50'`; vazio vira `0`.
  - O modal tem:
    - quatro botões de forma de pagamento, com o mesmo `name="paymentMethod"` e os mesmos valores (`dinheiro`, `debito`, `credito`, `pix`), para não mudar o envio;
    - em dinheiro, o campo `receivedAmount`, os botões "Exato" e de `getQuickCashOptions`, o teclado (1 a 9, 00, 0, apagar) e o "Troco" em verde;
    - em Pix ou cartão, o texto "Confirme o pagamento na maquininha ou no app do banco antes de finalizar.";
    - se o valor recebido em dinheiro for menor que o total, o botão "Finalizar venda" fica `disabled` e aparece "Faltam R$ X".

- [ ] **Passo 1: Escrever o teste que falha.**
  - `getQuickCashOptions(74)` deep-equals `[80, 100, 200]`;
  - `getQuickCashOptions(100)` deep-equals `[110, 150, 200]`;
  - `applyKeypadKey('10', '0') === '100'`;
  - `applyKeypadKey('100', 'back') === '10'`;
  - `applyKeypadKey('', '00') === ''`;
  - `parseReceivedAmount('100,50') === 100.5`;
  - `parseReceivedAmount('') === 0`.
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Implementar** as funções e o novo modal. O envio continua pelo mesmo handler de `[data-payment-form]`, lendo `receivedAmount` com `parseReceivedAmount`.
- [ ] **Passo 4: Rodar.** `npm test`.
- [ ] **Passo 5: Conferir no app local.**
  - Venda em dinheiro de R$ 74 com R$ 100 mostra troco R$ 26,00 e finaliza.
  - Com R$ 50, mostra "Faltam R$ 24,00" e o botão fica desativado (Ponto de atenção 3).
  - Pix finaliza sem teclado.
- [ ] **Passo 6: Commit.** `feat(visual): recebimento com cédulas rápidas e teclado`.

### Tarefa 7: Tela de entrar

**Arquivos:**
- Alterar: `src/modules/auth/login.module.js` e o CSS de login (em `src/styles/components.css` ou num arquivo novo `src/styles/login-b.css`)
- Teste: `tests/login-module.test.mjs` (atualizar)

**Interfaces:**
- Mantém: `[data-login-form]`, `[data-login-error]`, o botão `type="submit"` e os `name` dos campos. O teste atual depende deles.
- Muda:
  - textos: "Entrar no PDV", "E-mail", "Senha", "Mostrar", "Entrar" e "Esqueceu a senha? Fale com o administrador.";
  - a coluna da marca usa `nomeFantasia` e o logo de `loadCompanySettingsLocal()`;
  - saem "Welcome Back", "Sign in…", "Remember me", "Sign in with Google" e "Sign up".

- [ ] **Passo 1: Atualizar o teste.** Ele deve afirmar que o HTML renderizado contém `Entrar no PDV` e não contém `Sign in with Google`, `Remember me` nem `Welcome Back`.
- [ ] **Passo 2: Rodar e ver falhar.** `node tests/login-module.test.mjs`.
- [ ] **Passo 3: Implementar,** seguindo a seção "Entrar" do arquivo de telas.
- [ ] **Passo 4: Rodar e ver passar.** Teste do login e `npm test`.
- [ ] **Passo 5: Commit.** `feat(visual): tela de entrar em português no estilo B claro`.

### Tarefas 8 a 14: telas de gestão

Todas seguem o mesmo molde:
- trocar a marcação do módulo para `ui-head`, `ui-seg`, `ui-stats`, `ui-panel`, `ui-table` e `ui-pill`, conforme a seção da tela na spec e no arquivo de telas;
- manter todos os `data-action`, `name` e `data-*` que os handlers e testes usam;
- não mudar cálculos;
- cada tarefa é um commit e passa por revisão separada.

Em cada uma:
- **Passo 1:** no teste existente do módulo (ou num novo `tests/<modulo>-markup.test.mjs`, se não houver), afirmar que a marcação contém o título novo e `ui-head`, e não contém os títulos em CAIXA ALTA de hoje.
- **Passo 2:** rodar e ver falhar.
- **Passo 3:** implementar.
- **Passo 4:** `npm test`.
- **Passo 5:** conferir os dois temas no app local.
- **Passo 6:** commit `feat(visual): <tela> B claro`.

**Tarefa 8: Caixa.** `src/modules/caixa/caixa.module.js`, teste `tests/caixa-module.test.mjs`.
- Título "Caixa".
- Linha "Aberto às HH:MM por Nome, com R$ X de troco inicial", lida da sessão de caixa aberta (`cash-session.service.js`). Com o caixa fechado: "Caixa fechado".
- Escolha de período, como hoje.
- `renderCashActionButtons(user, { includeQuickClosing: false })`.
- Conferência em `ui-table`: Forma / Esperado / Contado / Diferença. A diferença negativa usa `--red` e a zero ou positiva usa `--green`.
- Diferença geral e "Fechar caixa" em `ui-btn--primary`, só com "Hoje" selecionado, mantendo o texto "Selecione Hoje para fechar" nos outros períodos.
- O resto da tela atual continua, rolando.
- O teste afirma `Aberto às` com uma sessão de exemplo e `Fechar caixa` com o período `today`.

**Tarefa 9: Histórico de transações.** `src/modules/dashboard/dashboard.module.js`.
- Os cartões repetidos da barra do topo saem: ficam Dinheiro, Pix, Débito, Crédito e Canceladas.
- Tabela de comandas com etiqueta Finalizada ou Cancelada.
- Movimento do dinheiro com ponto colorido: verde entrada, vermelho saída, âmbar perda.
- + Entrada e − Saída via `renderCashActionButtons`.
- "Limpar histórico" como `ui-btn--ghost`, com a mesma confirmação.

**Tarefa 10: Vitrine.** `src/modules/estoque/estoque.module.js`.
- Lista de estoque em duas colunas com `ui-stripe` (de `getCategoryColorVar`).
- Etiqueta "Esgotado" (`--danger`) ou "N restantes" (`--warn`, quando 3 ou menos).
- Painel "Novo lançamento" à direita.
- Números extras numa segunda linha de `ui-stats`.

**Tarefa 11: Produtos.** `src/modules/produtos/produtos.module.js`, teste `tests/produtos-live-stock.test.mjs`.
- Um cartão por categoria, com borda na cor da categoria.
- Tabela com `ui-stripe`, estoque 0 em `--red` e etiquetas Ativo/Inativo e Aparece/Oculto.
- "Apagar" dentro do menu da linha, com a mesma confirmação.

**Tarefa 12: Pessoas.** `src/modules/pessoas/pessoas.module.js`, teste `tests/pessoas-module.test.mjs`.
- Equipe à esquerda, com a pessoa selecionada em `--accent-soft`.
- Permissões agrupadas em marcadores liga/desliga que mantêm os mesmos `name` e `data-*`.
- Auditoria acessível pelo botão "Histórico de ações".

**Tarefa 13: Financeiro.** `src/modules/despesas/despesas.module.js`, teste `tests/despesas-module.test.mjs`.
- Tabela de movimentações com valor com sinal e cor e etiqueta Pago (`--ok`), Pendente (`--warn`) ou Vencida (`--danger`).
- Contas a pagar com as vencidas primeiro.
- O mini CRM financeiro em `ui-bars`.

**Tarefa 14: Relatórios, Empresa e Suporte.**
- **Relatórios** (`relatorios.module.js`): gráfico de vendas por hora em barras CSS, com o maior valor em `--accent`.
- **Empresa** (`empresa-config.module.js` e `empresa-config.css`):
  - três colunas: logo e as três cores, dados, prévia;
  - a prévia aplica `resolveBrandColors` ao vivo;
  - sem escolha de tema;
  - o título "Configurações da Empresa" vira "Empresa".
- **Suporte** (`sync-app.module.js` ou o módulo da rota `suporte`): só cabeçalho, painéis e botões no padrão.

### Tarefa 15: App do dono no celular

**Arquivos:**
- Alterar: `src/modules/mobile/mobile-dashboard.module.js`, `src/styles/mobile.css`
- Teste: `tests/mobile-dashboard-module.test.mjs` (atualizar)

**Interfaces:**
- Consome: `icon` e `getCategoryColorVar`.
- Muda:
  - topo branco com a marca, o título da aba, a linha de contexto e o indicador "Ao vivo";
  - um menu no topo (`<details>`) com o tema, "Fechar" e "Sair", usando os mesmos `data-action` de hoje;
  - abas embaixo com `icon('home' | 'cash' | 'store' | 'crm' | 'wallet')` e os nomes Início, Caixa, Vitrine, CRM e Financeiro, sem siglas;
  - cada aba reorganizada conforme a seção "App do dono" da spec;
  - CRM: "Vendas por dia", com o dia atual em `--accent`, e "Mais vendidos" com barras em `getCategoryColorVar`;
  - comparação com a semana anterior só se o dado existir.

- [ ] **Passo 1: Atualizar o teste.** A marcação das abas contém `Início` e `Financeiro` e não contém `>IN<` nem `>FN<`. A aba CRM contém `Vendas por dia`.
- [ ] **Passo 2: Rodar e ver falhar.**
- [ ] **Passo 3: Implementar.**
- [ ] **Passo 4: Rodar.** `npm test`.
- [ ] **Passo 5: Conferir** com a janela em 375 px de largura, nos dois temas.
- [ ] **Passo 6: Commit.** `feat(visual): app do dono B claro`.

### Tarefa 16: Limpeza do CSS antigo e publicação

**Arquivos:**
- Alterar: `index.html`, `service-worker.js`, `src/styles/*.css`
- Remover: `src/styles/redesign.css` e as regras sem uso nos arquivos antigos

**Passos:**
- [ ] **Passo 1: Remover.** Tire o link de `redesign.css` e confira cada tela nos dois temas. O que quebrar é corrigido na base nova (`tokens.css`, `components.css` e os CSS por tela criados nas tarefas), nunca voltando `redesign.css`.
- [ ] **Passo 2: Varrer o CSS restante.** Em `layout.css`, `sidebar.css`, `buttons.css`, `cards.css`, `modal.css`, `forms.css`, `pdv.css`, `mobile.css` e `empresa-config.css`, procure classes que nenhum arquivo `src/**/*.js` gera mais e apague essas regras. Apague também os degradês e as variáveis antigas (`--color-primary`, `--crm-orange`…) que ninguém mais lê, e tire de `applyCompanyIdentity` as variáveis antigas.
- [ ] **Passo 3: Publicação.** `CACHE_NAME = 'pdv-v86'` em `service-worker.js`. Atualize os `?v=` de todos os CSS e JS alterados e confira se a lista de pré-cache do service worker inclui os CSS novos.
- [ ] **Passo 4: Testes.** `npm test` completo, tudo passando. Com `npm run test:startup` passando, o grafo de módulos carrega.
- [ ] **Passo 5: Volta final no app local.**
  - Admin e operador, os dois temas.
  - Venda completa em dinheiro e em Pix.
  - Abrir e fechar caixa.
  - Entrada, Saída e Perda pela frente de caixa.
  - Celular em 375 px.
  - Compare cada tela com o desenho.
- [ ] **Passo 6: Commit.** `chore(visual): remove CSS antigo e atualiza cache do PWA`.
