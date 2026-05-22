import { writeFileSync } from 'node:fs';

const config = {
  dataProvider: process.env.PDV_DATA_PROVIDER || 'local',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
};

writeFileSync(
  'src/config/runtime-config.js',
  `globalThis.__PDV_RUNTIME_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`
);

console.log(`runtime config generated for provider ${config.dataProvider}`);
