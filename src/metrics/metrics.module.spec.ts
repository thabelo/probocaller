import { Test } from '@nestjs/testing';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';
import { MetricsMiddleware } from './metrics.middleware';

describe('MetricsModule wiring', () => {
  it('can construct MetricsService from the module definition', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [MetricsModule] }).compile();
    expect(moduleRef.get(MetricsService)).toBeInstanceOf(MetricsService);
  });

  /**
   * Counting must happen in middleware, not an interceptor: Nest runs guards
   * BEFORE interceptors, so an interceptor never saw a request an AuthGuard
   * rejected and every 401/403 went uncounted. Pinned here because swapping it
   * back would silently reintroduce that blind spot.
   */
  it('applies the metrics middleware to every route', () => {
    const applied: any[] = [];
    const consumer: any = {
      apply: (...m: any[]) => {
        applied.push(...m);
        return { forRoutes: (...routes: any[]) => applied.push(...routes) };
      },
    };
    new MetricsModule().configure(consumer);
    expect(applied).toContain(MetricsMiddleware);
    expect(applied).toContain('*');
  });

  it('exports MetricsService so any service can record a domain metric', () => {
    const exports = Reflect.getMetadata('exports', MetricsModule) ?? [];
    expect(exports).toContain(MetricsService);
  });
});
