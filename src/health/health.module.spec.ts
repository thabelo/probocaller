import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthModule } from './health.module';
import { RootController } from './root.controller';

describe('HealthModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [HealthModule],
    }).compile();
  });

  it('exposes the HealthController', () => {
    expect(module.get(HealthController)).toBeInstanceOf(HealthController);
  });

  /**
   * An unregistered controller is a silent no-op: the route simply 404s, which
   * is exactly the symptom RootController exists to remove.
   */
  it('exposes the RootController', () => {
    expect(module.get(RootController)).toBeInstanceOf(RootController);
  });
});
