const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const audit = await import('../src/services/audit.service.js');

const records = [];
audit.setAuditWriterForTests(async (record) => {
  records.push(record);
  return record;
});

await audit.recordAudit({
  action: 'sale.finished',
  entityType: 'sale',
  entityId: 'sale-1',
  userId: 'user-1',
  userName: 'Luan',
  metadata: { total: 10 }
});

assert(records.length === 1, 'audit writer should receive record');
assert(records[0].action === 'sale.finished', 'audit should preserve action');
assert(records[0].metadata.total === 10, 'audit should preserve metadata');

console.log('audit service ok');
