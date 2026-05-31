import { Test, TestingModule } from '@nestjs/testing';
import { ScamShieldController } from './scam-shield.controller';
import { ScamShieldService } from './scam-shield.service';

/**
 * Scam Shield — HTTP endpoint (Cycle 3).
 *
 * GET /scam-shield/:phoneNumber returns the real-time scam assessment for a
 * number. Thin controller — it just delegates to the service.
 */
describe('ScamShieldController', () => {
  let controller: ScamShieldController;
  let service: { assess: jest.Mock };

  beforeEach(async () => {
    service = { assess: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScamShieldController],
      providers: [{ provide: ScamShieldService, useValue: service }],
    }).compile();
    controller = module.get(ScamShieldController);
  });

  it('returns the assessment for the requested number', async () => {
    const assessment = {
      phoneNumber: '+27821234567',
      status: 'flagged',
      score: 54,
      level: 'medium',
      reasons: ['3 community spam report(s)'],
    };
    service.assess.mockResolvedValue(assessment);

    const result = await controller.assess('0821234567');

    expect(service.assess).toHaveBeenCalledWith('0821234567');
    expect(result).toEqual(assessment);
  });
});
