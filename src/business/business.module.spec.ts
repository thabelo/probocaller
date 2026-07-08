import 'reflect-metadata';
import { BusinessModule } from './business.module';
import { LeadsController } from './leads.controller';
import { ApiKeyGuard } from './api-key.guard';

describe('BusinessModule', () => {
  it('registers the leads controller and the api-key guard', () => {
    const controllers = Reflect.getMetadata('controllers', BusinessModule) || [];
    const providers = Reflect.getMetadata('providers', BusinessModule) || [];
    expect(controllers).toContain(LeadsController);
    expect(providers).toContain(ApiKeyGuard);
  });
});
