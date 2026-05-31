import { Test, TestingModule } from '@nestjs/testing';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

describe('GdprController', () => {
  let controller: GdprController;
  let service: { exportForUser: jest.Mock };

  beforeEach(async () => {
    service = { exportForUser: jest.fn().mockResolvedValue({ schemaVersion: 1, generatedAt: 'now', user: { id: 1 } }) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GdprController],
      providers: [{ provide: GdprService, useValue: service }],
    }).compile();
    controller = module.get(GdprController);
  });

  it('delegates to GdprService.exportForUser with the authenticated userId', async () => {
    const result = await controller.exportMine({ user: { userId: 42 } } as any);
    expect(service.exportForUser).toHaveBeenCalledWith(42);
    expect(result).toMatchObject({ schemaVersion: 1, user: { id: 1 } });
  });
});
