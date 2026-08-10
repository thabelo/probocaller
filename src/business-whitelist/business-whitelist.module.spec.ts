import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BusinessWhitelistModule } from './business-whitelist.module';
import { BusinessWhitelistService } from './business-whitelist.service';
import { AdminBusinessWhitelistController } from './admin-business-whitelist.controller';
import { BusinessWhitelistController } from './business-whitelist.controller';
import { WhitelistedNumber } from './business-whitelist.entity';
import { User } from '../user/user.entity';

/**
 * Compiles the module the way Nest does, so a missing provider (e.g.
 * AdminGuard's User repository) fails here rather than only at boot.
 */
describe('BusinessWhitelistModule wiring', () => {
  it('constructs the service and both controllers from the module definition', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [BusinessWhitelistModule],
    })
      .overrideProvider(getRepositoryToken(WhitelistedNumber))
      .useValue({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn() })
      .compile();

    expect(moduleRef.get(BusinessWhitelistService)).toBeInstanceOf(BusinessWhitelistService);
    expect(moduleRef.get(AdminBusinessWhitelistController)).toBeInstanceOf(AdminBusinessWhitelistController);
    expect(moduleRef.get(BusinessWhitelistController)).toBeInstanceOf(BusinessWhitelistController);
  });
});
