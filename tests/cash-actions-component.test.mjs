import { readFileSync, readdirSync } from 'node:fs';

const store = new Map();

globalThis.localStorage = {
  getItem(key) {
    return store.has(key) ? store.get(key) : null;
  },
  setItem(key, value) {
    store.set(key, String(value));
  },
  removeItem(key) {
    store.delete(key);
  },
  clear() {
    store.clear();
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const storage = await import('../src/services/storage.service.js?v=20260804-06');
const { STORAGE_KEYS } = await import('../src/database/schema.js?v=20260804-06');
const { seedTestAdmin } = await import('./test-auth-fixture.mjs?v=20260804-06');
const cashActions = await import('../src/components/cash-actions.component.js?v=20260807-21');
const { initNotificationService } = await import('../src/services/notification.service.js?v=20260804-06');

seedTestAdmin(storage, STORAGE_KEYS);
storage.ensureSeedData();

const adminUser = { id: 'user-admin', name: 'Administrador', role: 'admin', active: true };
const operadorUser = { id: 'user-operador', name: 'Operador', role: 'operador', active: true };
const gerenteUser = { id: 'user-gerente', name: 'Gerente', role: 'gerente', active: true };

// Botoes: operador (sem cash.close) mesmo pedindo Fechamento rapido
const operadorButtons = cashActions.renderCashActionButtons(operadorUser, { includeQuickClosing: true });
assert(operadorButtons.includes('data-action="open-entry"'), 'operador ve + Entrada');
assert(operadorButtons.includes('data-action="open-output"'), 'operador ve - Saida');
// stock.writeoff so existe para gerente e admin (regra de permissao de hoje, nao mexer)
assert(!operadorButtons.includes('open-write-off'), 'operador nao tem stock.writeoff, entao nao ve Perda / Consumo');
assert(!operadorButtons.includes('open-quick-closing'), 'operador nao ve Fechamento rapido');

// Admin ve os quatro, na ordem, com os rotulos e classes combinados
const adminButtons = cashActions.renderCashActionButtons(adminUser, { includeQuickClosing: true });
const order = ['open-entry', 'open-output', 'open-quick-closing', 'open-write-off'];
const positions = order.map((action) => adminButtons.indexOf(`data-action="${action}"`));
assert(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), 'admin ve os quatro botoes na ordem');
assert(adminButtons.includes('+ Entrada'), 'rotulo + Entrada');
assert(adminButtons.includes('\u2212 Sa\u00edda'), 'rotulo com sinal de menos U+2212 e acento');
assert(adminButtons.includes('Fechamento r\u00e1pido'), 'rotulo Fechamento rapido');
assert(adminButtons.includes('Perda / Consumo'), 'rotulo Perda / Consumo');
assert(adminButtons.includes('ui-btn'), 'botoes usam .ui-btn');
assert((adminButtons.match(/ui-btn--loss/g) || []).length === 2, 'Saida e Perda usam ui-btn--loss');
assert(/ui-btn--loss" type="button" data-action="open-output"/.test(adminButtons), 'Saida usa ui-btn--loss');
assert(/ui-btn--loss" type="button" data-action="open-write-off"/.test(adminButtons), 'Perda usa ui-btn--loss');

// Gerente tem as quatro permissoes
const gerenteButtons = cashActions.renderCashActionButtons(gerenteUser, { includeQuickClosing: true });
assert(['open-entry', 'open-output', 'open-quick-closing', 'open-write-off'].every((action) => gerenteButtons.includes(action)), 'gerente ve os quatro botoes');

// Sem includeQuickClosing, nem admin ve Fechamento rapido
assert(!cashActions.renderCashActionButtons(adminUser).includes('open-quick-closing'), 'Fechamento rapido e opcional');

// includeWriteOff: false esconde Perda / Consumo
const withoutWriteOff = cashActions.renderCashActionButtons(adminUser, { includeQuickClosing: true, includeWriteOff: false });
assert(!withoutWriteOff.includes('open-write-off'), 'includeWriteOff false remove Perda / Consumo');
assert(withoutWriteOff.includes('open-entry') && withoutWriteOff.includes('open-output') && withoutWriteOff.includes('open-quick-closing'), 'includeWriteOff false mantem os outros');

// Sem usuario nao aparece nada
assert(cashActions.renderCashActionButtons(null, { includeQuickClosing: true }).trim() === '', 'sem usuario nao ha botoes');

// Modais
const saidaModal = cashActions.renderCashMovementModal('saida');
assert(saidaModal.includes('Registrar sa\u00edda'), 'titulo do modal de saida');
assert(saidaModal.includes('name="description"'), 'modal de saida tem campo de descricao');
assert(saidaModal.includes('data-cash-form') && saidaModal.includes('value="saida"'), 'modal de saida mantem form');
const entradaModal = cashActions.renderCashMovementModal('entrada');
assert(entradaModal.includes('Registrar entrada'), 'titulo do modal de entrada');
assert(entradaModal.includes('Reforco de caixa'), 'categorias de entrada continuam');

const writeOffModal = cashActions.renderWriteOffModal();
assert(writeOffModal.includes('Perda / Consumo') && writeOffModal.includes('modal-backdrop'), 'modal de baixa renderiza');

// Botao X de fechar tem nome acessivel
[saidaModal, entradaModal, writeOffModal].forEach((markup) => {
  assert(markup.includes('data-action="close-modal" aria-label="Fechar">X</button>'), 'X de fechar tem aria-label="Fechar"');
});

// Em todo o app, botao cujo unico conteudo e X/× precisa de aria-label
const sourceFiles = readdirSync(new URL('../src/', import.meta.url), { recursive: true }).filter((file) => String(file).endsWith('.js'));
const unnamedCloseButtons = sourceFiles.flatMap((file) => {
  const source = readFileSync(new URL(`../src/${String(file).replaceAll('\\', '/')}`, import.meta.url), 'utf8');
  return [...source.matchAll(/<button\b([^>]*)>\s*(X|×|&times;)\s*<\/button>/g)]
    .filter((match) => !/aria-label=/.test(match[1]))
    .map((match) => `${file}: ${match[0]}`);
});
assert(unnamedCloseButtons.length === 0, `botoes X sem aria-label: ${unnamedCloseButtons.join('; ')}`);

// Textos visiveis com acento; valores gravados e categorias ficam iguais
assert(saidaModal.includes('Descrição obrigatória') && saidaModal.includes('Ex: Sangria, reforço de caixa'), 'descricao com acento');
assert(!saidaModal.includes('Descricao obrigatoria') && !saidaModal.includes('reforco de caixa"'), 'descricao sem acento saiu');
assert(writeOffModal.includes('Nenhum produto foi lançado na vitrine hoje.'), 'vitrine vazia com acento');
const cashActionsSource = readFileSync(new URL('../src/components/cash-actions.component.js', import.meta.url), 'utf8');
assert(cashActionsSource.includes('<option value="erro-lancamento">Erro de lançamento</option>'), 'motivo com acento e valor igual');
assert(/\n\s*Observação\n/.test(cashActionsSource), 'rotulo Observação com acento');
assert(cashActionsSource.includes("const ENTRY_CATEGORIES = ['Reforco de caixa', 'Pagamento de cliente', 'Dinheiro extra', 'Ajuste manual', 'Outros'];"), 'categorias de entrada gravadas sem mudanca');
assert(cashActionsSource.includes("const OUTPUT_CATEGORIES = ['Compra de material', 'Compra de ingredientes', 'Pagamento de fornecedor', 'Despesa operacional', 'Retirada do dono', 'Troco', 'Manutencao', 'Outros'];"), 'categorias de saida gravadas sem mudanca');
['Saída registrada', 'lançado no histórico.', 'Perda ou consumo entrou na conferência da vitrine.'].forEach((text) => {
  assert(cashActionsSource.includes(text), `aviso com acento: ${text}`);
});
['Saida registrada', 'Nao foi possivel', 'lancado no historico', 'conferencia da vitrine', 'Descricao obrigatoria'].forEach((text) => {
  assert(!cashActionsSource.includes(text), `aviso sem acento saiu: ${text}`);
});

// Envio: descricao vazia nao registra e avisa
const toasts = [];
globalThis.document = {
  createElement() {
    const el = { children: [], className: '', textContent: '', attrs: {}, remove() {}, addEventListener() {}, setAttribute() {}, append(...nodes) { this.children.push(...nodes); }, appendChild(node) { this.children.push(node); } };
    return el;
  }
};
const root = { appendChild(node) { toasts.push(node); } };
initNotificationService(root);

const emptyDescription = new FormData();
emptyDescription.set('type', 'entrada');
emptyDescription.set('amount', '10');
emptyDescription.set('category', 'Outros');
emptyDescription.set('description', '   ');
const emptyResult = await cashActions.submitCashMovementForm(emptyDescription);
assert(emptyResult === false, 'descricao vazia nao conclui o envio');
assert(toasts.length === 1 && toasts[0].className.includes('app-toast--danger'), 'descricao vazia avisa com toast de perigo');
const toastTitle = (toast) => toast.children[0].children[0].textContent;
assert(toastTitle(toasts[0]) === 'Descrição obrigatória', 'titulo do aviso com acento');

// Envio: erro do servico (sem sessao/usuario) devolve false e avisa
const failing = new FormData();
failing.set('type', 'entrada');
failing.set('amount', '0');
failing.set('category', 'Outros');
failing.set('description', 'Teste');
const failResult = await cashActions.submitCashMovementForm(failing);
assert(failResult === false, 'erro do servico nao conclui o envio');
assert(toasts.length === 2, 'erro do servico avisa');
assert(toastTitle(toasts[1]) === 'Não foi possível registrar', 'titulo do erro com acento');

const badWriteOff = new FormData();
badWriteOff.set('productId', 'inexistente');
badWriteOff.set('quantity', '1');
badWriteOff.set('reason', 'quebra');
badWriteOff.set('note', '');
const writeOffResult = await cashActions.submitWriteOffForm(badWriteOff);
assert(writeOffResult === false, 'baixa invalida nao conclui o envio');
assert(toasts.length === 3, 'baixa invalida avisa');
assert(toastTitle(toasts[2]) === 'Não foi possível registrar', 'titulo do erro da baixa com acento');

console.log('cash actions component ok');
