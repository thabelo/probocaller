import { getMetadataArgsStorage } from 'typeorm';
import { AuditLog } from './audit-log.entity';

describe('AuditLog entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "audit_logs" table', () => {
    const table = storage.tables.find((t) => t.target === AuditLog);
    expect(table?.name).toBe('audit_logs');
  });

  it('declares the columns the service relies on', () => {
    const cols = storage.columns
      .filter((c) => c.target === AuditLog)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['actorUserId', 'action', 'targetType', 'targetId', 'metadata', 'ip']),
    );
  });
});
