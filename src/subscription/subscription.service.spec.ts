import { SubscriptionService } from './subscription.service';

/**
 * Subscription tiers — benefits mapping (Cycle 1).
 *
 * A single source of truth for what each tier unlocks: premium badge, ad-free
 * experience, and support priority. Lookup/badge, the ads gate and the support
 * queue all read from this.
 */
describe('SubscriptionService.tierBenefits', () => {
  const service = new SubscriptionService({} as any);

  it('free tier: no badge, ads shown, normal support', () => {
    expect(service.tierBenefits('free')).toEqual({
      tier: 'free',
      badge: null,
      adsEnabled: true,
      supportPriority: 'normal',
    });
  });

  it('plus tier: badge, ad-free, normal support', () => {
    expect(service.tierBenefits('plus')).toEqual({
      tier: 'plus',
      badge: 'plus',
      adsEnabled: false,
      supportPriority: 'normal',
    });
  });

  it('gold tier: badge, ad-free, priority support', () => {
    expect(service.tierBenefits('gold')).toEqual({
      tier: 'gold',
      badge: 'gold',
      adsEnabled: false,
      supportPriority: 'high',
    });
  });

  it('unknown/empty tier falls back to free benefits', () => {
    expect(service.tierBenefits('bogus')).toEqual(service.tierBenefits('free'));
    expect(service.tierBenefits(undefined as any)).toEqual(service.tierBenefits('free'));
  });
});
