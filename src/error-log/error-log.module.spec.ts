import 'reflect-metadata';
import { ErrorLogModule } from './error-log.module';
import { ErrorLogController } from './error-log.controller';
import { ErrorLogService } from './error-log.service';

describe('ErrorLogModule', () => {
  it('registers the controller and the error-log service', () => {
    const controllers = Reflect.getMetadata('controllers', ErrorLogModule) || [];
    const providers = Reflect.getMetadata('providers', ErrorLogModule) || [];
    expect(controllers).toContain(ErrorLogController);
    expect(providers).toContain(ErrorLogService);
  });
});
