import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmsInsightService, SMS_ANALYSER } from './sms-insight.service';
import { SmsInsight } from './sms-insight.entity';
import { User } from '../user/user.entity';
import { ProfileService } from '../profile/profile.service';

describe('SmsInsightService', () => {
  let service: SmsInsightService;
  let userRepo: any;
  let insightRepo: any;
  let analyser: any;
  let profiles: any;

  const build = async (consent = true) => {
    userRepo = { findOne: jest.fn().mockResolvedValue({ id: 7, smsAnalysisConsent: consent }) };
    insightRepo = {
      create: jest.fn((r: any) => r),
      save: jest.fn(async (rows: any) => (Array.isArray(rows) ? rows : [rows]).map((r, i) => ({ id: i + 1, ...r }))),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };
    analyser = {
      analyse: jest.fn().mockReturnValue({
        profileSuggestions: [{ fieldKey: 'has_children', suggestedValue: 'true', confidence: 0.6, evidence: 'a new baby' }],
        surveySuggestions: [{ prompt: 'How is your medical aid?', type: 'yes_no', reason: 'recurring' }],
      }),
    };
    profiles = {
      getMyProfile: jest.fn().mockResolvedValue({ data: { province: 'gp' } }),
      updateMyProfile: jest.fn().mockResolvedValue({}),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SmsInsightService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(SmsInsight), useValue: insightRepo },
        { provide: SMS_ANALYSER, useValue: analyser },
        { provide: ProfileService, useValue: profiles },
      ],
    }).compile();
    service = mod.get(SmsInsightService);
    return service;
  };

  const messages = [{ body: 'Congratulations on your new baby', address: '+2782', receivedAt: new Date() }];

  describe('the consent gate', () => {
    it('refuses to analyse when the user has not consented', async () => {
      await build(false);
      await expect(service.analyseForUser(7, messages)).rejects.toBeInstanceOf(ForbiddenException);
      expect(analyser.analyse).not.toHaveBeenCalled();
    });

    it('never even looks at the messages without consent', async () => {
      await build(false);
      await service.analyseForUser(7, messages).catch(() => undefined);
      expect(analyser.analyse).not.toHaveBeenCalled();
    });

    it('analyses when the user HAS consented', async () => {
      await build(true);
      await service.analyseForUser(7, messages);
      expect(analyser.analyse).toHaveBeenCalledWith(messages);
    });
  });

  describe('storing suggestions', () => {
    it('stores a profile suggestion and a survey suggestion, both pending', async () => {
      await build(true);
      await service.analyseForUser(7, messages);
      const saved = insightRepo.create.mock.calls.map(([r]: any[]) => r);
      expect(saved.some((r: any) => r.kind === 'profile_field' && r.fieldKey === 'has_children' && r.status === 'pending')).toBe(true);
      expect(saved.some((r: any) => r.kind === 'survey_question' && r.prompt && r.status === 'pending')).toBe(true);
    });

    it('stores the evidence label but NEVER the raw SMS text', async () => {
      await build(true);
      await service.analyseForUser(7, messages);
      const saved = JSON.stringify(insightRepo.create.mock.calls);
      expect(saved).not.toContain('Congratulations on your new baby');
    });

    it('supersedes prior PENDING suggestions on a fresh pass', async () => {
      await build(true);
      await service.analyseForUser(7, messages);
      expect(insightRepo.delete).toHaveBeenCalledWith({ userId: 7, status: 'pending' });
    });
  });

  describe('acting on a suggestion', () => {
    it('dismisses one that belongs to the user', async () => {
      await build(true);
      insightRepo.findOne.mockResolvedValue({ id: 5, userId: 7, kind: 'profile_field', status: 'pending' });
      insightRepo.save.mockImplementation(async (r: any) => r);
      const out = await service.resolve(7, 5, 'dismissed');
      expect(out.status).toBe('dismissed');
    });

    it("refuses to touch another user's suggestion", async () => {
      await build(true);
      insightRepo.findOne.mockResolvedValue({ id: 5, userId: 99, status: 'pending' });
      await expect(service.resolve(7, 5, 'dismissed')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('applying a profile suggestion', () => {
    it('merges the field into the profile through the ordinary update path', async () => {
      await build(true);
      insightRepo.findOne.mockResolvedValue({ id: 5, userId: 7, kind: 'profile_field', fieldKey: 'has_children', suggestedValue: 'true', status: 'pending' });
      insightRepo.save.mockImplementation(async (r: any) => r);
      const out = await service.applyProfileSuggestion(7, 5);
      // carries the existing data plus the applied field, so nothing is dropped
      expect(profiles.updateMyProfile).toHaveBeenCalledWith(7, { data: { province: 'gp', has_children: 'true' } });
      expect(out.status).toBe('applied');
    });

    it("refuses to apply another user's suggestion", async () => {
      await build(true);
      insightRepo.findOne.mockResolvedValue({ id: 5, userId: 99, kind: 'profile_field', fieldKey: 'x', status: 'pending' });
      await expect(service.applyProfileSuggestion(7, 5)).rejects.toBeInstanceOf(ForbiddenException);
      expect(profiles.updateMyProfile).not.toHaveBeenCalled();
    });
  });
});
