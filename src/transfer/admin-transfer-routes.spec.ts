import { Test, TestingModule } from '@nestjs/testing';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

/**
 * The admin list shows every person-to-person movement, including money held
 * against numbers that have no account. It must never be reachable by an
 * ordinary signed-in user.
 */
describe('TransferController — admin listing', () => {
  let controller: TransferController;
  const service = { listForAdmin: jest.fn(async () => []), send: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod: TestingModule = await Test.createTestingModule({
      controllers: [TransferController],
      providers: [{ provide: TransferService, useValue: service }],
    })
      .overrideGuard(require('../admin/admin.guard').AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = mod.get(TransferController);
  });

  it('exposes the merged transfer list to admins', async () => {
    await controller.listForAdmin();
    expect(service.listForAdmin).toHaveBeenCalled();
  });

  /**
   * The route carries other people's phone numbers and amounts, so the guard is
   * the whole point of it — a missing decorator would not fail any other test.
   */
  it('is behind the admin guard', () => {
    const { AdminGuard } = require('../admin/admin.guard');
    const guards = Reflect.getMetadata('__guards__', TransferController.prototype.listForAdmin) ?? [];
    expect(guards).toContain(AdminGuard);
  });

  /** Sending money must not sit behind the admin guard. */
  it('leaves sending available to ordinary users', () => {
    const { AdminGuard } = require('../admin/admin.guard');
    const guards = Reflect.getMetadata('__guards__', TransferController.prototype.send) ?? [];
    expect(guards).not.toContain(AdminGuard);
  });
});
