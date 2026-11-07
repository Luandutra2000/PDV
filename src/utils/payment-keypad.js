// Regras do teclado e das cedulas rapidas do modal "Receber comanda".
// Funcoes puras: o modulo de vendas so liga o resultado ao DOM.

const MAX_TEXT_LENGTH = 9;

function roundCents(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function nextMultiple(total, step) {
  return (Math.floor(roundCents(total) / step) + 1) * step;
}

// Tres valores maiores que o total, em ordem crescente e sem repeticao:
// proximo multiplo de 10, de 50 e de 100. Quando coincidem, o seguinte e o
// proximo multiplo de 100 ainda nao usado.
export function getQuickCashOptions(total) {
  const used = new Set();
  let nextHundred = nextMultiple(total, 100);

  const options = [10, 50, 100].map((step) => {
    let value = nextMultiple(total, step);

    if (used.has(value)) {
      while (used.has(nextHundred)) {
        nextHundred += 100;
      }
      value = nextHundred;
    }

    used.add(value);
    return value;
  });

  return options.sort((a, b) => a - b);
}

// Edita o texto do valor em reais (sem centavos implicitos).
export function applyKeypadKey(current, key) {
  const text = String(current ?? '');

  if (key === 'back') {
    return text.slice(0, -1);
  }

  if (!/^(\d|00)$/.test(String(key))) {
    return text;
  }

  const decimals = text.split(/[.,]/)[1];
  if (decimals !== undefined && decimals.length + key.length > 2) {
    return text;
  }

  const next = text + key;

  // Nao comeca com zero: "0" e "00" no vazio nao entram; "05" vira "5".
  const normalized = /^0\d/.test(next) ? next.replace(/^0+/, '') : next;
  if (/^0+$/.test(normalized)) {
    return '';
  }

  return normalized.length > MAX_TEXT_LENGTH ? text : normalized;
}

// Aceita "100", "100,50" e "100.50". Vazio ou invalido vira 0.
export function parseReceivedAmount(text) {
  const cleaned = String(text ?? '')
    .replace(/[^\d.,]/g, '')
    .replace(',', '.');
  const value = Number.parseFloat(cleaned);

  return Number.isFinite(value) && value > 0 ? value : 0;
}

// Texto inicial do campo para um valor em reais ("74" ou "74,50").
export function formatReceivedText(value) {
  const amount = roundCents(value);

  if (!amount) {
    return '';
  }

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace('.', ',');
}
