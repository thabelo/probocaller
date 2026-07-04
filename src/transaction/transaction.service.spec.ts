import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionService } from './transaction.service';
import { Transaction } from './transaction.entity';

/**
 * Security regression — Backend H10.
 *
 * Wallet flows (withdraw, transfer, purchaseLeads) call `tx.log(...)` inside
 * a `dataSource.transaction(async manager => …)` block. With the old signature
 * the log call used its own repository (a NEW connection), so the audit row
 * was committed *independently* of the wallet move. Outcomes:
 *   - the wallet update rolls back but the audit row stays → false-positive
 *     audit entry showing money moved when it didn't.
 *   - the audit save throws and is swallowed by `.catch(() => {})` → audit
 *     gap, wallet move still committed.
 *
 * The fix lets callers pass the active EntityManager so the audit insert
 * joins the same transaction.
 */
describe('TransactionService.log — manager-aware (H10)', () => {
  let service: TransactionService;
  let repo: any;

  beforeEach(async () => {
    repo = { create: jest.fn((d) => ({ ...d })), save: jest.fn(async (x) => x) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
      ],
    }).compile();
    service = module.get(TransactionService);
  });

  it('writes via its own repository when no manager is supplied (legacy behaviour preserved)', async () => {
    await service.log(1, 'CREDIT_ADDED', 10, 'topup');
    expect(repo.save).toHaveBeenCalledTimes(1);
  });

  it('writes via the passed manager when one is supplied (joins caller’s transaction)', async () => {
    const manager: any = {
      create: jest.fn((_e: any, data: any) => ({ ...data })),
      save:   jest.fn(async (_e: any, x: any) => x),
    };
    await service.log(1, 'WITHDRAWAL_REQUESTED', -50, 'w', undefined, manager);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(Transaction, expect.objectContaining({
      userId: 1, type: 'WITHDRAWAL_REQUESTED', amount: -50,
    }));
    // Must NOT have hit the repo — would mean a separate connection / commit.
    expect(repo.save).not.toHaveBeenCalled();
  });
});

/**
 * sumByUserAndType — total of a user's transactions of one type.
 *
 * Powers the referral-earnings figure on GET /user/referral-code: the
 * lifetime SUM(amount) of a referrer's REFERRAL_COMMISSION credits. The DB
 * returns the SUM as a string (decimal column) or null when no rows match;
 * the service must COALESCE-to-0 and normalise to a 4dp Number so callers get
 * clean money values, never a string or NaN.
 */
describe('TransactionService.sumByUserAndType', () => {
  let service: TransactionService;
  let repo: any;
  let qb: any;

  const makeQb = (raw: any) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(raw),
  });

  beforeEach(async () => {
    repo = { createQueryBuilder: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
      ],
    }).compile();
    service = module.get(TransactionService);
  });

  it('sums multiple matching rows for the user+type and returns a 4dp Number', async () => {
    qb = makeQb({ sum: '15.5000' });
    repo.createQueryBuilder.mockReturnValue(qb);

    const total = await service.sumByUserAndType(7, 'REFERRAL_COMMISSION');

    expect(total).toBe(15.5);
    expect(typeof total).toBe('number');
    // Filters on both userId and type.
    const whereArg = JSON.stringify(qb.where.mock.calls);
    const andWhereArg = JSON.stringify(qb.andWhere.mock.calls);
    expect(whereArg + andWhereArg).toContain('userId');
    expect(whereArg + andWhereArg).toContain('type');
    expect(qb.where).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 7 }));
    expect(qb.andWhere).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'REFERRAL_COMMISSION' }));
  });

  it('returns 0 when there are no matching rows (COALESCE null -> 0)', async () => {
    qb = makeQb({ sum: null });
    repo.createQueryBuilder.mockReturnValue(qb);

    const total = await service.sumByUserAndType(7, 'REFERRAL_COMMISSION');

    expect(total).toBe(0);
  });

  it('isolates by user and type — only the matching subset is summed at the DB layer', async () => {
    // The service must scope the query to (userId, type); the DB returns just
    // that subset's SUM. We assert both predicates are bound so other types /
    // other users cannot leak into the figure.
    qb = makeQb({ sum: '3.3300' });
    repo.createQueryBuilder.mockReturnValue(qb);

    const total = await service.sumByUserAndType(42, 'CALL_EARN');

    expect(total).toBe(3.33);
    expect(qb.where).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 42 }));
    expect(qb.andWhere).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: 'CALL_EARN' }));
  });
});

/**
 * sumByType — platform-wide SUM(amount) of one transaction type across ALL
 * users. Powers the admin "earnings from invitees" figure (the total of every
 * REFERRAL_COMMISSION credit). Same string/null → clean 4dp Number contract as
 * sumByUserAndType, but scoped to type only.
 */
describe('TransactionService.sumByType', () => {
  let service: TransactionService;
  let repo: any;
  let qb: any;

  const makeQb = (raw: any) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(raw),
  });

  beforeEach(async () => {
    repo = { createQueryBuilder: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
      ],
    }).compile();
    service = module.get(TransactionService);
  });

  it('sums every matching row of a type across all users as a 4dp Number', async () => {
    qb = makeQb({ sum: '42.2500' });
    repo.createQueryBuilder.mockReturnValue(qb);

    const total = await service.sumByType('REFERRAL_COMMISSION');

    expect(total).toBe(42.25);
    expect(typeof total).toBe('number');
    expect(qb.where).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'REFERRAL_COMMISSION' }),
    );
  });

  it('returns 0 when there are no matching rows (COALESCE null -> 0)', async () => {
    qb = makeQb({ sum: null });
    repo.createQueryBuilder.mockReturnValue(qb);

    expect(await service.sumByType('REFERRAL_COMMISSION')).toBe(0);
  });
});
