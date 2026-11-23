// Random part of local ids (sales, comandas, closings...). Uses the browser
// cryptographic generator instead of Math.random, which is predictable.
export function randomHex(bytes = 8) {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}
