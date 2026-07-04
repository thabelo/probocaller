import 'reflect-metadata';
import { LegalModule } from './legal.module';
import { LegalController } from './legal.controller';
import { LegalService } from './legal.service';

describe('LegalModule', () => {
  it('registers the controller and exports the service for consent tracking', () => {
    const controllers = Reflect.getMetadata('controllers', LegalModule) || [];
    const providers = Reflect.getMetadata('providers', LegalModule) || [];
    const exports = Reflect.getMetadata('exports', LegalModule) || [];
    expect(controllers).toContain(LegalController);
    expect(providers).toContain(LegalService);
    expect(exports).toContain(LegalService);
  });
});
