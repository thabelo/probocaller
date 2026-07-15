import { Test } from '@nestjs/testing';
import { FxController } from './fx.controller';
import { FxService } from './fx.service';

describe('FxController', () => {
  it('GET /fx/rates returns the FX service rates', async () => {
    const rates = { base: 'ZAR', rates: { ZAR: 1, USD: 0.054 }, updatedAt: 'now', source: 'live' };
    const module = await Test.createTestingModule({
      controllers: [FxController],
      providers: [{ provide: FxService, useValue: { getRates: jest.fn().mockResolvedValue(rates) } }],
    }).compile();

    const controller = module.get(FxController);
    await expect(controller.getRates()).resolves.toEqual(rates);
  });
});
