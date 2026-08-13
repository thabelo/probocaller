import { getMetadataArgsStorage } from 'typeorm';
import { SURVEY_STATUSES, Survey } from './survey.entity';

/**
 * One survey a business publishes. See docs/product/surveys-spec.md.
 *
 * The columns here are mostly about money being provably safe: publishing
 * debits and HOLDS `pricePerResponse × targetResponses` (§1.2), respondents are
 * paid out of that pot on completion (§1.3), and closing refunds
 * `held − paid`. Those three numbers have to be on the row, or the refund can
 * only be reconstructed by replaying the ledger.
 */
describe('Survey entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === Survey)
      .map((c) => c.propertyName);

  const column = (name: string) =>
    getMetadataArgsStorage().columns.find((c) => c.target === Survey && c.propertyName === name);

  it('belongs to the business that pays for it', () => {
    expect(columns()).toContain('businessId');
  });

  it('moves through draft → live → closed/expired', () => {
    expect([...SURVEY_STATUSES]).toEqual(['draft', 'live', 'closed', 'expired']);
  });

  it('starts as a draft, since publishing is what moves money', () => {
    expect(column('status')?.options.default).toBe('draft');
  });

  /**
   * The escrow triple. `totalHeld` is what was debited at publish, `totalPaid`
   * what respondents have earned so far; the refund on close is the difference.
   * `pricePerResponse` is FROZEN at publish — an admin retuning a question-type
   * rate afterwards must not change what an in-flight survey pays or owes.
   */
  it('records the escrow: price quoted, amount held, amount paid out', () => {
    expect(columns()).toEqual(
      expect.arrayContaining(['pricePerResponse', 'totalHeld', 'totalPaid', 'targetResponses']),
    );
  });

  it('holds money as fixed-point, never float', () => {
    for (const name of ['pricePerResponse', 'totalHeld', 'totalPaid']) {
      expect(column(name)?.options.type).toBe('decimal');
    }
  });

  /**
   * A survey closes when EITHER the response target is met or the time limit
   * passes, whichever comes first (§3.3). A null `expiresAt` is the
   * "indefinite" option — only the target can close it.
   */
  it('allows an indefinite lifetime via a nullable expiry', () => {
    expect(column('expiresAt')?.options.nullable).toBe(true);
  });

  it('timestamps publish and close, so the refund has an audit trail', () => {
    expect(columns()).toEqual(expect.arrayContaining(['publishedAt', 'closedAt']));
  });

  /**
   * Category and respondent filters are DIFFERENT fields (§3.2). Category is a
   * label for reporting; filters do the matching. Industry appears in both on
   * purpose — an insurer may survey the general public, or specifically people
   * working in insurance — so conflating them would make one of those
   * impossible.
   */
  it('keeps the reporting category separate from the matching filters', () => {
    expect(columns()).toEqual(expect.arrayContaining(['category', 'filtersJson']));
  });
});
