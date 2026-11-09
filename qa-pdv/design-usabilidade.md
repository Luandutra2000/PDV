# Design e usabilidade — auditoria QA 2026-11

Tamanhos usados: 1366×768 (principal, monitor comum), 1024×600 (janela baixa), 375×812 (celular). Tema claro. Identidade visual da empresa em produção: primária #eb4224, secundária #0f172a, destaque #f97316.

Classificação: **Defeito visual** (algo quebrado), **Usabilidade** (atrapalha o atendimento), **Preferência** (gosto, sem prejuízo).

## Frente de caixa

| Item | Tipo | Situação |
| --- | --- | --- |
| Botão "Receber" e total fora da tela em 1024×600 (painel esticado com a lista de produtos) | Usabilidade | Corrigido (BUG-016) |
| Hover dos botões principais com texto ilegível (#1C2331 sobre #0F172A) | Defeito visual | Corrigido (BUG-009) |
| "OK" da confirmação ocupa a posição de "Finalizar venda"; duplo clique fechava a confirmação com o troco | Usabilidade | Corrigido (BUG-009, proteção de 600 ms) |
| Sem aviso quando a venda fica pendente de envio (sem conexão) | Usabilidade | Pendente (BUG-024) |
| Catálogo vazio por permissão aparecia como "Nenhum produto encontrado" | Usabilidade | Corrigido: mensagem explica a causa (BUG-017) |
| Em 375 px o conteúdo é cortado na horizontal | Defeito visual | Pendente (BUG-025) |
| Cartões mostram estoque ("10 em estoque", "1 restante", "Esgotado") de forma legível; preço em destaque | — | Adequado |
| Teclado numérico + cédulas rápidas + "Exato": troco e "Faltam" atualizam a cada tecla; Finalizar desabilitado se faltar dinheiro | — | Adequado |
| Toque longo/botão direito para quantidade não é descobrível sem treinamento | Usabilidade | Sugestão: dica visual ou botão "Qtd" |
| Mais de uma aba no mesmo aparelho compartilha a comanda | Usabilidade | Mitigado (BUG-008): as abas se atualizam e avisam |

## Caixa e fechamento

| Item | Tipo | Situação |
| --- | --- | --- |
| Dinheiro esperado sem troco inicial (sobra falsa em todo fechamento) | Usabilidade/financeiro | Corrigido (BUG-005) |
| Modal "Abrir caixa" sem espaçamento (campo encostado na borda) | Defeito visual | Corrigido (BUG-013) |
| "Caixa atual" no topo mistura Pix e cartões com dinheiro | Usabilidade | Pendente (BUG-012) |
| Observação obrigatória se houver diferença; diferenças negativas em vermelho | — | Adequado |
| Nota da tela explica a fórmula do dinheiro esperado | — | Atualizada para citar o troco inicial |
| Reabertura no mesmo dia sem explicação | Usabilidade | Corrigido: texto do modal explica o troco adicional |
| Motivo de cancelamento de movimento pedido por `prompt` nativo; erro de abertura por `alert` | Usabilidade | Pendente (BUG-029) |

## Vitrine

| Item | Tipo | Situação |
| --- | --- | --- |
| Formulário "Novo lançamento" apagado por sincronização | Usabilidade | Corrigido (BUG-006) |
| "Cancelar" lançamento e "apagar linha" sem confirmação | Usabilidade | Pendente (BUG-026) |
| Sobra/alertas consideram só a produção do dia | Usabilidade/estoque | Pendente — regra (BUG-004) |
| Muitos indicadores (12 cartões) competem com o formulário de lançamento | Preferência | Sugestão: priorizar "Estoque atual" e "Zerados" |

## Produtos, Histórico, Relatórios, Financeiro, App do dono

| Item | Tipo | Situação |
| --- | --- | --- |
| Tela Produtos se sobrepunha à Frente de caixa | Defeito | Corrigido (BUG-003) |
| Exclusão de produto com confirmação clara ("Esta ação não pode ser desfeita") | — | Adequado |
| Não há como inativar produto | Usabilidade | Pendente (BUG-022) |
| "Produto mais vendido … 1 vendidos" (concordância e período pouco claro) | Preferência | Sugestão |
| Relatórios: "Movimentações recentes" com códigos crus | Defeito visual | Corrigido (BUG-014) |
| Financeiro: sangria aparece como despesa ("Retirada do dono") | Usabilidade/financeiro | Pendente (BUG-021) |
| App do dono: alerta "restam 1" com 48 na vitrine | Usabilidade | Pendente (BUG-004) |
| Carregamento: formulário de login estático por ~7,6 s com sessão ativa | Usabilidade | Pendente (BUG-023) |

## Acessibilidade e teclado

- Botões de fechar ("X") têm `aria-label` (verificado por teste existente).
- Foco visível nos botões e campos do visual B (contorno em `--ink`).
- Navegação só por teclado (Tab/Esc nos modais, atalhos) não foi exercida nesta rodada — pendente.
- Contraste do hover corrigido para 17,85:1 com a paleta real da empresa.
