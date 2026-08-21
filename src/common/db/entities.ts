import { User } from '../../user/user.entity';
import { CallLog } from '../../call/call.entity';
import { CallRating } from '../../call/call-rating.entity';
import { Setting } from '../../config/setting.entity';
import { Business } from '../../business/business.entity';
import { BusinessNumber } from '../../business/business-number.entity';
import { ApiKey } from '../../business/api-key.entity';
import { Campaign } from '../../campaign/campaign.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { PhoneReport } from '../../report/phone-report.entity';
import { PhoneReportVote } from '../../report/phone-report-vote.entity';
import { CallPermissionRequest } from '../../data-broker/call-permission-request.entity';
import { ProfileField } from '../../profile/profile-field.entity';
import { ProfileChangeLog } from '../../profile/profile-change-log.entity';
import { UserProfile } from '../../profile/user-profile.entity';
import { DataAccessLog } from '../../profile/data-access-log.entity';
import { DataCertificate } from '../../profile/data-certificate.entity';
import { BusinessAudience } from '../../profile/business-audience.entity';
import { KybSubmission } from '../../kyb/entities/kyb-submission.entity';
import { KybDocument } from '../../kyb/entities/kyb-document.entity';
import { BlockedKeyword } from '../../blocked-keyword/blocked-keyword.entity';
import { SmsDeletionLog } from '../../sms-deletion-log/sms-deletion-log.entity';
import { SpamReport } from '../../spam-report/spam-report.entity';
import { ReportedSms } from '../../reported-sms/reported-sms.entity';
import { BankAccount } from '../../bank-account/bank-account.entity';
import { FicaSubmission } from '../../fica/entities/fica-submission.entity';
import { FicaDocument } from '../../fica/entities/fica-document.entity';
import { Withdrawal } from '../../withdrawal/withdrawal.entity';
import { Conversation } from '../../messaging/conversation.entity';
import { Message } from '../../messaging/message.entity';
import { CallScreening } from '../../screening/call-screening.entity';
import { Feedback } from '../../feedback/feedback.entity';
import { Invite } from '../../invite/invite.entity';
import { PendingTransfer } from '../../transfer/pending-transfer.entity';
import { AdminInvite } from '../../admin/admin-invite.entity';
import { AuditLog } from '../../audit/audit-log.entity';
import { UserConsent } from '../../consent/user-consent.entity';
import { ErrorLog } from '../../error-log/error-log.entity';
import { DeviceToken } from '../../push/device-token.entity';
import { SuppressionEntry } from '../../suppression/suppression.entity';
import { ReverseLookupEvent } from '../../lookup/reverse-lookup-event.entity';
import { ScamKeyword } from '../../scam-keyword/scam-keyword.entity';
import { WhitelistedNumber } from '../../business-whitelist/business-whitelist.entity';
import { SmsLog } from '../../sms-log/sms-log.entity';
import { App } from '../../marketplace/app.entity';
import { AppInstall } from '../../marketplace/app-install.entity';
import { Survey } from '../../survey/survey.entity';
import { SurveyQuestion } from '../../survey/survey-question.entity';
import { SurveyResponse } from '../../survey/survey-response.entity';
import { SurveyAnswer } from '../../survey/survey-answer.entity';
import { SurveyTemplate } from '../../survey/survey-template.entity';
import { SurveyAudienceProbe } from '../../survey/survey-audience-probe.entity';

/**
 * Canonical list of every persisted TypeORM entity.
 *
 * SINGLE SOURCE OF TRUTH. Imported by both:
 *   - src/app.module.ts  → TypeOrmModule.forRoot({ entities })   (runtime)
 *   - data-source.ts      → migration CLI generate/run            (schema tooling)
 *
 * Keeping one list means the runtime schema and the migration schema can never
 * drift. Add new entities here and nowhere else. Guarded by entities.spec.ts.
 */
export const ENTITIES = [
  User,
  CallLog,
  CallRating,
  Setting,
  Business,
  BusinessNumber,
  ApiKey,
  Campaign,
  Transaction,
  PhoneReport,
  PhoneReportVote,
  CallPermissionRequest,
  ProfileField,
  ProfileChangeLog,
  UserProfile,
  DataAccessLog,
  DataCertificate,
  BusinessAudience,
  KybSubmission,
  KybDocument,
  BlockedKeyword,
  SmsDeletionLog,
  SpamReport,
  ReportedSms,
  BankAccount,
  FicaSubmission,
  FicaDocument,
  Withdrawal,
  Conversation,
  Message,
  CallScreening,
  Feedback,
  Invite,
  PendingTransfer,
  AdminInvite,
  AuditLog,
  UserConsent,
  ErrorLog,
  DeviceToken,
  SuppressionEntry,
  ReverseLookupEvent,
  ScamKeyword,
  WhitelistedNumber,
  SmsLog,
  App,
  AppInstall,
  Survey,
  SurveyQuestion,
  SurveyResponse,
  SurveyAnswer,
  SurveyTemplate,
  SurveyAudienceProbe,
];
