import 'reflect-metadata';
import { LookupModule } from './lookup.module';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';
import { ReverseLookupService } from './reverse-lookup.service';
import { ConfigModule } from '../config/config.module';

/**
 * ReverseLookupService now reads GOOGLE_PLACES_COST_USD through the shared
 * SettingsReaderService (ConfigModule), not process.env — the module must
 * actually import ConfigModule or the app refuses to boot.
 */
describe('LookupModule wiring', () => {
  it('registers the controller, the services, and imports ConfigModule', () => {
    const controllers = Reflect.getMetadata('controllers', LookupModule) || [];
    const providers = Reflect.getMetadata('providers', LookupModule) || [];
    const imports = Reflect.getMetadata('imports', LookupModule) || [];

    expect(controllers).toContain(LookupController);
    expect(providers).toEqual(expect.arrayContaining([LookupService, ReverseLookupService]));
    expect(imports).toEqual(expect.arrayContaining([ConfigModule]));
  });
});
