import { ReferralController } from './referral.controller';
import { ReferralService } from './referral.service';

/**
 * GET /referral/rate — the one PUBLIC (no-auth) window onto the
 * admin-configurable referral commission rate. Marketing landing pages
 * (static, unauthenticated) need to display the real figure instead of a
 * "3%" baked into their copy at build time.
 *
 * Every other reader of this number sits behind AuthGuard('jwt') or
 * AdminGuard — this endpoint intentionally has none, mirroring the
 * unguarded convention in LegalController.
 */
describe('ReferralController', () => {
  let controller: ReferralController;
  let service: { getCommissionRate: jest.Mock };

  beforeEach(() => {
    service = { getCommissionRate: jest.fn() };
    controller = new ReferralController(service as unknown as ReferralService);
  });

  it('returns the live commission rate from ReferralService, not a hardcoded value', async () => {
    // A deliberately non-default value (not the advertised 3%) proves the
    // controller is passing through whatever the admin has configured,
    // rather than returning a compiled-in constant.
    service.getCommissionRate.mockResolvedValue(0.07);

    const result = await controller.rate();

    expect(result).toEqual({ commissionRate: 0.07 });
    expect(service.getCommissionRate).toHaveBeenCalled();
  });
});
