import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { SurveyPricingService } from './survey-pricing.service';

/**
 * Surveys — the business half publishes and pays (`survey-campaigns`), the
 * personal half answers and earns (`surveys`). See docs/product/surveys-spec.md.
 *
 * Step 1 of the build order: pricing only. Both clients (mobile and the web
 * console) quote through this same service — the builder is an API first and
 * two clients second (§3.4), so no pricing logic may live in a client.
 */
@Module({
  imports: [ConfigModule],
  providers: [SurveyPricingService],
  exports: [SurveyPricingService],
})
export class SurveyModule {}
