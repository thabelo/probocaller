import { getMetadataArgsStorage } from 'typeorm';
import { Invite } from './invite.entity';

/**
 * Schema guard for the invites table — the service, the migration and the admin
 * list all rely on these column names, so pin them here to catch drift.
 */
describe('Invite entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "invites" table', () => {
    const table = storage.tables.find((t) => t.target === Invite);
    expect(table?.name).toBe('invites');
  });

  it('declares the columns the service writes', () => {
    const cols = storage.columns
      .filter((c) => c.target === Invite)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining([
        'inviterUserId',
        'phoneNumber',
        'referralCode',
        'channel',
        'status',
        'acceptedAt',
      ]),
    );
  });

  /**
   * Re-inviting the same person must refresh the existing row, not pile up
   * duplicates in the admin view — the migration enforces this with a unique
   * index, so the entity has to declare it or the two silently diverge.
   */
  it('declares one live invite per inviter+number', () => {
    const unique = storage.indices.find(
      (i) => i.target === Invite && (i.columns as string[])?.join(',') === 'inviterUserId,phoneNumber',
    );
    expect(unique?.unique).toBe(true);
  });

  /**
   * The admin list sorts by recency and the accept-on-signup path looks rows up
   * by the invited number, so both need indexes to stay cheap as invites grow.
   */
  it('indexes the columns the admin list and accept lookup filter on', () => {
    const indices = storage.indices.filter((i) => i.target === Invite);
    const columnSets = indices.map((i) => (i.columns as string[])?.join(','));
    expect(columnSets).toEqual(
      expect.arrayContaining(['status,createdAt', 'phoneNumber']),
    );
  });
});
