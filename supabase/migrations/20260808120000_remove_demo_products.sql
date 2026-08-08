-- Remove only the original demo catalog. Categories and user-created products
-- remain untouched. Re-running this migration is safe.
delete from public.products
where id in (
  'x-burger',
  'x-salada',
  'x-bacon',
  'misto-quente',
  'batata-frita',
  'frango-passarinho',
  'refrigerante-lata',
  'suco-natural',
  'agua',
  'combo-casal',
  'combo-familia'
);

