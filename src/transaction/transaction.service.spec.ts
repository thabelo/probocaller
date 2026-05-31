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
