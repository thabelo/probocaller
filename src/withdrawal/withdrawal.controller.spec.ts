import { WithdrawalController } from './withdrawal.controller';

describe('WithdrawalController', () => {
  let controller: WithdrawalController;
  let service: { listMine: jest.Mock; request: jest.Mock; cancel: jest.Mock; getConfig: jest.Mock };

  beforeEach(() => {
    service = {
      listMine: jest.fn(),
      request: jest.fn(),
      cancel: jest.fn(),
      getConfig: jest.fn(),
    };
    controller = new WithdrawalController(service as any);
  });

  /**
   * WITHDRAWAL_PENDING_CAP was previously hardcoded client-side with no
   * server source. This endpoint exposes the SAME cap value request()
   * enforces (via WithdrawalService.getConfig()) so the app can read it
   * instead of guessing.
   */
  describe('GET /withdrawals/config', () => {
    it('returns the pending cap from the service', () => {
      service.getConfig.mockReturnValue({ pendingCap: 3 });
      expect(controller.config()).toEqual({ pendingCap: 3 });
      expect(service.getConfig).toHaveBeenCalled();
    });
  });
});
