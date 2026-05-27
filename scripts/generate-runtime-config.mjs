import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const outputPath = resolve('src/config/runtime-config.js');
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const dataProvider = supabaseUrl && supabaseAnonKey ? 'supabase' : 'local';

const config = {
  dataProvider,
  supabaseUrl,
  supabaseAnonKey
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `globalThis.__PDV_RUNTIME_CONFIG__ = ${JSON.stringify(config, null, 2)};\n\nexport const runtimeConfig = globalThis.__PDV_RUNTIME_CONFIG__;\n`
);

console.log(`runtime config generated for ${dataProvider} provider`);
