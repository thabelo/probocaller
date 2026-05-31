import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';

describe('SubscriptionController', () => {
  let controller: SubscriptionController;
  let service: { getBenefits: jest.Mock; setTier: jest.Mock };

  beforeEach(async () => {
    service = { getBenefits: jest.fn(), setTier: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionController],
      providers: [{ provide: SubscriptionService, useValue: service }],
    }).compile();
    controller = module.get(SubscriptionController);
  });

  it('GET returns the current user benefits', async () => {
    const benefits = { tier: 'gold', badge: 'gold', adsEnabled: false, supportPriority: 'high' };
    service.getBenefits.mockResolvedValue(benefits);
    const res = await controller.mine({ user: { userId: 7 } } as any);
    expect(service.getBenefits).toHaveBeenCalledWith(7);
    expect(res).toEqual(benefits);
  });

  it('PUT updates the tier for the current user', async () => {
    const benefits = { tier: 'plus', badge: 'plus', adsEnabled: false, supportPriority: 'normal' };
    service.setTier.mockResolvedValue(benefits);
    const res = await controller.update({ user: { userId: 7 } } as any, { tier: 'plus' });
    expect(service.setTier).toHaveBeenCalledWith(7, 'plus');
    expect(res).toEqual(benefits);
  });
});
