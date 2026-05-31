import { Test, TestingModule } from '@nestjs/testing';
import { ScreeningController } from './screening.controller';
import { ScreeningService } from './screening.service';

describe('ScreeningController', () => {
  let controller: ScreeningController;
  let service: { recordScreening: jest.Mock; getHistory: jest.Mock };

  beforeEach(async () => {
    service = { recordScreening: jest.fn(), getHistory: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScreeningController],
      providers: [{ provide: ScreeningService, useValue: service }],
    }).compile();
    controller = module.get(ScreeningController);
  });

  it('POST records a screening for the current user', async () => {
    const row = { id: 1, action: 'screen' };
    service.recordScreening.mockResolvedValue(row);
    const res = await controller.record(
      { user: { userId: 7 } } as any,
      { callerNumber: '+27820000001', signals: { scamLevel: 'low' }, audioRef: 'a1' },
    );
    expect(service.recordScreening).toHaveBeenCalledWith(7, '+27820000001', { scamLevel: 'low' }, 'a1');
    expect(res).toBe(row);
  });

  it('GET returns the current user screening history', async () => {
    const rows = [{ id: 1 }];
    service.getHistory.mockResolvedValue(rows);
    const res = await controller.history({ user: { userId: 7 } } as any);
    expect(service.getHistory).toHaveBeenCalledWith(7);
    expect(res).toBe(rows);
  });
});
