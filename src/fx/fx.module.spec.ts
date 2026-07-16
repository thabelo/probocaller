import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { FxModule } from './fx.module';
import { FxService } from './fx.service';
import { FxController } from './fx.controller';
import { Setting } from '../config/setting.entity';

describe('FxModule', () => {
  it('wires FxService (with the Setting repo) and FxController', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [FxModule] })
      .overrideProvider(getRepositoryToken(Setting))
      .useValue({ findOne: jest.fn(), create: jest.fn(), save: jest.fn() })
      .compile();

    expect(moduleRef.get(FxService)).toBeInstanceOf(FxService);
    expect(moduleRef.get(FxController)).toBeInstanceOf(FxController);
  });
});
