import { ENTITIES } from './entities';

/**
 * Guard: the canonical ENTITIES list is the single source of truth shared by
 * AppModule (TypeOrmModule.forRoot) and the migration CLI (data-source.ts).
 * Before this list existed, data-source.ts registered only 14 of the app's
 * entities, so migration tooling was blind to 13 tables (Withdrawal, BankAccount,
 * Conversation, Message, CallScreening, KYB, FICA, …) and a fresh-DB migration
 * could never build the full schema. If a new entity is added to the app, it
 * must be added here too — these assertions fail loudly otherwise.
 */
describe('canonical ENTITIES list (schema source of truth)', () => {
  const names = ENTITIES.map((e) => (e as { name: string }).name);

  it('registers every persisted entity (27 tables)', () => {
    expect(ENTITIES.length).toBeGreaterThanOrEqual(27);
  });

  it('includes the entities that were previously missing from data-source.ts', () => {
    const required = [
      'Withdrawal', 'BankAccount', 'Conversation', 'Message', 'CallScreening',
      'KybSubmission', 'KybDocument', 'FicaSubmission', 'FicaDocument',
      'SpamReport', 'ReportedSms', 'SmsDeletionLog', 'BlockedKeyword',
    ];
    expect(names).toEqual(expect.arrayContaining(required));
  });

  it('includes the original core entities', () => {
    const core = [
      'User', 'CallLog', 'CallRating', 'Setting', 'Business', 'BusinessNumber',
      'Transaction', 'PhoneReport', 'PhoneReportVote', 'CallPermissionRequest',
      'ProfileField', 'UserProfile', 'DataAccessLog', 'BusinessAudience',
    ];
    expect(names).toEqual(expect.arrayContaining(core));
  });

  it('registers the V1-hardening tables added this cycle', () => {
    expect(names).toEqual(expect.arrayContaining(['Feedback', 'AdminInvite', 'AuditLog', 'UserConsent', 'ErrorLog']));
  });

  // Person-to-person invites: the referral chain's origin record. Distinct from
  // AdminInvite, which grants an admin role.
  it('registers the Invite table', () => {
    expect(names).toContain('Invite');
  });

  it('has no duplicate entity classes', () => {
    expect(new Set(names).size).toBe(names.length);
  });
});
