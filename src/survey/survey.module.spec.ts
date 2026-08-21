import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyModule } from './survey.module';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyTemplateService } from './survey-template.service';
import { AdminSurveyController } from './admin-survey.controller';
import { Setting } from '../config/setting.entity';
import { SurveyTemplate } from './survey-template.entity';
import { AdminGuard } from '../admin/admin.guard';
import { SurveyService } from './survey.service';
import { SurveyController } from './survey.controller';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { Business } from '../business/business.entity';
import { App } from '../marketplace/app.entity';
import { AppInstall } from '../marketplace/app-install.entity';
import { UserProfile } from '../profile/user-profile.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { SurveyResponse } from './survey-response.entity';
import { Transaction } from '../transaction/transaction.entity';
import { DataSource } from 'typeorm';
import { Global, Module } from '@nestjs/common';

/**
 * TypeOrmModule.forRoot provides DataSource GLOBALLY in the real app; a module
 * compiled on its own has no such root. This stands in for it so the wiring
 * test can still actually CONSTRUCT the graph — metadata assertions alone
 * cannot see an unconstructible guard, which is how AdminGuard shipped broken
 * here once already.
 */
@Global()
@Module({
  providers: [{ provide: DataSource, useValue: { transaction: jest.fn() } }],
  exports: [DataSource],
})
class FakeDataSourceModule {}
import { DeviceToken } from '../push/device-token.entity';
import { SurveyAnswer } from './survey-answer.entity';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyResponseService } from './survey-response.service';
import { SurveyResultsService } from './survey-results.service';
import { RespondentSurveyController } from './respondent-survey.controller';
import { User } from '../user/user.entity';
import { DataAccessLog } from '../profile/data-access-log.entity';
import { SurveyAudienceProbe } from './survey-audience-probe.entity';

/**
 * The module must actually PROVIDE what the service asks for — unit tests hand
 * SurveyPricingService its SettingsReaderService directly and would stay green
 * while the real module supplied nothing and the app refused to boot. Same
 * lesson as referral.module.spec.ts.
 */
describe('SurveyModule wiring', () => {
  const compile = () =>
    Test.createTestingModule({ imports: [FakeDataSourceModule, SurveyModule] })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue({
        findOne: jest.fn().mockResolvedValue({ value: '1.25' }),
        create: jest.fn((d: any) => d),
        save: jest.fn(async (d: any) => d),
      })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn() })
      // SurveyModule imports MarketplaceModule for AppAccessGuard, which brings
      // the catalogue repositories with it.
      .overrideProvider(getRepositoryToken(App))
      .useValue({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn() })
      .overrideProvider(getRepositoryToken(AppInstall))
      .useValue({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn() })
      .overrideProvider(getRepositoryToken(UserProfile))
      .useValue({ find: jest.fn().mockResolvedValue([]) })
      .overrideProvider(getRepositoryToken(ProfileField))
      .useValue({ find: jest.fn().mockResolvedValue([]) })
      // Releasing a cohort of answers logs the disclosure to each respondent.
      .overrideProvider(getRepositoryToken(DataAccessLog))
      .useValue({ create: jest.fn((d: any) => d), save: jest.fn(async (d: any) => d) })
      .overrideProvider(getRepositoryToken(SurveyAudienceProbe))
      .useValue({ create: jest.fn((d: any) => d), save: jest.fn(async (d: any) => d) })
      // The money path writes its audit row on the caller's transaction, so
      // TransactionModule (and a DataSource to run one) come along with it.
      .overrideProvider(getRepositoryToken(Transaction))
      .useValue({ find: jest.fn(), save: jest.fn(), create: jest.fn() })
      .overrideProvider(getRepositoryToken(SurveyResponse))
      .useValue({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .overrideProvider(getRepositoryToken(SurveyAnswer))
      .useValue({ find: jest.fn(), save: jest.fn() })
      // Publishing alerts the matched audience, so PushModule (and its device
      // registry) come along with it.
      .overrideProvider(getRepositoryToken(DeviceToken))
      .useValue({ find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() })
      .overrideProvider(getRepositoryToken(Survey))
      .useValue({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .overrideProvider(getRepositoryToken(SurveyQuestion))
      .useValue({ find: jest.fn(), create: jest.fn(), save: jest.fn(), delete: jest.fn() })
      .overrideProvider(getRepositoryToken(Business))
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

  it('can construct SurveyService from the module definition', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyService)).toBeInstanceOf(SurveyService);
  });

  /**
   * The builder is gated on the survey-campaigns install via AppAccessGuard,
   * which needs MarketplaceService and UserAccessContextService. Nest resolves
   * a controller's guards from the DECLARING module's injector, so an unimported
   * MarketplaceModule fails on the first request rather than at boot — exactly
   * how AdminGuard broke here before.
   */
  it('can construct the AppAccessGuard the builder runs behind', async () => {
    const moduleRef = await compile();
    const { AppAccessGuard } = require('../marketplace/app-access.guard');
    expect(moduleRef.get(AppAccessGuard)).toBeInstanceOf(AppAccessGuard);
  });

  it('declares the business-facing builder controller', () => {
    const controllers = Reflect.getMetadata('controllers', SurveyModule) || [];
    expect(controllers).toContain(SurveyController);
  });

  it('can construct the money-moving services from the module definition', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyPublishService)).toBeInstanceOf(SurveyPublishService);
    expect(moduleRef.get(SurveyResponseService)).toBeInstanceOf(SurveyResponseService);
  });

  /**
   * The one service that reads answers back. If it cannot be constructed from
   * this module's own injector — it needs the ProfileField and DataAccessLog
   * repositories, neither of which the survey module needed before — the
   * results route compiles, boots and then throws on the first real request.
   */
  it('provides SurveyResultsService', async () => {
    const moduleRef = await compile();
    expect(moduleRef.get(SurveyResultsService)).toBeInstanceOf(SurveyResultsService);
  });

  it('declares the respondent controller', () => {
    const controllers = Reflect.getMetadata('controllers', SurveyModule) || [];
    expect(controllers).toContain(RespondentSurveyController);
  });

  /** Rates resolve through the real settings reader, not a fallback constant. */
  it('prices through the injected settings repository', async () => {
    const moduleRef = await compile();
    await expect(
      moduleRef.get(SurveyPricingService).pricePerResponse(['yes_no', 'free_text']),
    ).resolves.toBe(2.5);
  });
});
