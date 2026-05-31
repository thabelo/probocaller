import { Test, TestingModule } from '@nestjs/testing';
import { ScamShieldService } from './scam-shield.service';
import { LookupService } from '../lookup/lookup.service';

/**
 * Scam Shield — risk scoring core (Cycle 1).
 *
 * Turns the crowd signals we already collect (global spam flag, community
 * report count, business verification, registration) into a single 0–100 scam
 * risk score with a level and human-readable reasons, so the app can warn the
 * user before they pick up.
 */
describe('ScamShieldService.scoreScamRisk', () => {
  // scoreScamRisk is pure; the LookupService dep is irrelevant here.
  const service = new ScamShieldService({} as any);

  it('treats a verified business as no risk', () => {
    expect(service.scoreScamRisk({ verifiedBusiness: true, registered: true })).toEqual({
      score: 0,
      level: 'low',
      reasons: ['Verified business'],
    });
  });

  it('scores a globally-marked spam number as maximum risk', () => {
    const r = service.scoreScamRisk({ globalSpam: true, registered: true });
    expect(r.score).toBe(100);
    expect(r.level).toBe('high');
    expect(r.reasons).toContain('Marked as spam globally');
  });

  it('scales with community reports (3 reports → medium)', () => {
    const r = service.scoreScamRisk({ communityReports: 3, registered: true });
    expect(r.score).toBe(54);
    expect(r.level).toBe('medium');
    expect(r.reasons).toContain('3 community spam report(s)');
  });

  it('caps the score at 100 for many reports', () => {
    const r = service.scoreScamRisk({ communityReports: 9, registered: true });
    expect(r.score).toBe(100); // 9 × 18 = 162, capped
    expect(r.level).toBe('high');
  });

  it('adds mild risk for an unregistered (unknown) caller', () => {
    const r = service.scoreScamRisk({ registered: false });
    expect(r.score).toBe(15);
    expect(r.level).toBe('low');
    expect(r.reasons).toContain('Caller not registered on Probo');
  });

  it('treats a clean, registered, reportless number as low risk', () => {
    expect(service.scoreScamRisk({ registered: true })).toEqual({
      score: 0,
      level: 'low',
      reasons: [],
    });
  });
});

/**
 * Scam Shield — assess a real number (Cycle 2).
 *
 * Pulls the live signals for a phone number from LookupService and runs them
 * through scoreScamRisk, returning the score alongside the lookup status.
 */
describe('ScamShieldService.assess', () => {
  let service: ScamShieldService;
  let lookup: { lookup: jest.Mock };

  beforeEach(async () => {
    lookup = { lookup: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScamShieldService,
        { provide: LookupService, useValue: lookup },
      ],
    }).compile();
    service = module.get(ScamShieldService);
  });

  it('maps a flagged lookup into a medium risk assessment', async () => {
    lookup.lookup.mockResolvedValue({
      phoneNumber: '+27821234567',
      found: true,
      status: 'flagged',
      flags: { globalSpam: false, userReports: 3, blocked: false },
      business: null,
      checkedAt: 'now',
    });

    const r = await service.assess('0821234567');

    expect(lookup.lookup).toHaveBeenCalledWith('0821234567');
    expect(r.phoneNumber).toBe('+27821234567');
    expect(r.status).toBe('flagged');
    expect(r.score).toBe(54);
    expect(r.level).toBe('medium');
    expect(r.reasons).toContain('3 community spam report(s)');
  });

  it('maps a verified business into a no-risk assessment', async () => {
    lookup.lookup.mockResolvedValue({
      phoneNumber: '+27110000000',
      found: true,
      status: 'verified_business',
      flags: { globalSpam: false, userReports: 0, blocked: false },
      business: { name: 'Acme', verified: true, industry: 'Finance' },
      checkedAt: 'now',
    });

    const r = await service.assess('+27110000000');
    expect(r.score).toBe(0);
    expect(r.level).toBe('low');
  });

  it('flags an unregistered number as low baseline risk', async () => {
    lookup.lookup.mockResolvedValue({
      phoneNumber: '+27999999999',
      found: false,
      status: 'not_registered',
      flags: { globalSpam: false, userReports: 0, blocked: false },
      business: null,
      checkedAt: 'now',
    });

    const r = await service.assess('+27999999999');
    expect(r.score).toBe(15);
    expect(r.reasons).toContain('Caller not registered on Probo');
  });
});
