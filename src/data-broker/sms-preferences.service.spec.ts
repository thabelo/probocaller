import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataBrokerService } from './data-broker.service';
import { User } from '../user/user.entity';
import { CallPermissionRequest } from './call-permission-request.entity';
import { Business } from '../business/business.entity';
import { PayToContactService } from '../pay-to-contact/pay-to-contact.service';
import { ProfileService } from '../profile/profile.service';

// SMS permissions are an INDEPENDENT, parallel sibling of the call-policy
// system (see sms-policy.ts) — same shape (preset / base / four categories /
// custom rules), different storage columns, no shared state whatsoever.

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

describe('DataBrokerService — SMS permissions', () => {
  let service: DataBrokerService;
  let userRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const payToContact = {
      stake: jest.fn().mockResolvedValue(undefined),
      settle: jest.fn().mockResolvedValue(undefined),
      refund: jest.fn().mockResolvedValue(undefined),
    };
    const profileService = { sharableCandidateKeys: jest.fn().mockResolvedValue([]) };
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
  });

  describe('getPreferences — SMS', () => {
    it('returns the four SMS category policies and the preset derived from them', async () => {
      const user = mockUser({
        contactsSmsPolicy: 'free', businessSmsPolicy: 'paid', newSmsPolicy: 'blocked', unknownSmsPolicy: 'blocked',
      });
      userRepo.findOne.mockResolvedValue(user);

      const result: any = await service.getPreferences(1);
      expect(result.contactsSmsPolicy).toBe('free');
      expect(result.businessSmsPolicy).toBe('paid');
      expect(result.newSmsPolicy).toBe('blocked');
      expect(result.unknownSmsPolicy).toBe('blocked');
      expect(result.smsPermissionMode).toBe('contacts_paid_biz'); // derived preset
      expect(result.customSmsRules).toEqual([]);
      expect(result.selectedCustomSmsRuleId).toBe('');
    });
  });

  describe('updatePreferences — SMS preset & overrides', () => {
    it('maps an SMS preset to the four categories and stores the derived mode', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { smsPermissionMode: 'contacts_paid_biz' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.contactsSmsPolicy).toBe('free');
      expect(saved.businessSmsPolicy).toBe('paid');
      expect(saved.newSmsPolicy).toBe('blocked');
      expect(saved.unknownSmsPolicy).toBe('blocked');
      expect(saved.smsPermissionMode).toBe('contacts_paid_biz');
      expect(saved.smsBasePreset).toBe('contacts_paid_biz');
    });

    it('a per-category SMS override keeps the base preset and reads as custom', async () => {
      const user = mockUser({ smsBasePreset: 'all_paid_biz' });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { newSmsPolicy: 'paid', unknownSmsPolicy: 'blocked' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.newSmsPolicy).toBe('paid');
      expect(saved.unknownSmsPolicy).toBe('blocked');
      expect(saved.smsPermissionMode).toBe('custom');
      expect(saved.smsBasePreset).toBe('all_paid_biz');
    });
  });

  describe('custom SMS rules — multiple, selectable, deletable', () => {
    const workHours = {
      id: 'r1', name: 'Work hours',
      contacts: 'free', business: 'blocked', newSender: 'free', unknown: 'free',
    };
    const strict = {
      id: 'r2', name: 'Strict',
      contacts: 'paid', business: 'blocked', newSender: 'blocked', unknown: 'blocked',
    };

    it('persists a replaced SMS rule list and returns it', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const result: any = await service.updatePreferences(1, { customSmsRules: [workHours] } as any);
      expect(userRepo.save.mock.calls[0][0].customSmsRules).toEqual([workHours]);
      expect(result.customSmsRules).toEqual([workHours]);
    });

    it('selecting an SMS rule applies its four policies and records the selection', async () => {
      const user = mockUser({ smsBasePreset: 'all_paid_biz', customSmsRules: [workHours, strict] });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { selectedCustomSmsRuleId: 'r2' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomSmsRuleId).toBe('r2');
      expect(saved.contactsSmsPolicy).toBe('paid');
      expect(saved.businessSmsPolicy).toBe('blocked');
      expect(saved.newSmsPolicy).toBe('blocked');
      expect(saved.unknownSmsPolicy).toBe('blocked');
      expect(saved.smsBasePreset).toBe('all_paid_biz');
    });

    it('selectedCustomSmsRuleId: "" reverts to the SMS base tier policies', async () => {
      const user = mockUser({
        smsBasePreset: 'all_paid_biz', customSmsRules: [workHours], selectedCustomSmsRuleId: 'r1',
        contactsSmsPolicy: 'free', businessSmsPolicy: 'blocked', newSmsPolicy: 'free', unknownSmsPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { selectedCustomSmsRuleId: '' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomSmsRuleId).toBe('');
      expect(saved.businessSmsPolicy).toBe('paid'); // back to all_paid_biz
    });

    it('deleting the selected SMS rule reverts to the base tier', async () => {
      const user = mockUser({
        smsBasePreset: 'all_paid_biz', customSmsRules: [workHours, strict], selectedCustomSmsRuleId: 'r1',
        contactsSmsPolicy: 'free', businessSmsPolicy: 'blocked', newSmsPolicy: 'free', unknownSmsPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { customSmsRules: [strict] } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.selectedCustomSmsRuleId).toBe('');
      expect(saved.businessSmsPolicy).toBe('paid');
      expect(saved.customSmsRules).toEqual([strict]);
    });

    it('rejects an SMS rule with an empty name', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      await expect(
        service.updatePreferences(1, { customSmsRules: [{ ...workHours, name: '  ' }] } as any),
      ).rejects.toThrow(/name/i);
    });

    it('rejects duplicate SMS rule names (case-insensitive)', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      await expect(
        service.updatePreferences(1, {
          customSmsRules: [workHours, { ...strict, name: 'work HOURS' }],
        } as any),
      ).rejects.toThrow(/name/i);
    });

    it('allows a call rule and an SMS rule to share the same name (independent uniqueness scopes)', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      const shared = { id: 'x1', name: 'Shared Name', contacts: 'free', business: 'blocked', newCaller: 'free', unknown: 'free' };
      const sharedSms = { ...shared, id: 'x2', newSender: 'free' };
      delete (sharedSms as any).newCaller;
      await expect(
        service.updatePreferences(1, { customCallRules: [shared], customSmsRules: [sharedSms] } as any),
      ).resolves.toBeDefined();
    });

    it('rejects selecting an SMS rule id that does not exist', async () => {
      userRepo.findOne.mockResolvedValue(mockUser({ customSmsRules: [workHours] }));
      await expect(
        service.updatePreferences(1, { selectedCustomSmsRuleId: 'nope' } as any),
      ).rejects.toThrow(/rule/i);
    });
  });

  describe('independence from call permissions', () => {
    it('updating the SMS policy does not alter any call-policy column', async () => {
      const user = mockUser({
        callBasePreset: 'all_paid_biz',
        contactsCallPolicy: 'free', businessCallPolicy: 'paid', newCallPolicy: 'free', unknownCallPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { smsPermissionMode: 'dnd' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.smsPermissionMode).toBe('dnd');
      // call columns untouched
      expect(saved.contactsCallPolicy).toBe('free');
      expect(saved.businessCallPolicy).toBe('paid');
      expect(saved.newCallPolicy).toBe('free');
      expect(saved.unknownCallPolicy).toBe('free');
      expect(saved.callBasePreset).toBe('all_paid_biz');
    });

    it('updating the call policy does not alter any SMS-policy column', async () => {
      const user = mockUser({
        smsBasePreset: 'all_paid_biz',
        contactsSmsPolicy: 'free', businessSmsPolicy: 'paid', newSmsPolicy: 'free', unknownSmsPolicy: 'free',
      });
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));
      await service.updatePreferences(1, { callPermissionMode: 'dnd' } as any);
      const saved: any = userRepo.save.mock.calls[0][0];
      expect(saved.callPermissionMode).toBe('dnd');
      // SMS columns untouched
      expect(saved.contactsSmsPolicy).toBe('free');
      expect(saved.businessSmsPolicy).toBe('paid');
      expect(saved.newSmsPolicy).toBe('free');
      expect(saved.unknownSmsPolicy).toBe('free');
      expect(saved.smsBasePreset).toBe('all_paid_biz');
    });
  });
});
