import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';

/**
 * Prometheus metrics + the middleware that feeds them.
 *
 * Global so any service can inject MetricsService to record a domain metric
 * (money moved, calls blocked) without importing this module everywhere.
 *
 * Request counting is MIDDLEWARE, not an interceptor: Nest runs guards before
 * interceptors, so an interceptor silently missed every request an AuthGuard
 * rejected. See metrics.middleware.ts.
 */
@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, MetricsMiddleware],
  exports: [MetricsService],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
