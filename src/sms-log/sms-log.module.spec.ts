import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SmsLogModule } from './sms-log.module';
import { SmsLogService } from './sms-log.service';
import { SmsLogController } from './sms-log.controller';
import { AdminSmsLogController } from './admin-sms-log.controller';
import { AdminSmsLogsController } from './admin-sms-logs.controller';
import { SmsLog } from './sms-log.entity';
import { User } from '../user/user.entity';

/**
 * Compiles the module the way Nest does, so a missing provider (e.g.
 * AdminGuard's User repository) fails here rather than only at boot.
 */
describe('SmsLogModule wiring', () => {
  it('constructs the service and both controllers from the module definition', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SmsLogModule],
    })
      .overrideProvider(getRepositoryToken(SmsLog))
      .useValue({ find: jest.fn(), create: jest.fn(), save: jest.fn() })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn() })
      .compile();

    expect(moduleRef.get(SmsLogService)).toBeInstanceOf(SmsLogService);
    expect(moduleRef.get(SmsLogController)).toBeInstanceOf(SmsLogController);
    expect(moduleRef.get(AdminSmsLogController)).toBeInstanceOf(AdminSmsLogController);
    expect(moduleRef.get(AdminSmsLogsController)).toBeInstanceOf(AdminSmsLogsController);
  });
});
