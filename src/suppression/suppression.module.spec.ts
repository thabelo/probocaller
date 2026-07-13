import 'reflect-metadata';
import { SuppressionModule } from './suppression.module';
import { SuppressionController } from './suppression.controller';
import { SuppressionService } from './suppression.service';

describe('SuppressionModule', () => {
  it('registers the public controller and the suppression service', () => {
    const controllers = Reflect.getMetadata('controllers', SuppressionModule) || [];
    const providers = Reflect.getMetadata('providers', SuppressionModule) || [];
    expect(controllers).toContain(SuppressionController);
    expect(providers).toContain(SuppressionService);
  });

  it('exports the service so other modules (lookup) can consume it', () => {
    const exports = Reflect.getMetadata('exports', SuppressionModule) || [];
    expect(exports).toContain(SuppressionService);
  });
});
