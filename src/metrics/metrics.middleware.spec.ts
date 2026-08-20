import { EventEmitter } from 'events';
import { MetricsMiddleware } from './metrics.middleware';

/**
 * Request metrics are collected in MIDDLEWARE, not an interceptor.
 *
 * Nest runs guards BEFORE interceptors, so an interceptor never sees a request
 * an AuthGuard rejected — every 401/403 was silently missing from the counters,
 * understating traffic and making "auth broken after a deploy" (a SEV-1 in the
 * runbook) invisible. Middleware runs before guards and its response 'finish'
 * hook fires for every outcome.
 */
describe('MetricsMiddleware', () => {
  const makeMetrics = () => ({ recordHttpRequest: jest.fn() });

  const run = (
    middleware: MetricsMiddleware,
    req: any,
    statusCode: number,
    opts: { routeAfterMatch?: string } = {},
  ) => {
    const res: any = new EventEmitter();
    res.statusCode = statusCode;
    const next = jest.fn();
    middleware.use(req, res, next);
    // The router populates req.route only once a handler has matched, which is
    // after middleware runs but before the response finishes.
    if (opts.routeAfterMatch) req.route = { path: opts.routeAfterMatch };
    res.emit('finish');
    return { next };
  };

  it('calls next so the request continues', () => {
    const metrics = makeMetrics();
    const { next } = run(new MetricsMiddleware(metrics as any), { method: 'GET', url: '/health' }, 200);
    expect(next).toHaveBeenCalled();
  });

  it('records a successful request', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', url: '/health' }, 200, {
      routeAfterMatch: '/health',
    });
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith('GET', '/health', 200, expect.any(Number));
  });

  // The regression this middleware exists for.
  it('records a request rejected by a guard (401)', () => {
    const metrics = makeMetrics();
    // A guard rejects AFTER the router matched, so req.route is set — this is
    // the shape a real 401 has.
    run(new MetricsMiddleware(metrics as any), { method: 'POST', originalUrl: '/push/register', url: '/' }, 401, {
      routeAfterMatch: '/push/register',
    });
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith('POST', '/push/register', 401, expect.any(Number));
  });

  it('records a 5xx', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'POST', url: '/user/credit' }, 500, {
      routeAfterMatch: '/user/credit',
    });
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith('POST', '/user/credit', 500, expect.any(Number));
  });

  // Prefers the matched route pattern so ids are already collapsed; falls back
  // to the raw url (which MetricsService normalises) when nothing matched.
  it('uses the matched route pattern when the router set one', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', url: '/business/17/wallet' }, 200, {
      routeAfterMatch: '/business/:businessId/wallet',
    });
    expect(metrics.recordHttpRequest).toHaveBeenCalledWith(
      'GET', '/business/:businessId/wallet', 200, expect.any(Number),
    );
  });

  it('does not record the /metrics scrape', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', url: '/metrics' }, 200);
    expect(metrics.recordHttpRequest).not.toHaveBeenCalled();
  });

  /**
   * Regression, caught live: middleware mounted with forRoutes('*') does not
   * reliably see the full path on req.url (Express rewrites it relative to the
   * mount point), so the scrape was counting itself and a 404's path would be
   * recorded as '/'. req.originalUrl is the full path in every case.
   */
  it('excludes the scrape using originalUrl, not the rewritten url', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', originalUrl: '/metrics', url: '/' }, 200, {
      routeAfterMatch: '/metrics',
    });
    expect(metrics.recordHttpRequest).not.toHaveBeenCalled();
  });

  it('excludes the scrape when it carries a query string', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', originalUrl: '/metrics?foo=1', url: '/' }, 200);
    expect(metrics.recordHttpRequest).not.toHaveBeenCalled();
  });

  /**
   * An unmatched path must NOT become its own metric series. Anyone can probe
   * /aaa, /bbb, /ccc… from the internet, and one series per probe is a
   * cardinality bomb that takes the Prometheus server down. All unmatched paths
   * collapse to a single label; which path 404'd is a question for the logs.
   */
  it('collapses every unmatched path into one series', () => {
    const metrics = makeMetrics();
    const middleware = new MetricsMiddleware(metrics as any);
    run(middleware, { method: 'GET', originalUrl: '/nope', url: '/' }, 404);
    run(middleware, { method: 'GET', originalUrl: '/also-nope', url: '/' }, 404);
    const routes = metrics.recordHttpRequest.mock.calls.map((c: any[]) => c[1]);
    expect(new Set(routes).size).toBe(1);
    expect(routes[0]).toBe('<unmatched>');
  });

  it('records once per request, not once per finish listener', () => {
    const metrics = makeMetrics();
    run(new MetricsMiddleware(metrics as any), { method: 'GET', url: '/health' }, 200);
    expect(metrics.recordHttpRequest).toHaveBeenCalledTimes(1);
  });
});
