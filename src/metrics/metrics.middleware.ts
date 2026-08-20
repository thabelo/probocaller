import { Injectable, NestMiddleware } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Records every HTTP request into the metrics counters.
 *
 * MIDDLEWARE, deliberately, not an interceptor: Nest runs guards BEFORE
 * interceptors, so an interceptor never sees a request an AuthGuard rejected —
 * every 401/403 went uncounted, understating traffic and making "auth broken
 * after a deploy" (a SEV-1 in the runbook) invisible on the dashboards.
 * Middleware runs first, and the response 'finish' hook fires for every
 * outcome: success, guard rejection, thrown error, 404.
 */
@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: any, res: any, next: () => void) {
    // originalUrl, not url: middleware mounted with forRoutes('*') sees a url
    // rewritten relative to its mount point, so the scrape exclusion silently
    // never matched (it counted itself) and a 404 was recorded as '/'.
    const url: string = req?.originalUrl ?? req?.url ?? '/';

    // Excluded: otherwise every dashboard is dominated by Prometheus polling us.
    if (url.split('?')[0] === '/metrics') return next();

    const method: string = req?.method ?? 'UNKNOWN';
    const startedAt = process.hrtime.bigint();

    res.once('finish', () => {
      // req.route is populated by the router once a handler matches — after
      // this middleware runs, but before the response finishes.
      //
      // When nothing matched (a 404), the path is attacker-controlled: recording
      // it would mint one series per probe, which is exactly the cardinality
      // bomb that takes a Prometheus server down. Collapse them all instead —
      // which path 404'd is a question for the logs.
      const route: string = req?.route?.path ?? '<unmatched>';
      const elapsedSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      this.metrics.recordHttpRequest(method, route, res?.statusCode ?? 0, elapsedSeconds);
    });

    next();
  }
}
