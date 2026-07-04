import 'reflect-metadata';
import { AuditModule } from './audit.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

describe('AuditModule', () => {
  it('registers the controller and exports the service for reuse', () => {
    const controllers = Reflect.getMetadata('controllers', AuditModule) || [];
    const providers = Reflect.getMetadata('providers', AuditModule) || [];
    const exports = Reflect.getMetadata('exports', AuditModule) || [];
    expect(controllers).toContain(AuditController);
    expect(providers).toContain(AuditService);
    expect(exports).toContain(AuditService);
  });
});
