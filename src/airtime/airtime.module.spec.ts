import 'reflect-metadata';
import { AirtimeModule } from './airtime.module';
import { AirtimeController } from './airtime.controller';
import { AirtimeService } from './airtime.service';

describe('AirtimeModule', () => {
  it('registers the controller and the airtime service', () => {
    const controllers = Reflect.getMetadata('controllers', AirtimeModule) || [];
    const providers = Reflect.getMetadata('providers', AirtimeModule) || [];
    expect(controllers).toContain(AirtimeController);
    expect(providers).toContain(AirtimeService);
  });
});
