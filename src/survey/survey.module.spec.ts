import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyModule } from './survey.module';
import { SurveyPricingService } from './survey-pricing.service';
import { Setting } from '../config/setting.entity';

/**
 * The module must actually PROVIDE what the service asks for — unit tests hand
 * SurveyPricingService its SettingsReaderService directly and would stay green
 * while the real module supplied nothing and the app refused to boot. Same
 * lesson as referral.module.spec.ts.
 */
describe('SurveyModule wiring', () => {
  const compile = () =>
    Test.createTestingModule({ imports: [SurveyModule] })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue({
        findOne: jest.fn().mockResolvedValue({ value: '1.25' }),
        create: jest.fn((d: any) => d),
        save: jest.fn(async (d: any) => d),
      })
      .compile();

  it('can construct SurveyPricingService from the module definition', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyPricingService)).toBeInstanceOf(SurveyPricingService);
  });

  it('exports the pricing service for the modules that publish surveys', async () => {
    const exports = Reflect.getMetadata('exports', SurveyModule) || [];
    expect(exports).toEqual(expect.arrayContaining([SurveyPricingService]));
  });

  /** Rates resolve through the real settings reader, not a fallback constant. */
  it('prices through the injected settings repository', async () => {
    const moduleRef = await compile();
    await expect(
      moduleRef.get(SurveyPricingService).pricePerResponse(['yes_no', 'free_text']),
    ).resolves.toBe(2.5);
  });
});
