import 'reflect-metadata';
import { AirtimeModule } from './airtime.module';
import { AirtimeController } from './airtime.controller';
import { AirtimeService } from './airtime.service';
import { ConfigModule } from '../config/config.module';

describe('AirtimeModule', () => {
  it('registers the controller and the airtime service', () => {
    const controllers = Reflect.getMetadata('controllers', AirtimeModule) || [];
    const providers = Reflect.getMetadata('providers', AirtimeModule) || [];
    expect(controllers).toContain(AirtimeController);
    expect(providers).toContain(AirtimeService);
  });

  // AirtimeService now reads AIRTIME_MIN_ZAR / AIRTIME_MAX_ZAR through the
  // shared SettingsReaderService (ConfigModule), not process.env.
  it('imports ConfigModule', () => {
    const imports = Reflect.getMetadata('imports', AirtimeModule) || [];
    expect(imports).toEqual(expect.arrayContaining([ConfigModule]));
  });
});
