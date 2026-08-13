import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyModule } from './survey.module';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyTemplateService } from './survey-template.service';
import { AdminSurveyController } from './admin-survey.controller';
import { Setting } from '../config/setting.entity';
import { SurveyTemplate } from './survey-template.entity';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';

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
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn() })
      .overrideProvider(getRepositoryToken(SurveyTemplate))
      .useValue({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .compile();

  it('can construct SurveyPricingService from the module definition', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyPricingService)).toBeInstanceOf(SurveyPricingService);
  });

  it('exports the pricing service for the modules that publish surveys', async () => {
    const exports = Reflect.getMetadata('exports', SurveyModule) || [];
    expect(exports).toEqual(expect.arrayContaining([SurveyPricingService]));
  });

  it('can construct SurveyTemplateService from the module definition', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyTemplateService)).toBeInstanceOf(SurveyTemplateService);
  });

  it('declares the admin controller that curates the template library', () => {
    const controllers = Reflect.getMetadata('controllers', SurveyModule) || [];
    expect(controllers).toContain(AdminSurveyController);
  });

  /**
   * AdminGuard injects the User repository and is resolved from the injector of
   * the module that DECLARES the controller. Left unprovided, every admin route
   * here compiles, boots, serves — and then throws
   * "Cannot read properties of undefined (reading 'findOne')" on the first real
   * request. Metadata assertions cannot see that; resolving the guard can.
   */
  it('can construct the AdminGuard its controller runs behind', async () => {
    const moduleRef = await compile();
    const guard = moduleRef.get(AdminGuard);

    expect(guard).toBeInstanceOf(AdminGuard);
    expect((guard as any).userRepository).toBeDefined();
  });

  /** Rates resolve through the real settings reader, not a fallback constant. */
  it('prices through the injected settings repository', async () => {
    const moduleRef = await compile();
    await expect(
      moduleRef.get(SurveyPricingService).pricePerResponse(['yes_no', 'free_text']),
    ).resolves.toBe(2.5);
  });
});
