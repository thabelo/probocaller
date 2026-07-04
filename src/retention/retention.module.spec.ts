import 'reflect-metadata';
import { RetentionModule } from './retention.module';
import { RetentionController } from './retention.controller';
import { DataRetentionService } from './data-retention.service';

describe('RetentionModule', () => {
  it('registers the controller and the retention service', () => {
    const controllers = Reflect.getMetadata('controllers', RetentionModule) || [];
    const providers = Reflect.getMetadata('providers', RetentionModule) || [];
    expect(controllers).toContain(RetentionController);
    expect(providers).toContain(DataRetentionService);
  });
});
