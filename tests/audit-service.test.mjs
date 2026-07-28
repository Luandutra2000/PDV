import assert from 'node:assert/strict';
import test from 'node:test';

test('audit service records the supplied sale details', async () => {
  const audit = await import('../src/services/audit.service.js');
  const records = [];

  audit.setAuditWriterForTests(async (record) => {
    records.push(record);
    return record;
  });

  try {
    await audit.recordAudit({
      action: 'sale.finished',
      entityType: 'sale',
      entityId: 'sale-1',
      userId: 'user-1',
      userName: 'Luan',
      metadata: { total: 10 }
    });

    assert.equal(records.length, 1);
    assert.equal(records[0].action, 'sale.finished');
    assert.equal(records[0].metadata.total, 10);
  } finally {
    audit.setAuditWriterForTests(null);
  }
});
