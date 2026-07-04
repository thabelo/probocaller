import 'reflect-metadata';
import { FeedbackModule } from './feedback.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

describe('FeedbackModule', () => {
  it('registers the controller and exposes the service', () => {
    const controllers = Reflect.getMetadata('controllers', FeedbackModule) || [];
    const providers = Reflect.getMetadata('providers', FeedbackModule) || [];
    const exports = Reflect.getMetadata('exports', FeedbackModule) || [];
    expect(controllers).toContain(FeedbackController);
    expect(providers).toContain(FeedbackService);
    expect(exports).toContain(FeedbackService);
  });
});
