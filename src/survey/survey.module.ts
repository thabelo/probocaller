import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushModule } from '../push/push.module';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '../config/config.module';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyTemplate } from './survey-template.entity';
import { AdminSurveyController } from './admin-survey.controller';
import { SurveyController } from './survey.controller';
import { SurveyService } from './survey.service';
import { SurveyMatchingService } from './survey-matching.service';
import { SurveyPublishService } from './survey-publish.service';
import { SurveyResponseService } from './survey-response.service';
import { SurveyResultsService } from './survey-results.service';
import { SurveyAudienceProbe } from './survey-audience-probe.entity';
import { SurveyStatsService } from './survey-stats.service';
import { RespondentSurveyController } from './respondent-survey.controller';
import { SurveyResponse } from './survey-response.entity';
import { SurveyAnswer } from './survey-answer.entity';
import { TransactionModule } from '../transaction/transaction.module';
import { UserProfile } from '../profile/user-profile.entity';
import { ProfileField } from '../profile/profile-field.entity';
import { DataAccessLog } from '../profile/data-access-log.entity';
import { AppInstall } from '../marketplace/app-install.entity';
import { Survey } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { Business } from '../business/business.entity';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { AdminGuard } from '../admin/admin.guard';
import { User } from '../user/user.entity';

/**
 * Surveys — the business half publishes and pays (`survey-campaigns`), the
 * personal half answers and earns (`surveys`). See docs/product/surveys-spec.md.
 *
 * Build-order step 1: pricing and the admin-curated template library. Nothing
 * user-facing yet, and neither catalogue app may be released to `live` until
 * its screens ship in the mobile binary.
 *
 * Both clients (mobile and the web console) will quote and build through this
 * module — the builder is an API first and two clients second (§3.4), so no
 * pricing or composition logic may live in a client.
 */
@Module({
  imports: [
    // User is here for AdminGuard, which loads the caller to check their role.
    TypeOrmModule.forFeature([
      Survey, SurveyQuestion, SurveyTemplate, User, Business,
      // Matching reads who consented (an active `surveys` install) and what
      // they said about themselves.
      AppInstall, UserProfile, ProfileField,
      SurveyResponse, SurveyAnswer,
      // Releasing a cohort of answers to a business writes a line in each
      // respondent's own access log — the same trail Databroker writes to.
      DataAccessLog,
      // Every audience estimate is recorded, so a campaign of narrowing
      // probes is legible after the fact.
      SurveyAudienceProbe,
    ]),
    // AdminGuard authenticates via the 'jwt' strategy, same as every other
    // admin-guarded controller.
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Publishing alerts everyone the survey matches, so respondents learn a
    // survey exists rather than having to go looking for one.
    PushModule,
    ConfigModule,
    // AppAccessGuard gates the builder on the survey-campaigns install, so
    // entitlement is never re-derived here.
    MarketplaceModule,
    // Every wallet move writes an audit row on the same transaction.
    TransactionModule,
  ],
  // AdminGuard is PROVIDED, not merely imported: AdminSurveyController is
  // declared here, so Nest resolves its guard from this module's injector. A
  // guard it cannot construct fails on the first request, not at boot.
  providers: [
    SurveyPricingService, SurveyTemplateService, SurveyService,
    SurveyMatchingService, SurveyPublishService, SurveyResponseService,
    SurveyResultsService,
    SurveyStatsService,
    AdminGuard,
  ],
  controllers: [AdminSurveyController, SurveyController, RespondentSurveyController],
  exports: [SurveyPricingService, SurveyTemplateService, SurveyService, SurveyMatchingService, SurveyPublishService, SurveyResponseService, SurveyResultsService],
})
export class SurveyModule {}
