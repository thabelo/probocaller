import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { SmsInsight } from './sms-insight.entity';
import { User } from '../user/user.entity';
import { SmsInsightService, SMS_ANALYSER } from './sms-insight.service';
import { RuleBasedSmsAnalyser } from './sms-analyser';
import { SmsInsightController, AdminSmsInsightController } from './sms-insight.controller';
import { ProfileModule } from '../profile/profile.module';
import { AdminGuard } from '../admin/admin.guard';

/**
 * SMS insight: consented SMS content in, structured suggestions out.
 *
 * The analyser is bound behind SMS_ANALYSER, so an internal LLM adapter replaces
 * the rule-based default with one line here and nothing else changes. Profile
 * module is imported for the apply path (a suggestion the user accepts goes
 * through the ordinary profile update, into the change log).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([SmsInsight, User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ProfileModule,
  ],
  providers: [
    SmsInsightService,
    { provide: SMS_ANALYSER, useClass: RuleBasedSmsAnalyser },
    AdminGuard,
  ],
  controllers: [SmsInsightController, AdminSmsInsightController],
  exports: [SmsInsightService],
})
export class SmsInsightModule {}
