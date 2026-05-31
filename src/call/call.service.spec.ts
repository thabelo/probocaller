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
