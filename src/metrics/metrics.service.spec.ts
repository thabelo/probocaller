import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';

/**
 * Prometheus metrics for monitoring/alerting.
 *
 * Beyond process health, the metrics that matter here are the MONEY ones: this
 * platform moves real balances, and "the API is up" says nothing about whether
 * calls are being billed or wallets credited.
 */
describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();
    service = module.get(MetricsService);
    service.onModuleInit();
  });

  afterEach(() => service.reset());

  it('renders the Prometheus text exposition format', async () => {
    const body = await service.render();
    expect(typeof body).toBe('string');
    expect(body).toMatch(/# HELP/);
    expect(body).toMatch(/# TYPE/);
  });

  it('exposes the content type Prometheus expects when scraping', () => {
    expect(service.contentType()).toMatch(/text\/plain/);
  });

  // Without default process metrics, a memory leak or event-loop stall is
  // invisible until the API stops answering entirely.
  it('includes default process metrics (memory, cpu, event loop)', async () => {
    const body = await service.render();
    expect(body).toMatch(/process_resident_memory_bytes/);
    expect(body).toMatch(/nodejs_eventloop_lag_seconds/);
  });

  describe('http request metrics', () => {
    it('counts a request by method, route and status', async () => {
      service.recordHttpRequest('GET', '/user/rate', 200, 0.012);
      const body = await service.render();
      expect(body).toMatch(/http_requests_total\{[^}]*method="GET"[^}]*\}\s+1/);
    });

    // Alerting on error rate needs the status code as a label, not just a total.
    it('separates failures so an error-rate alert can be written', async () => {
      service.recordHttpRequest('POST', '/user/credit', 500, 0.03);
      const body = await service.render();
      expect(body).toMatch(/status="500"/);
    });

    it('records latency in a histogram for percentile alerts', async () => {
      service.recordHttpRequest('GET', '/user/rate', 200, 0.5);
      const body = await service.render();
      expect(body).toMatch(/http_request_duration_seconds_bucket/);
    });

    // A path like /user/123 must not become its own metric series — unbounded
    // label cardinality is the classic way to take Prometheus down.
    it('does not create a new series per id in the path', async () => {
      for (let id = 1; id <= 50; id += 1) {
        service.recordHttpRequest('GET', `/business/${id}/wallet`, 200, 0.01);
      }
      const body = await service.render();
      const series = body.split('\n').filter((l) => l.startsWith('http_requests_total{'));
      expect(series.length).toBe(1);
      expect(body).toMatch(/route="\/business\/:id\/wallet"/);
    });
  });

  describe('money metrics', () => {
    it('counts money moved by ledger type so billing can be alerted on', async () => {
      service.recordMoneyMoved('CALL_CHARGE', 12.5);
      service.recordMoneyMoved('CALL_EARN', 9.5);
      const body = await service.render();
      expect(body).toMatch(/money_moved_zar_total\{type="CALL_CHARGE"\}\s+12\.5/);
      expect(body).toMatch(/money_moved_zar_total\{type="CALL_EARN"\}\s+9\.5/);
    });

    it('accumulates repeated movements of the same type', async () => {
      service.recordMoneyMoved('CALL_CHARGE', 10);
      service.recordMoneyMoved('CALL_CHARGE', 5);
      const body = await service.render();
      expect(body).toMatch(/money_moved_zar_total\{type="CALL_CHARGE"\}\s+15/);
    });

    // A blocked call is a user-visible failure (empty wallet, call rules) and
    // a spike in one reason is the signal worth paging on.
    it('counts blocked calls by reason', async () => {
      service.recordBlockedCall('LOW_FUNDS');
      const body = await service.render();
      expect(body).toMatch(/calls_blocked_total\{reason="LOW_FUNDS"\}\s+1/);
    });
  });

  // Metrics are observability, not business logic: a broken counter must never
  // take down the request that was being measured.
  it('never throws on malformed input', async () => {
    expect(() => service.recordHttpRequest('', '', NaN as any, NaN)).not.toThrow();
    expect(() => service.recordMoneyMoved('', NaN)).not.toThrow();
    expect(() => service.recordMoneyMoved('CALL_CHARGE', -5)).not.toThrow();
  });

  it('ignores a negative money amount rather than corrupting a counter', async () => {
    service.recordMoneyMoved('CALL_CHARGE', 10);
    service.recordMoneyMoved('CALL_CHARGE', -5);
    const body = await service.render();
    expect(body).toMatch(/money_moved_zar_total\{type="CALL_CHARGE"\}\s+10/);
  });
});
