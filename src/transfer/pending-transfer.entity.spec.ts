import { getMetadataArgsStorage } from 'typeorm';
import { PendingTransfer } from './pending-transfer.entity';

/**
 * Money sent to someone who is not on ProboCaller yet. The sender is debited
 * immediately and the amount is held here until the recipient signs up on that
 * number — so the funds are always accounted for, and never sit in a wallet
 * belonging to an unverified number that nobody controls.
 */
describe('PendingTransfer entity', () => {
  const storage = getMetadataArgsStorage();

  it('maps to the "pending_transfers" table', () => {
    const table = storage.tables.find((t) => t.target === PendingTransfer);
    expect(table?.name).toBe('pending_transfers');
  });

  it('records who sent it, to which number, how much, and its state', () => {
    const cols = storage.columns
      .filter((c) => c.target === PendingTransfer)
      .map((c) => c.propertyName);
    expect(cols).toEqual(
      expect.arrayContaining([
        'senderUserId',
        'recipientPhone',
        'amount',
        'note',
        'status',
        'claimedByUserId',
        'claimedAt',
        'expiresAt',
      ]),
    );
  });

  /**
   * Money must not be stored as a float. 0.1 + 0.2 in binary floating point is
   * not 0.3, and a cent lost per transfer is a real accounting problem.
   */
  it('stores the amount as an exact decimal, not a float', () => {
    const amount = storage.columns.find(
      (c) => c.target === PendingTransfer && c.propertyName === 'amount',
    );
    expect(String(amount?.options?.type)).toMatch(/decimal|numeric/i);
  });

  /** Claiming looks rows up by number and state on every signup. */
  it('indexes the columns the claim path filters on', () => {
    const sets = storage.indices
      .filter((i) => i.target === PendingTransfer)
      .map((i) => (i.columns as string[])?.join(','));
    expect(sets).toEqual(expect.arrayContaining(['recipientPhone,status']));
  });
});
