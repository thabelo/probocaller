import 'reflect-metadata';
import { ConsentModule } from './consent.module';
import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';

describe('ConsentModule', () => {
  it('registers the controller and exports the service', () => {
    const controllers = Reflect.getMetadata('controllers', ConsentModule) || [];
    const providers = Reflect.getMetadata('providers', ConsentModule) || [];
    const exports = Reflect.getMetadata('exports', ConsentModule) || [];
    expect(controllers).toContain(ConsentController);
    expect(providers).toContain(ConsentService);
    expect(exports).toContain(ConsentService);
  });
});
