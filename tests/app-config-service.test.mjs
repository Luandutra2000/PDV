import assert from 'node:assert/strict';
import test from 'node:test';

test('app config resolves provider mode and Supabase availability', async () => {
  delete globalThis.__PDV_RUNTIME_CONFIG__;
  const config = await import('../src/services/app-config.service.js');

  try {
    assert.equal(config.getDataProviderMode(), 'local');
    assert.equal(config.isSupabaseEnabled(), false);

    globalThis.__PDV_RUNTIME_CONFIG__ = {
      dataProvider: 'local',
      supabaseUrl: '',
      supabaseAnonKey: ''
    };

    assert.equal(config.getDataProviderMode(), 'local');
    assert.equal(config.isSupabaseEnabled(), false);

    globalThis.__PDV_RUNTIME_CONFIG__ = {
      dataProvider: 'invalid',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-anon-key'
    };

    assert.equal(config.getDataProviderMode(), 'local');
    assert.equal(config.isSupabaseEnabled(), false);

    globalThis.__PDV_RUNTIME_CONFIG__ = {
      dataProvider: 'supabase',
      supabaseUrl: '',
      supabaseAnonKey: 'public-anon-key'
    };

    assert.equal(config.getDataProviderMode(), 'supabase');
    assert.equal(config.isSupabaseEnabled(), false);

    globalThis.__PDV_RUNTIME_CONFIG__ = {
      dataProvider: 'supabase',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: ''
    };

    assert.equal(config.getDataProviderMode(), 'supabase');
    assert.equal(config.isSupabaseEnabled(), false);

    globalThis.__PDV_RUNTIME_CONFIG__ = {
      dataProvider: 'supabase',
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'public-anon-key'
    };

    assert.equal(config.getDataProviderMode(), 'supabase');
    assert.equal(config.isSupabaseEnabled(), true);
  } finally {
    delete globalThis.__PDV_RUNTIME_CONFIG__;
  }
});
