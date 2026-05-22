let auditWriterForTests = null;

export function setAuditWriterForTests(writer) {
  auditWriterForTests = writer;
}

export async function recordAudit({
  action,
  entityType,
  entityId = '',
  userId = null,
  userName = 'Sistema',
  metadata = {}
}) {
  const record = {
    action,
    entityType,
    entityId,
    userId,
    userName,
    metadata,
    createdAt: new Date().toISOString()
  };

  if (auditWriterForTests) {
    return auditWriterForTests(record);
  }

  return record;
}
