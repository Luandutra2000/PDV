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

const company = await import('../src/services/empresa-config.service.js?v=20260807-05');

// Cores antigas (padrao) contam como nao personalizadas e viram os tokens novos.
const legacy = company.resolveBrandColors({ corPrimaria: '#ff6b1a', corSecundaria: '#e65b11', corDestaque: '#fff0e6' });
assert(legacy.accent === '#FFB547', 'corPrimaria antiga deve virar #FFB547');
assert(legacy.accentStrong === '#F0A030', 'corSecundaria antiga deve virar #F0A030');
assert(legacy.accentSoft === '#FFF1D6', 'corDestaque antiga deve virar #FFF1D6');
assert(legacy.accentInk === '#1C2331', 'texto sobre o ambar deve ser escuro');

const upper = company.resolveBrandColors({ corPrimaria: '#FF6B1A', corSecundaria: '#E65B11', corDestaque: '#FFF0E6' });
assert(upper.accent === '#FFB547', 'comparacao do padrao antigo nao diferencia maiusculas');

// Cor personalizada e mantida.
const custom = company.resolveBrandColors({ corPrimaria: '#0055aa', corSecundaria: '#003377', corDestaque: '#e6f0ff' });
assert(custom.accent === '#0055aa', 'cor personalizada deve ser mantida');
assert(custom.accentStrong === '#003377', 'secundaria personalizada deve ser mantida');
assert(custom.accentSoft === '#e6f0ff', 'destaque personalizado deve ser mantido');
assert(custom.accentInk === '#FFFFFF', 'texto sobre azul escuro deve ser branco');

// Legibilidade do texto sobre a cor principal.
assert(company.pickReadableInk('#FFB547') === '#1C2331', 'ambar pede texto escuro');
assert(company.pickReadableInk('#0055aa') === '#FFFFFF', 'azul escuro pede texto branco');
assert(company.pickReadableInk('#FFFFFF') === '#1C2331', 'branco pede texto escuro');
assert(company.pickReadableInk('#000000') === '#FFFFFF', 'preto pede texto branco');
assert(company.pickReadableInk('invalido') === '#1C2331', 'cor invalida cai no texto escuro');

// Padroes da empresa ja usam os tokens novos.
const defaults = company.getDefaultCompanySettings();
assert(defaults.corPrimaria === '#FFB547', 'padrao corPrimaria deve ser #FFB547');
assert(defaults.corSecundaria === '#F0A030', 'padrao corSecundaria deve ser #F0A030');
assert(defaults.corDestaque === '#FFF1D6', 'padrao corDestaque deve ser #FFF1D6');

// applyCompanyIdentity define as variaveis novas e mantem as antigas.
const props = new Map();
globalThis.document = {
  documentElement: {
    style: { setProperty: (name, value) => props.set(name, value) }
  }
};
company.applyCompanyIdentity({ corPrimaria: '#ff6b1a', corSecundaria: '#e65b11', corDestaque: '#fff0e6' });
assert(props.get('--accent') === '#FFB547', 'applyCompanyIdentity deve definir --accent');
assert(props.get('--accent-strong') === '#F0A030', 'applyCompanyIdentity deve definir --accent-strong');
assert(props.get('--accent-soft') === '#FFF1D6', 'applyCompanyIdentity deve definir --accent-soft');
assert(props.get('--accent-ink') === '#1C2331', 'applyCompanyIdentity deve definir --accent-ink');
assert(props.has('--color-primary') && props.has('--crm-orange'), 'variaveis antigas continuam definidas');

props.clear();
company.applyCompanyIdentity({ corPrimaria: '#FFFFFF', corSecundaria: '#EEEEEE', corDestaque: '#F5F5F5' });
assert(props.get('--accent-ink') === '#1C2331', 'cor clara demais mantem texto escuro legivel');
props.clear();
company.applyCompanyIdentity({ corPrimaria: '#101820', corSecundaria: '#000000', corDestaque: '#DDDDDD' });
assert(props.get('--accent-ink') === '#FFFFFF', 'cor escura demais usa texto branco');

console.log('company-brand-colors.test.mjs ok');
