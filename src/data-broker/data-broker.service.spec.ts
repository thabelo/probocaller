import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataBrokerService } from './data-broker.service';
import { User } from '../user/user.entity';
import { CallPermissionRequest } from './call-permission-request.entity';
import { Business } from '../business/business.entity';
import { PayToContactService } from '../pay-to-contact/pay-to-contact.service';

const mockRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
});

const mockUser = (overrides = {}): User =>
  ({
    id: 1,
    phoneNumber: '+27821234567',
    dataShareEnabled: false,
    callPermissionMode: 'all',
    walletBalance: 0,
    ...overrides,
  } as User);

describe('DataBrokerService', () => {
  let service: DataBrokerService;
  let userRepo: ReturnType<typeof mockRepo>;
  let permissionRepo: ReturnType<typeof mockRepo>;
  let businessRepo: ReturnType<typeof mockRepo>;
  let payToContact: { stake: jest.Mock; settle: jest.Mock; refund: jest.Mock };

  beforeEach(async () => {
    payToContact = {
      stake: jest.fn().mockResolvedValue(undefined),
      settle: jest.fn().mockResolvedValue(undefined),
      refund: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataBrokerService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(CallPermissionRequest), useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: PayToContactService, useValue: payToContact },
      ],
    }).compile();

    service = module.get(DataBrokerService);
    userRepo = module.get(getRepositoryToken(User));
    permissionRepo = module.get(getRepositoryToken(CallPermissionRequest));
    businessRepo = module.get(getRepositoryToken(Business));
  });

  describe('getPreferences', () => {
    it('returns dataShareEnabled and callPermissionMode for the user', async () => {
      const user = mockUser({ dataShareEnabled: true, callPermissionMode: 'approved_only' });
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.getPreferences(1);
      expect(result.dataShareEnabled).toBe(true);
      expect(result.callPermissionMode).toBe('approved_only');
    });
  });

  describe('updatePreferences', () => {
    it('persists dataShareEnabled change', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));

      await service.updatePreferences(1, { dataShareEnabled: true });

      expect(userRepo.save.mock.calls[0][0].dataShareEnabled).toBe(true);
    });

    it('persists incognitoEnabled (premium incognito toggle)', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const result = await service.updatePreferences(1, { incognitoEnabled: true } as any);
      expect(userRepo.save.mock.calls[0][0].incognitoEnabled).toBe(true);
      expect(result.incognitoEnabled).toBe(true);
    });

    it('saves valid callPermissionMode', async () => {
      // DTO validation rejects invalid values at the controller layer.
      // The service itself saves whatever arrives — test that it persists.
      const user = mockUser();
      userRepo.findOne.mockResolvedValueOnce(user).mockResolvedValueOnce(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { callPermissionMode: 'approved_only' });
      expect(userRepo.save.mock.calls[0][0].callPermissionMode).toBe('approved_only');
    });
  });

  describe('respondToRequest — Pay-to-Contact settlement', () => {
    it('settles the escrow when the user approves a held request', async () => {
      const request = { id: 7, userId: 1, status: 'pending', escrowStatus: 'held' };
      permissionRepo.findOne.mockResolvedValue(request);
      permissionRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await service.respondToRequest(1, 7, true);

      expect(payToContact.settle).toHaveBeenCalledWith(7);
      expect(payToContact.refund).not.toHaveBeenCalled();
    });

    it('refunds the escrow when the user rejects a held request', async () => {
      const request = { id: 7, userId: 1, status: 'pending', escrowStatus: 'held' };
      permissionRepo.findOne.mockResolvedValue(request);
      permissionRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await service.respondToRequest(1, 7, false);

      expect(payToContact.refund).toHaveBeenCalledWith(7);
      expect(payToContact.settle).not.toHaveBeenCalled();
    });

    it('does not touch escrow when none is held', async () => {
      const request = { id: 7, userId: 1, status: 'pending', escrowStatus: 'none' };
      permissionRepo.findOne.mockResolvedValue(request);
      permissionRepo.save.mockImplementation((r: any) => Promise.resolve(r));

      await service.respondToRequest(1, 7, true);

      expect(payToContact.settle).not.toHaveBeenCalled();
      expect(payToContact.refund).not.toHaveBeenCalled();
    });
  });

  describe('requestCallPermission — Pay-to-Contact stake', () => {
    beforeEach(() => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme', userId: 2 });
      userRepo.findOne.mockResolvedValue(mockUser({ id: 9, notifications: [] }));
      userRepo.save.mockImplementation((u: any) => Promise.resolve(u));
      permissionRepo.findOne.mockResolvedValue(null); // no pending duplicate
      permissionRepo.create.mockImplementation((r: any) => r);
      permissionRepo.save.mockImplementation((r: any) => Promise.resolve({ id: 50, ...r }));
    });

    it('stakes the bid against the new request when a bidAmount is given', async () => {
      await service.requestCallPermission(2, { targetUserId: 9, bidAmount: 40 } as any);
      expect(payToContact.stake).toHaveBeenCalledWith(2, 50, 40);
    });

    it('does not stake when no bid is given', async () => {
      await service.requestCallPermission(2, { targetUserId: 9 } as any);
      expect(payToContact.stake).not.toHaveBeenCalled();
    });

    it('falls back to the business default bid when no explicit bid is given', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme', userId: 2, defaultBidAmount: 25 });
      await service.requestCallPermission(2, { targetUserId: 9 } as any);
      expect(payToContact.stake).toHaveBeenCalledWith(2, 50, 25);
    });

    it('coerces a decimal-as-string default bid (Postgres numeric) before staking', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme', userId: 2, defaultBidAmount: '25' });
      await service.requestCallPermission(2, { targetUserId: 9 } as any);
      expect(payToContact.stake).toHaveBeenCalledWith(2, 50, 25);
    });

    it('an explicit bid overrides the business default', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme', userId: 2, defaultBidAmount: 25 });
      await service.requestCallPermission(2, { targetUserId: 9, bidAmount: 40 } as any);
      expect(payToContact.stake).toHaveBeenCalledWith(2, 50, 40);
    });

    it('does not stake when neither an explicit bid nor a positive default exists', async () => {
      businessRepo.findOne.mockResolvedValue({ id: 3, companyName: 'Acme', userId: 2, defaultBidAmount: 0 });
      await service.requestCallPermission(2, { targetUserId: 9 } as any);
      expect(payToContact.stake).not.toHaveBeenCalled();
    });
  });

  // Whether a business caller may reach a recipient, per the recipient's own
  // call-permission mode. Used to auto-reject a disallowed incoming call before
  // it rings — mirrors the gate in CallService.initiateCall.
  describe('isBusinessCallerAllowed', () => {
    it('allows the caller when the recipient accepts ALL calls', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'all' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(true);
    });

    it('allows the caller under EVERYONE (personal + paid business)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'everyone' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(true);
    });

    it('rejects the caller when the recipient accepts NO business calls', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'none' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(false);
    });

    it('under APPROVED_ONLY, allows only an approved business', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'approved_only' }));
      permissionRepo.findOne.mockResolvedValue({ id: 1, businessId: 3, userId: 5, status: 'approved' });
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(true);
    });

    it('under APPROVED_ONLY, rejects an unapproved business', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'approved_only' }));
      permissionRepo.findOne.mockResolvedValue(null);
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(false);
    });

    it('under APPROVED_ONLY with no identifiable business, rejects', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, callPermissionMode: 'approved_only' }));
      expect(await service.isBusinessCallerAllowed(5, null)).toBe(false);
    });
  });
});
