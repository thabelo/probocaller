import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataBrokerService } from './data-broker.service';
import { User } from '../user/user.entity';
import { CallPermissionRequest } from './call-permission-request.entity';
import { Business } from '../business/business.entity';
import { PayToContactService } from '../pay-to-contact/pay-to-contact.service';
import { ProfileService } from '../profile/profile.service';

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

  let profileService: { sharableCandidateKeys: jest.Mock };

  beforeEach(async () => {
    payToContact = {
      stake: jest.fn().mockResolvedValue(undefined),
      settle: jest.fn().mockResolvedValue(undefined),
      refund: jest.fn().mockResolvedValue(undefined),
    };
    profileService = { sharableCandidateKeys: jest.fn().mockResolvedValue([]) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataBrokerService,
        { provide: getRepositoryToken(User), useFactory: mockRepo },
        { provide: getRepositoryToken(CallPermissionRequest), useFactory: mockRepo },
        { provide: getRepositoryToken(Business), useFactory: mockRepo },
        { provide: PayToContactService, useValue: payToContact },
        { provide: ProfileService, useValue: profileService },
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

    it('turning data sharing ON selects every filled profile field (share-all-filled)', async () => {
      const user = mockUser({ dataShareEnabled: false, dataCategories: [] });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      profileService.sharableCandidateKeys.mockResolvedValue(['income_range', 'marital_status']);
      const result = await service.updatePreferences(1, { dataShareEnabled: true });
      expect(profileService.sharableCandidateKeys).toHaveBeenCalledWith(1);
      expect(userRepo.save.mock.calls[0][0].dataCategories).toEqual(['income_range', 'marital_status']);
      expect(result.dataCategories).toEqual(['income_range', 'marital_status']);
    });

    it('an explicit dataCategories wins over the auto-select on enable (deselect respected)', async () => {
      const user = mockUser({ dataShareEnabled: false, dataCategories: [] });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { dataShareEnabled: true, dataCategories: ['income_range'] });
      expect(profileService.sharableCandidateKeys).not.toHaveBeenCalled();
      expect(userRepo.save.mock.calls[0][0].dataCategories).toEqual(['income_range']);
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

  });

  // Custom rules are standalone named policies that sit BESIDE the six preset
  // tiers in one radio group: exactly one thing — a tier or a rule — is active.
  describe('custom call rules — multiple, selectable, deletable', () => {
    const workHours = {
      id: 'r1', name: 'Work hours',
      contacts: 'free', business: 'blocked', newCaller: 'free', unknown: 'free',
    };
    const strict = {
      id: 'r2', name: 'Strict',
      contacts: 'paid', business: 'blocked', newCaller: 'blocked', unknown: 'blocked',
    };

    it('getPreferences returns the rule list and the selection (defaults: empty)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      const result: any = await service.getPreferences(1);
      expect(result.customCallRules).toEqual([]);
      expect(result.selectedCustomRuleId).toBe('');
    });

    it('persists a replaced rule list and returns it', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const result: any = await service.updatePreferences(1, { customCallRules: [workHours] } as any);
      expect(userRepo.save.mock.calls[0][0].customCallRules).toEqual([workHours]);
      expect(result.customCallRules).toEqual([workHours]);
    });

    it('selecting a rule applies its four policies and records the selection', async () => {
      const user = mockUser({ callBasePreset: 'all_paid_biz', customCallRules: [workHours, strict] });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { selectedCustomRuleId: 'r2' } as any);
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('r2');
      expect(saved.contactsCallPolicy).toBe('paid');
      expect(saved.businessCallPolicy).toBe('blocked');
      expect(saved.newCallPolicy).toBe('blocked');
      expect(saved.unknownCallPolicy).toBe('blocked');
      expect(saved.callBasePreset).toBe('all_paid_biz'); // base tier remembered for revert
    });

    it('creating and selecting a rule in one PUT applies the new rule', async () => {
      const user = mockUser({ callBasePreset: 'all_paid_biz' });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { customCallRules: [workHours], selectedCustomRuleId: 'r1' } as any);
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('r1');
      expect(saved.businessCallPolicy).toBe('blocked');
    });

    it('selecting a preset tier deselects the custom rule', async () => {
      const user = mockUser({
        callBasePreset: 'all_paid_biz', customCallRules: [workHours], selectedCustomRuleId: 'r1',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const result: any = await service.updatePreferences(1, { callPermissionMode: 'contacts_only' });
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('');
      expect(saved.callBasePreset).toBe('contacts_only');
      expect(saved.businessCallPolicy).toBe('blocked');
      expect(result.customCallRules).toEqual([workHours]); // the rule itself survives
    });

    it('selectedCustomRuleId: "" reverts to the base tier policies', async () => {
      const user = mockUser({
        callBasePreset: 'all_paid_biz', customCallRules: [workHours], selectedCustomRuleId: 'r1',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { selectedCustomRuleId: '' } as any);
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('');
      expect(saved.businessCallPolicy).toBe('paid'); // back to all_paid_biz
    });

    it('deleting the selected rule reverts to the base tier', async () => {
      const user = mockUser({
        callBasePreset: 'all_paid_biz', customCallRules: [workHours, strict], selectedCustomRuleId: 'r1',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      // Delete = resend the list without r1.
      await service.updatePreferences(1, { customCallRules: [strict] } as any);
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('');
      expect(saved.businessCallPolicy).toBe('paid'); // all_paid_biz restored
      expect(saved.customCallRules).toEqual([strict]);
    });

    it('deleting an unselected rule leaves policies and selection alone', async () => {
      const user = mockUser({
        callBasePreset: 'all_paid_biz', customCallRules: [workHours, strict], selectedCustomRuleId: 'r1',
        contactsCallPolicy: 'free', businessCallPolicy: 'blocked', newCallPolicy: 'free', unknownCallPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { customCallRules: [workHours] } as any);
      const saved = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomRuleId).toBe('r1');
      expect(saved.businessCallPolicy).toBe('blocked'); // untouched
    });

    it('rejects a rule with an empty name', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      await expect(
        service.updatePreferences(1, { customCallRules: [{ ...workHours, name: '  ' }] } as any),
      ).rejects.toThrow(/name/i);
    });

    it('rejects duplicate rule names (case-insensitive)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      await expect(
        service.updatePreferences(1, {
          customCallRules: [workHours, { ...strict, name: 'work HOURS' }],
        } as any),
      ).rejects.toThrow(/name/i);
    });

    it('rejects selecting a rule id that does not exist', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ customCallRules: [workHours] }));
      await expect(
        service.updatePreferences(1, { selectedCustomRuleId: 'nope' } as any),
      ).rejects.toThrow(/rule/i);
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
