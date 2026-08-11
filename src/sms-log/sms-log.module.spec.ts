import 'reflect-metadata';
import { SmsLogModule } from './sms-log.module';
import { SmsLogService } from './sms-log.service';
import { SmsLogController } from './sms-log.controller';
import { AdminSmsLogController } from './admin-sms-log.controller';
import { AdminSmsLogsController } from './admin-sms-logs.controller';
import { AdminGuard } from '../admin/admin.guard';
import { BusinessModule } from '../business/business.module';
import { ReferralModule } from '../referral/referral.module';
import { TransactionModule } from '../transaction/transaction.module';
import { ConfigModule } from '../config/config.module';

/**
 * SmsLogModule now imports BusinessModule/ReferralModule/TransactionModule/
 * ConfigModule (for SMS billing — mirrors CallService's business-call money
 * move), which pulls in a much larger real dependency graph (ProfileModule,
 * several TypeORM repositories, …) that needs a live DataSource to actually
 * compile. Metadata inspection (same pattern as business.module.spec.ts)
 * verifies the wiring declaratively without needing a live database.
 */
describe('SmsLogModule wiring', () => {
  it('declares the service, both controllers, the admin guard, and the billing module imports', () => {
    const imports = Reflect.getMetadata('imports', SmsLogModule) || [];
    const providers = Reflect.getMetadata('providers', SmsLogModule) || [];
    const controllers = Reflect.getMetadata('controllers', SmsLogModule) || [];
    const exportsList = Reflect.getMetadata('exports', SmsLogModule) || [];

    expect(providers).toContain(SmsLogService);
    expect(providers).toContain(AdminGuard);
    expect(controllers).toEqual(
      expect.arrayContaining([SmsLogController, AdminSmsLogController, AdminSmsLogsController]),
    );
    expect(imports).toEqual(
      expect.arrayContaining([BusinessModule, ReferralModule, TransactionModule, ConfigModule]),
    );
    expect(exportsList).toContain(SmsLogService);
  });
});
