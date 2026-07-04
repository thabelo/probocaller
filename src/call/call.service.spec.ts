import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CallService } from './call.service';
import { CallLog } from './call.entity';
import { CallRating } from './call-rating.entity';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { Setting } from '../config/setting.entity';
import { TransactionService } from '../transaction/transaction.service';
import { DataBrokerService } from '../data-broker/data-broker.service';
import { ReferralService } from '../referral/referral.service';
import { DataSource } from 'typeorm';

const DEFAULT_RATE = 0.002;

const mockUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    phoneNumber: '+27821234567',
    email: 'test@probo.local',
    name: 'Test User',
    walletBalance: 10,
    isBusiness: false,
    notifications: [],
    spamList: [],
    allowedCallWindows: [],
    callPermissionMode: 'all',
    ...overrides,
  } as unknown as User);

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((data) => ({ ...data })),
  save: jest.fn(async (entity) => ({ id: 99, ...entity })),
  find: jest.fn(),
});

const mockSettingRepo = () => ({
  findOne: jest.fn().mockResolvedValue(null), // returns null → use default rate
});

// A spy-able EntityManager whose save returns the saved entity, matching how
// PayToContactService's tests model `dataSource.transaction(async (m) => …)`.
const makeManager = () => ({
  findOne: jest.fn(),
  save: jest.fn().mockImplementation(async (a: any, b?: any) => b ?? a),
});

describe('CallService — LOW_FUNDS blocking', () => {
  let service: CallService;
  let userRepo: ReturnType<typeof mockRepo>;
  let callRepo: ReturnType<typeof mockRepo>;
  let settingRepo: ReturnType<typeof mockSettingRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallService,
        { provide: getRepositoryToken(CallLog),    useFactory: mockRepo },
        { provide: getRepositoryToken(CallRating), useFactory: mockRepo },
        { provide: getRepositoryToken(User),       useFactory: mockRepo },
        { provide: getRepositoryToken(Business),   useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),    useFactory: mockSettingRepo },
        { provide: TransactionService, useValue: { log: jest.fn() } },
        { provide: DataBrokerService,  useValue: { hasApproval: jest.fn().mockResolvedValue(true) } },
        { provide: ReferralService, useValue: { payCommission: jest.fn().mockResolvedValue(undefined) } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service    = module.get(CallService);
    userRepo   = module.get(getRepositoryToken(User));
    callRepo   = module.get(getRepositoryToken(CallLog));
    settingRepo = module.get(getRepositoryToken(Setting));
  });

  // ─── Scenario 1: Caller (business) has empty wallet ──────────────────────────

  describe('when the CALLER is a business with empty wallet', () => {
    const caller = mockUser({ id: 1, isBusiness: true, walletBalance: 0 });
    const receiver = mockUser({ id: 2, phoneNumber: '+27829999999', isBusiness: false, walletBalance: 0 });

    beforeEach(() => {
      userRepo.findOne
        .mockResolvedValueOnce(caller)   // fromUser lookup
        .mockResolvedValueOnce(receiver) // toUser lookup
        .mockResolvedValue(caller);      // addNotification re-fetch
      userRepo.save.mockResolvedValue(caller);
    });

    it('returns blocked: true with voiceNote', async () => {
      const result = await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(result.blocked).toBe(true);
      expect(result.voiceNote).toBe(true);
    });

    it('sets blockedReason to LOW_FUNDS on the call log', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(callRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'blocked', blockedReason: 'LOW_FUNDS' }),
      );
    });

    it('saves the blocked call log to the database', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(callRepo.save).toHaveBeenCalledTimes(1);
    });

    it('notifies the CALLER (not receiver) about the block', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      // addNotification fetches user by id and saves — last save call carries the notification
      const saveArgs = userRepo.save.mock.calls.map((c: any[]) => c[0]);
      const notifSave = saveArgs.find((a: any) => Array.isArray(a.notifications) && a.notifications.length > 0);
      expect(notifSave).toBeDefined();
      expect(notifSave.id).toBe(caller.id);
      expect(notifSave.notifications[0].message).toMatch(/blocked|low|funds/i);
    });

    it('includes "load funds" in the returned message', async () => {
      const result = await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(result.message.toLowerCase()).toMatch(/funds/);
    });
  });

  // ─── Scenario 2: Receiver (business) has empty wallet ────────────────────────

  describe('when the RECEIVER is a business with empty wallet', () => {
    const caller   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });
    const receiver = mockUser({ id: 2, phoneNumber: '+27829999999', isBusiness: true, walletBalance: 0 });

    beforeEach(() => {
      userRepo.findOne
        .mockResolvedValueOnce(caller)    // fromUser
        .mockResolvedValueOnce(receiver)  // toUser
        .mockResolvedValue(receiver);     // addNotification re-fetch
      userRepo.save.mockResolvedValue(receiver);
    });

    it('returns blocked: true', async () => {
      const result = await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(result.blocked).toBe(true);
    });

    it('sets blockedReason to LOW_FUNDS', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(callRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ blockedReason: 'LOW_FUNDS' }),
      );
    });

    it('notifies the RECEIVER (wallet owner) — not the caller', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      const saveArgs = userRepo.save.mock.calls.map((c: any[]) => c[0]);
      const notifSave = saveArgs.find((a: any) => Array.isArray(a.notifications) && a.notifications.length > 0);
      expect(notifSave).toBeDefined();
      expect(notifSave.id).toBe(receiver.id);
    });
  });

  // ─── Scenario 3: Caller has sufficient funds → call proceeds ─────────────────

  describe('when the caller has sufficient funds', () => {
    const caller   = mockUser({ id: 1, isBusiness: true, walletBalance: 1.0 });
    const receiver = mockUser({ id: 2, phoneNumber: '+27829999999', isBusiness: false });

    beforeEach(() => {
      userRepo.findOne
        .mockResolvedValueOnce(caller)
        .mockResolvedValueOnce(receiver);
    });

    it('returns blocked: false and initiates the call', async () => {
      const result = await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(result.blocked).toBe(false);
    });

    it('creates a call log with status "initiated"', async () => {
      await service.initiateCall(caller.id, receiver.phoneNumber);
      expect(callRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'initiated' }),
      );
    });
  });
});

// ─── completeCall reward crediting (CALL_CHARGE / CALL_EARN) ──────────────────
describe('CallService — completeCall reward integrity', () => {
  let service: CallService;
  let userRepo: ReturnType<typeof mockRepo>;
  let callRepo: ReturnType<typeof mockRepo>;
  let txService: { log: jest.Mock };
  let referral: { payCommission: jest.Mock };
  let manager: ReturnType<typeof makeManager>;

  // Wire the wallet rows. completeCall first reads the caller (toUserId) via the
  // repository to gate on isBusiness, then re-reads BOTH wallet rows with write
  // locks via the transaction manager; addNotification re-fetches the earner via
  // the repository afterwards. Route every read by id.
  const wireWallets = (business: any, earner: any, call?: any) => {
    const byId = (id: number) =>
      id === business.id ? business : id === earner.id ? earner : null;
    userRepo.findOne.mockImplementation(async (opts: any) => byId(opts.where.id));
    // completeCall now re-reads + locks the CallLog row inside the tx (replay guard),
    // then the two wallet rows. Route CallLog -> the call, everything else by id.
    manager.findOne.mockImplementation(async (e: any, opts: any) =>
      e === CallLog ? call : byId(opts.where.id));
  };

  beforeEach(async () => {
    txService = { log: jest.fn() };
    referral = { payCommission: jest.fn().mockResolvedValue(undefined) };
    manager = makeManager();
    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: any) => cb(manager)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallService,
        { provide: getRepositoryToken(CallLog),    useFactory: mockRepo },
        { provide: getRepositoryToken(CallRating), useFactory: mockRepo },
        { provide: getRepositoryToken(User),       useFactory: mockRepo },
        { provide: getRepositoryToken(Business),   useFactory: mockRepo },
        { provide: getRepositoryToken(Setting),    useFactory: mockSettingRepo },
        { provide: TransactionService, useValue: txService },
        { provide: DataBrokerService,  useValue: { hasApproval: jest.fn().mockResolvedValue(true) } },
        { provide: ReferralService, useValue: referral },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service  = module.get(CallService);
    userRepo = module.get(getRepositoryToken(User));
    callRepo = module.get(getRepositoryToken(CallLog));
  });

  // Regression: a long call must not be able to charge the business beyond the
  // funds it actually holds. The initiation guard only checks ≥ 1 second of
  // funds, so a 3600s call at $0.002/s ($7.20) against a $1.00 wallet used to
  // drive the business balance to -$6.20 and credit the receiver earnings that
  // were never funded. stake() and purchaseLeads() both cap; completeCall must too.
  it('never charges a business below its available balance (no negative wallet, no phantom earnings)', async () => {
    const business = mockUser({ id: 2, isBusiness: true, walletBalance: 1.0 }); // call.toUserId — charged
    const earner   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });  // call.fromUserId — earns
    const call = { id: 50, fromUserId: 1, toUserId: 2, status: 'initiated', ratePerSecond: 0.002 };

    callRepo.findOne.mockResolvedValue(call);
    wireWallets(business, earner, call);

    await service.completeCall(2, 50, 3600); // 3600 * 0.002 = $7.20 gross vs $1.00 held

    // The business wallet must never go negative.
    expect(business.walletBalance).toBeGreaterThanOrEqual(0);

    // Ledger consistency: nothing credited beyond what was actually charged,
    // and never more than the business could afford.
    const charge = txService.log.mock.calls.find((c) => c[1] === 'CALL_CHARGE');
    const earn   = txService.log.mock.calls.find((c) => c[1] === 'CALL_EARN');
    const charged = charge ? Math.abs(Number(charge[2])) : 0;
    const earned  = earn ? Number(earn[2]) : 0;
    expect(charged).toBeLessThanOrEqual(1.0);
    expect(earned).toBeLessThanOrEqual(charged);
  });

  // Happy path: with ample funds the full call cost is charged and split
  // (24% platform cut), and the two parts always sum back to the charge.
  it('charges the full cost and splits it (platform cut + user earnings) when funds suffice', async () => {
    const business = mockUser({ id: 2, isBusiness: true, walletBalance: 100 });
    const earner   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });
    const call = { id: 51, fromUserId: 1, toUserId: 2, status: 'initiated', ratePerSecond: 0.002 };

    callRepo.findOne.mockResolvedValue(call);
    wireWallets(business, earner, call);

    const result = await service.completeCall(2, 51, 1000); // 1000 * 0.002 = $2.00 gross

    expect(result.cost).toBeCloseTo(2.0, 6);
    expect(result.platformCut).toBeCloseTo(0.48, 6);   // 2.00 * 0.24
    expect(result.userEarnings).toBeCloseTo(1.52, 6);  // 2.00 - 0.48
    // parts sum back to the charge — no money created or lost
    expect(result.platformCut + result.userEarnings).toBeCloseTo(result.cost, 6);
    expect(business.walletBalance).toBeCloseTo(98.0, 6);
    expect(earner.walletBalance).toBeCloseTo(1.52, 6);
  });

  it('charges + credits + logs all through the SAME transaction manager (atomicity)', async () => {
    const business = mockUser({ id: 2, isBusiness: true, walletBalance: 100 });
    const earner   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });
    const call = { id: 52, fromUserId: 1, toUserId: 2, status: 'initiated', ratePerSecond: 0.002 };

    callRepo.findOne.mockResolvedValue(call);
    wireWallets(business, earner, call);

    await service.completeCall(2, 52, 1000);

    // Both wallet rows were saved via the manager.
    const savedIds = manager.save.mock.calls.map((c: any[]) => (c[1] ?? c[0])?.id);
    expect(savedIds).toEqual(expect.arrayContaining([2, 1]));
    // Both ledger rows joined the same manager (last arg).
    const charge = txService.log.mock.calls.find((c) => c[1] === 'CALL_CHARGE');
    const earn   = txService.log.mock.calls.find((c) => c[1] === 'CALL_EARN');
    expect(charge[charge.length - 1]).toBe(manager);
    expect(earn[earn.length - 1]).toBe(manager);
  });

  it('pays the receiver’s referrer a 3% commission on the CALL_EARN via the same manager', async () => {
    const business = mockUser({ id: 2, isBusiness: true, walletBalance: 100 });
    const earner   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });
    const call = { id: 53, fromUserId: 1, toUserId: 2, status: 'initiated', ratePerSecond: 0.002 };

    callRepo.findOne.mockResolvedValue(call);
    wireWallets(business, earner, call);

    await service.completeCall(2, 53, 1000); // userEarnings = 1.52

    expect(referral.payCommission).toHaveBeenCalledWith(1, 1.52, manager);
  });

  it('idempotent: a second completeCall on an already-completed call pays NO extra commission', async () => {
    const completed = { id: 54, fromUserId: 1, toUserId: 2, status: 'completed', ratePerSecond: 0.002 };
    callRepo.findOne.mockResolvedValue(completed);

    const result = await service.completeCall(2, 54, 1000);

    expect(result).toBe(completed);
    expect(referral.payCommission).not.toHaveBeenCalled();
    expect(txService.log).not.toHaveBeenCalled();
  });

  // Regression: the replay guard must be re-checked UNDER LOCK inside the same
  // transaction as the money movement. If the outer read sees 'initiated' (a
  // concurrent request, or a crash/retry after a prior money-commit whose status
  // save was lost), the locked re-read sees 'completed' and the whole award must
  // no-op — otherwise the business is double-charged and the 3% commission is
  // double-paid. Mirrors PayToContactService.settle()'s escrowStatus guard.
  it('does not double-charge/double-pay when the locked call row is already completed', async () => {
    const business = mockUser({ id: 2, isBusiness: true, walletBalance: 100 });
    const earner   = mockUser({ id: 1, isBusiness: false, walletBalance: 0 });
    const outerCall  = { id: 55, fromUserId: 1, toUserId: 2, status: 'initiated', ratePerSecond: 0.002 };
    const lockedDone = { id: 55, fromUserId: 1, toUserId: 2, status: 'completed', ratePerSecond: 0.002 };
    callRepo.findOne.mockResolvedValue(outerCall); // outer guard sees 'initiated'
    const byId = (id: number) => (id === 2 ? business : id === 1 ? earner : null);
    userRepo.findOne.mockImplementation(async (opts: any) => byId(opts.where.id));
    manager.findOne.mockImplementation(async (e: any, opts: any) =>
      e === CallLog ? lockedDone : byId(opts.where.id)); // locked re-read sees 'completed'

    await service.completeCall(2, 55, 1000);

    expect(txService.log).not.toHaveBeenCalled();          // no CALL_CHARGE / CALL_EARN
    expect(referral.payCommission).not.toHaveBeenCalled();  // no commission
    expect(business.walletBalance).toBe(100);               // unchanged
    expect(earner.walletBalance).toBe(0);
  });
});
