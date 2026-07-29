import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const files = [
  'src/app.js',
  'src/components/analise-produtos.component.js',
  'src/components/entradas-saidas.component.js',
  'src/components/fechamento-rapido-modal.component.js',
  'src/components/order-panel.component.js',
  'src/components/product-card.component.js',
  'src/modules/caixa/caixa.module.js',
  'src/modules/dashboard/dashboard.module.js',
  'src/modules/despesas/despesas.module.js',
  'src/modules/estoque/estoque.module.js',
  'src/modules/mobile/mobile-dashboard.module.js',
  'src/modules/pessoas/pessoas.module.js',
  'src/modules/produtos/produtos.module.js',
  'src/modules/relatorios/relatorios.module.js',
  'src/modules/vendas/vendas.module.js'
];
const riskyProperty = /\$\{[^}\n]*\.(?:name|description|notes|note|reason|categoryName|userName|produtoNome|categoriaNome)\b/;
const offenders = [];

files.forEach((relativePath) => {
  const source = readFileSync(resolve(relativePath), 'utf8');
  source.split(/\r?\n/).forEach((line, index) => {
    if (
      riskyProperty.test(line)
      && !line.includes('escapeHtml(')
      && !line.includes('renderTextRow(')
      && !line.includes('renderAuditSelect(')
      && !line.includes('globalThis.confirm(')
      && !line.includes('globalThis.window?.confirm(')
      && !line.includes('globalThis.window.confirm(')
    ) {
      offenders.push(`${relativePath}:${index + 1}`);
    }
  });
});

assert(
  offenders.length === 0,
  `stored HTML fields must be escaped before template interpolation: ${offenders.join(', ')}`
);

console.log(`Stored XSS regression passed (${files.length} render files checked).`);
