import { getMetadataArgsStorage } from 'typeorm';
import { AdminInvite } from './admin-invite.entity';

describe('AdminInvite entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "admin_invites" table', () => {
    const table = storage.tables.find((t) => t.target === AdminInvite);
    expect(table?.name).toBe('admin_invites');
  });

  it('declares the columns the service relies on', () => {
    const cols = storage.columns
      .filter((c) => c.target === AdminInvite)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining(['phoneNumber', 'token', 'role', 'invitedByUserId', 'status', 'expiresAt', 'redeemedAt']),
    );
  });
});
