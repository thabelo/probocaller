import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScamKeywordModule } from './scam-keyword.module';
import { ScamKeywordService } from './scam-keyword.service';
import { AdminScamKeywordController } from './admin-scam-keyword.controller';
import { ScamKeywordController } from './scam-keyword.controller';
import { ScamKeyword } from './scam-keyword.entity';
import { User } from '../user/user.entity';

/**
 * Compiles the module the way Nest does, so a missing provider (e.g.
 * AdminGuard's User repository) fails here rather than only at boot.
 */
describe('ScamKeywordModule wiring', () => {
  it('constructs the service and both controllers from the module definition', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScamKeywordModule],
    })
      .overrideProvider(getRepositoryToken(ScamKeyword))
      .useValue({ find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() })
      .overrideProvider(getRepositoryToken(User))
      .useValue({ findOne: jest.fn() })
      .compile();

    expect(moduleRef.get(ScamKeywordService)).toBeInstanceOf(ScamKeywordService);
    expect(moduleRef.get(AdminScamKeywordController)).toBeInstanceOf(AdminScamKeywordController);
    expect(moduleRef.get(ScamKeywordController)).toBeInstanceOf(ScamKeywordController);
  });
});
