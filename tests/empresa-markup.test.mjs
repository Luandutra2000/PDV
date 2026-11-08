import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const company = await import('../src/services/empresa-config.service.js?v=20260807-20');
const { renderEmpresaConfigMarkup, initEmpresaConfigModule } = await import('../src/modules/empresa-config/empresa-config.module.js?v=20260807-20');

const tagsWith = (source, pattern) => [...source.matchAll(/<[a-z0-9]+\s[^>]*>/gi)].map((m) => m[0]).filter((tag) => pattern.test(tag));
const defaults = company.getDefaultCompanySettings();
const html = renderEmpresaConfigMarkup({ ...defaults, nomeSistema: 'Zelo PDV', nomeFantasia: 'Lanchonete Central', razaoSocial: 'Central Ltda' });

// Cabecalho e estrutura
assert.match(html, /<h1[^>]*>Empresa<\/h1>/, 'titulo Empresa');
assert.match(html, /class="[^"]*\bui-screen\b/, 'tela usa ui-screen');
assert.match(html, /class="[^"]*\bui-head\b/, 'cabecalho usa ui-head');
assert(html.includes('data-empresa-config-screen') && html.includes('data-company-settings-form'), 'ganchos da tela e do formulario');
assert(!/Configurações da Empresa|Configura[cç][oõ]es da Empresa|Design de Layout/.test(html), 'titulo antigo saiu');
assert(!/Identidade do sistema|Identidade visual|Pré-visualização|Pre-visualizacao|Marca aplicada|Nome do programa<\/span>\s*<strong/.test(html), 'rotulos de cabecalho antigos saíram');
assert(!/module-screen|class="[^"]*empresa-config-|pdv-title|module-header|button--ghost|class="field"|field-group/.test(html), 'sem marcacao antiga');
assert(!/text-transform:\s*uppercase/.test(html), 'sem uppercase inline');
assert(!/Razao|Endereco|secundaria|Restaurar padrao|configuracoes/.test(html), 'textos acentuados');

// Sem escolha de tema: o tema e por aparelho, no menu do usuario
assert(!/\bTema\b|\bClaro\b|\bEscuro\b|\bAutomático\b|data-theme|name="theme"/i.test(html), 'sem seletor de tema');
assert(!/name="(tema|theme|corTexto|corFundo)"/.test(html), 'sem campos de texto/fundo');

// Acoes do cabecalho
assert(/<button[^>]*class="ui-btn ui-btn--ghost"[^>]*data-action="restore-defaults"[^>]*>Restaurar padrão<\/button>|<button[^>]*data-action="restore-defaults"[^>]*class="ui-btn ui-btn--ghost"[^>]*>Restaurar padrão<\/button>/.test(html), 'Restaurar padrão fantasma');
assert(/<button[^>]*class="ui-btn ui-btn--primary"[^>]*type="submit"[^>]*>Salvar<\/button>|<button[^>]*type="submit"[^>]*class="ui-btn ui-btn--primary"[^>]*>Salvar<\/button>/.test(html), 'Salvar primario e submit');
assert(html.indexOf('ui-head__actions') < html.indexOf('Restaurar padrão') && html.indexOf('Restaurar padrão') < html.indexOf('<h2'), 'acoes no cabecalho, antes dos paineis');

// Tres colunas: logo e cores, dados, previa
const panelTitles = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
assert.deepEqual(panelTitles, ['Logo e cores', 'Dados da empresa', 'Prévia'], 'tres paineis');
assert((html.match(/class="[^"]*\bui-panel\b/g) || []).length >= 3, 'paineis em ui-panel');

// Logo: trocar e remover
assert(html.includes('data-field="logoFile"') && /type="file"/.test(html), 'campo de arquivo da logo');
assert(tagsWith(html, /data-action="remove-logo"/).length === 1, 'Remover logo continua');
assert(/Remover logo<\/button>/.test(html), 'texto Remover logo');
assert(html.includes('Enviar logo'), 'sem logo, o botao convida a enviar');
const withLogo = renderEmpresaConfigMarkup({ ...defaults, logoUrl: 'https://cdn.exemplo.com/logo.png' });
assert(withLogo.includes('Trocar logo') && withLogo.includes('src="https://cdn.exemplo.com/logo.png"'), 'com logo: Trocar logo e imagem');
assert(!/data-action="remove-logo"[^>]*disabled/.test(withLogo), 'Remover logo ativo quando ha logo');
const unsafeLogo = renderEmpresaConfigMarkup({ ...defaults, logoUrl: 'javascript:alert(1)' });
assert(!unsafeLogo.includes('javascript:'), 'logo insegura nao entra');

// As tres cores existentes, com os mesmos nomes
['corPrimaria', 'corSecundaria', 'corDestaque'].forEach((name) => {
  const input = tagsWith(html, new RegExp(`<input[^>]*name="${name}"`));
  assert.equal(input.length, 1, `campo ${name}`);
  assert(/type="color"/.test(input[0]) && new RegExp(`data-field="${name}"`).test(input[0]), `${name} e color com data-field`);
});
['Cor primária', 'Cor secundária', 'Cor de destaque'].forEach((label) => assert(html.includes(label), label));
assert(html.includes('data-color-hex="corPrimaria"') && html.includes('>#FFB547<'), 'valor hexadecimal ao lado do campo');

// Campos de dados com os mesmos nomes
['nomeSistema', 'nomeFantasia', 'razaoSocial', 'cnpj', 'telefone', 'whatsapp', 'email', 'endereco'].forEach((name) => {
  const input = tagsWith(html, new RegExp(`<input[^>]*name="${name}"`));
  assert.equal(input.length, 1, `campo ${name}`);
  assert(new RegExp(`data-field="${name}"`).test(input[0]), `${name} com data-field`);
});
assert(/name="nomeSistema"[^>]*required|required[^>]*name="nomeSistema"/.test(html), 'nomeSistema obrigatorio');
assert(/name="nomeFantasia"[^>]*required|required[^>]*name="nomeFantasia"/.test(html), 'nomeFantasia obrigatorio');
assert(/name="email"[^>]*type="email"|type="email"[^>]*name="email"/.test(html), 'email do tipo email');
assert(html.includes('value="Lanchonete Central"') && html.includes('value="Central Ltda"'), 'valores carregados');
assert(html.includes('data-company-settings-error'), 'area de erro mantida');

// Previa: marca, Receber e cartao de produto, com as cores resolvidas
const preview = (settings) => tagsWith(renderEmpresaConfigMarkup({ ...defaults, ...settings }), /data-company-preview/)[0] || '';
const amber = preview({});
assert(amber.includes('--accent: #FFB547') && amber.includes('--accent-strong: #F0A030') && amber.includes('--accent-soft: #FFF1D6'), 'previa padrao');
const legacy = preview({ corPrimaria: '#ff6b1a', corSecundaria: '#e65b11', corDestaque: '#fff0e6' });
assert(legacy.includes('--accent: #FFB547'), 'laranja antigo vira o ambar na previa');
assert(legacy.includes('--accent-strong: #F0A030') && legacy.includes('--accent-soft: #FFF1D6'), 'secundaria e destaque antigos viram os novos');
const blue = preview({ corPrimaria: '#0055aa', corSecundaria: '#003377', corDestaque: '#e6f0ff' });
assert(blue.includes('--accent: #0055aa') && blue.includes('--accent-strong: #003377') && blue.includes('--accent-soft: #e6f0ff'), 'cores personalizadas na previa');
assert(blue.includes(`--accent-ink: ${company.pickReadableInk('#0055aa')}`), 'texto do botao legivel sobre o azul');
assert(preview({ corPrimaria: '#FFFFFF' }).includes('--accent-ink: #1C2331'), 'texto escuro sobre cor clara');
const invalid = preview({ corPrimaria: 'azul' });
assert(invalid.includes('--accent: #FFB547'), 'cor invalida cai no padrao');
assert(!/#ff6b1a/i.test(renderEmpresaConfigMarkup({ ...defaults, corPrimaria: 'azul' })), 'sem laranja antigo como valor de apoio');
const legacyInput = tagsWith(renderEmpresaConfigMarkup({ ...defaults, corPrimaria: '#ff6b1a' }), /name="corPrimaria"/)[0];
assert(legacyInput.includes('value="#FFB547"'), 'campo mostra o ambar quando o valor salvo e o laranja antigo');

assert(html.includes('Receber') && html.includes('R$ 74,00'), 'botao Receber de exemplo');
assert(html.includes('X-Burger'), 'cartao de produto de exemplo');
assert(/class="[^"]*\bem-item\b[^"]*"[^>]*style="[^"]*--c:\s*var\(--cat-lanches\)/.test(html), 'cartao de produto com faixa da categoria');
assert(html.includes('data-preview-name') && html.includes('>Zelo PDV<') && html.includes('>Lanchonete Central<'), 'nome na previa');
assert(!/style="[^"]*:root/.test(html), 'previa nao mexe na raiz');

// Fluxos: salvar, restaurar, remover logo e previa ao vivo
const handlers = {};
const previewStyle = new Map();
const previewEl = { style: { setProperty: (name, value) => previewStyle.set(name, value) } };
const hexEls = {};
const workspace = {
  innerHTML: '',
  addEventListener: (event, handler) => { handlers[event] = handler; },
  querySelector: (selector) => {
    if (selector === '[data-company-settings-error]') return errorEl;
    if (selector === '[data-company-preview]') return previewEl;
    const hex = selector.match(/^\[data-color-hex="(\w+)"\]$/);
    if (hex) return (hexEls[hex[1]] ||= { textContent: '' });
    const text = selector.match(/^\[data-preview-(name|sub)\]$/);
    if (text) return (hexEls[`text-${text[1]}`] ||= { textContent: '' });
    return null;
  }
};
const errorEl = { textContent: '', hidden: true };

store.clear();
initEmpresaConfigModule(workspace);
assert(workspace.innerHTML.includes('data-empresa-config-screen'), 'modulo renderiza');
assert(workspace.innerHTML.includes('value="Zelo PDV"'), 'padrao carregado');

// FormData simulado: o formulario falso guarda os valores por nome
globalThis.FormData = class { constructor(form) { this.form = form; } get(name) { return this.form.values[name] ?? null; } };
const formValues = {
  nomeSistema: 'Zelo PDV', nomeFantasia: 'Lanchonete Central', razaoSocial: 'Central Ltda', cnpj: '', telefone: '', whatsapp: '',
  email: '', endereco: 'Rua A', corPrimaria: '#0055aa', corSecundaria: '#003377', corDestaque: '#e6f0ff'
};
let prevented = false;
await handlers.submit({
  preventDefault: () => { prevented = true; },
  target: { matches: (selector) => selector === '[data-company-settings-form]', values: formValues }
});
assert(prevented, 'submit nao recarrega a pagina');
let saved = company.loadCompanySettingsLocal();
assert.equal(saved.corPrimaria, '#0055aa', 'Salvar grava a cor principal');
assert.equal(saved.nomeFantasia, 'Lanchonete Central', 'Salvar grava os dados');
assert(workspace.innerHTML.includes('--accent: #0055aa'), 'tela renderizada de novo com a previa salva');

// Validacao mantida
errorEl.hidden = true;
await handlers.submit({
  preventDefault: () => {},
  target: { matches: () => true, values: { ...formValues, nomeSistema: '' } }
});
assert.equal(errorEl.hidden, false, 'erro de validacao aparece');
assert.match(errorEl.textContent, /Nome do programa/, 'mensagem de validacao');
assert.equal(company.loadCompanySettingsLocal().corPrimaria, '#0055aa', 'validacao nao grava');

// Previa ao vivo: so no elemento da previa, nunca na raiz
globalThis.document = { documentElement: { style: { setProperty: () => { throw new Error('nao deve tocar a raiz antes de salvar'); }, removeProperty: () => {} } } };
const colorTarget = (name, value) => ({
  matches: (selector) => selector.includes('input'),
  name,
  value,
  closest: (selector) => (selector === '[data-company-settings-form]'
    ? { querySelector: (sel) => { const m = sel.match(/name="(\w+)"/); const v = m ? ({ ...formValues, [name]: value })[m[1]] : null; return v == null ? null : { value: v }; } }
    : null)
});
handlers.input({ target: colorTarget('corPrimaria', '#ff6b1a') });
assert.equal(previewStyle.get('--accent'), '#FFB547', 'previa ao vivo: laranja antigo vira ambar');
handlers.input({ target: colorTarget('corPrimaria', '#112233') });
assert.equal(previewStyle.get('--accent'), '#112233', 'previa ao vivo: cor nova');
assert.equal(previewStyle.get('--accent-ink'), company.pickReadableInk('#112233'), 'previa ao vivo: texto legivel');
assert.equal(hexEls.corPrimaria.textContent, '#112233', 'hexadecimal ao vivo');
delete globalThis.document;

// Restaurar padrao: mesma acao, sem tocar em id e empresa
await handlers.click({
  target: { closest: (selector) => (selector === '[data-action]' ? { dataset: { action: 'restore-defaults' }, closest: () => ({}) } : null) }
});
saved = company.loadCompanySettingsLocal();
assert.equal(saved.corPrimaria, '#FFB547', 'Restaurar padrão volta o ambar');
assert.equal(saved.nomeFantasia, 'Lanchonete', 'Restaurar padrão volta os dados');

// Remover logo
await company.saveCompanySettings({ ...saved, logoUrl: 'https://cdn.exemplo.com/logo.png' });
await handlers.click({
  target: { closest: (selector) => (selector === '[data-action]' ? { dataset: { action: 'remove-logo' }, closest: () => ({}) } : null) }
});
assert.equal(company.loadCompanySettingsLocal().logoUrl, '', 'Remover logo limpa a logo');

console.log('empresa markup ok');
