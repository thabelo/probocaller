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
    it('returns the four category policies and the preset derived from them', async () => {
      const user = mockUser({
        dataShareEnabled: true,
        contactsCallPolicy: 'free', businessCallPolicy: 'paid', newCallPolicy: 'blocked', unknownCallPolicy: 'blocked',
      });
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.getPreferences(1);
      expect(result.dataShareEnabled).toBe(true);
      expect(result.contactsCallPolicy).toBe('free');
      expect(result.businessCallPolicy).toBe('paid');
      expect(result.newCallPolicy).toBe('blocked');
      expect(result.unknownCallPolicy).toBe('blocked');
      expect(result.callPermissionMode).toBe('contacts_paid_biz'); // derived preset
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

    it('maps a preset to the four categories and stores the derived mode', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { callPermissionMode: 'contacts_paid_biz' });
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.contactsCallPolicy).toBe('free');
      expect(saved.businessCallPolicy).toBe('paid');
      expect(saved.newCallPolicy).toBe('blocked');
      expect(saved.unknownCallPolicy).toBe('blocked');
      expect(saved.callPermissionMode).toBe('contacts_paid_biz');
      expect(saved.callBasePreset).toBe('contacts_paid_biz'); // picking a preset sets the base
    });

    it('a per-category override keeps the base preset and reads as custom', async () => {
      const user = mockUser({ callBasePreset: 'all_paid_biz' });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { newCallPolicy: 'paid', unknownCallPolicy: 'blocked' });
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.newCallPolicy).toBe('paid');
      expect(saved.unknownCallPolicy).toBe('blocked');
      expect(saved.callPermissionMode).toBe('custom'); // effective is off-preset
      expect(saved.callBasePreset).toBe('all_paid_biz'); // base unchanged by an override
    });

    it('persists the custom-group name and returns it', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const result = await service.updatePreferences(1, { newCallPolicy: 'blocked', callRuleName: 'No strangers' });
      expect(userRepo.save.mock.calls[0][0].callRuleName).toBe('No strangers');
      expect(result.callRuleName).toBe('No strangers');
    });

    it('clears the custom-group name when a preset is selected (no overrides left)', async () => {
      // A named custom group overriding business…
      const user = mockUser({
        callBasePreset: 'all_paid_biz',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
        callRuleName: 'No cold callers',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      // …then the user picks a plain preset (without resending callRuleName).
      const result = await service.updatePreferences(1, { callPermissionMode: 'all_paid_biz' });
      // Every category now matches the base, so the group name may not linger.
      expect(userRepo.save.mock.calls[0][0].callRuleName).toBe('');
      expect(result.callRuleName).toBe('');
    });

    it('clears the name when the last override is reverted', async () => {
      // Single override (business blocked) with a group name.
      const user = mockUser({
        callBasePreset: 'all_paid_biz',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
        callRuleName: 'No cold callers',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      // Revert business to base (paid); no overrides remain → name cleared.
      await service.updatePreferences(1, { businessCallPolicy: 'paid' });
      expect(userRepo.save.mock.calls[0][0].callRuleName).toBe('');
    });

    it('keeps the custom-group name while any override remains', async () => {
      // Two overrides (business + new blocked) named as one group.
      const user = mockUser({
        callBasePreset: 'all_paid_biz',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'blocked', unknownCallPolicy: 'free',
        callRuleName: 'Strict',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      // Revert business only; new is still blocked (override remains) → name kept.
      await service.updatePreferences(1, { businessCallPolicy: 'paid' });
      expect(userRepo.save.mock.calls[0][0].callRuleName).toBe('Strict');
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
  describe('isBusinessCallerAllowed — gated on the business dial', () => {
    it('allows a business caller when the business dial is paid', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, businessCallPolicy: 'paid' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(true);
    });

    it('allows a business caller when the business dial is free (tier 1, no charge)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, businessCallPolicy: 'free' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(true);
    });

    it('rejects a business caller when the business dial is blocked', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ id: 5, businessCallPolicy: 'blocked' }));
      expect(await service.isBusinessCallerAllowed(5, 3)).toBe(false);
    });
  });
});
