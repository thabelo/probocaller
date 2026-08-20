import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

/**
 * Prometheus metrics.
 *
 * Uses its OWN Registry rather than the global default one, so tests can reset
 * cleanly and a second instantiation cannot throw "metric already registered".
 *
 * Beyond process health, the metrics that matter here are the MONEY ones — this
 * platform moves real balances, and "the API is up" says nothing about whether
 * calls are being billed or wallets credited.
 */
@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();

  private httpRequests: Counter<string>;
  private httpDuration: Histogram<string>;
  private moneyMoved: Counter<string>;
  private blockedCalls: Counter<string>;
  private initialised = false;

  onModuleInit() {
    if (this.initialised) return;

    collectDefaultMetrics({ register: this.registry });

    this.httpRequests = new Counter({
      name: 'http_requests_total',
      help: 'HTTP requests handled, by method, normalised route and status code',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds, by method and normalised route',
      labelNames: ['method', 'route'],
      // Tuned for an API where caller-ID lookup sits on the incoming-call hot
      // path: fine-grained below 500ms, coarse above.
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.moneyMoved = new Counter({
      name: 'money_moved_zar_total',
      help: 'Total ZAR moved through the ledger, by transaction type',
      labelNames: ['type'],
      registers: [this.registry],
    });

    this.blockedCalls = new Counter({
      name: 'calls_blocked_total',
      help: 'Calls blocked before connecting, by reason',
      labelNames: ['reason'],
      registers: [this.registry],
    });

    this.initialised = true;
  }

  /**
   * Collapse ids out of a path so /business/17/wallet and /business/18/wallet
   * are ONE series. Unbounded label cardinality is the classic way to take a
   * Prometheus server down.
   */
  normaliseRoute(route: string): string {
    return (route || '/')
      .split('?')[0]
      .split('/')
      .map((segment) => {
        if (!segment) return segment;
        if (/^\d+$/.test(segment)) return ':id';
        // Phone numbers and long opaque ids (tokens, refs) are just as unbounded.
        if (/^\+?\d{7,}$/.test(segment)) return ':id';
        if (/^[0-9a-f]{16,}$/i.test(segment)) return ':id';
        return segment;
      })
      .join('/');
  }

  // Observability must never take down the request it is measuring, so every
  // recorder swallows its own errors.
  recordHttpRequest(method: string, route: string, status: number, durationSeconds: number) {
    try {
      const labels = {
        method: (method || 'UNKNOWN').toUpperCase(),
        route: this.normaliseRoute(route),
        status: String(Number.isFinite(status) ? status : 0),
      };
      this.httpRequests.inc(labels);
      if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
        this.httpDuration.observe({ method: labels.method, route: labels.route }, durationSeconds);
      }
    } catch (error) {
      this.logger.debug(`recordHttpRequest failed: ${error}`);
    }
  }

  /** Amount must be a positive, finite ZAR figure — a counter can only go up. */
  recordMoneyMoved(type: string, amount: number) {
    try {
      if (!type || !Number.isFinite(amount) || amount <= 0) return;
      this.moneyMoved.inc({ type }, amount);
    } catch (error) {
      this.logger.debug(`recordMoneyMoved failed: ${error}`);
    }
  }

  recordBlockedCall(reason: string) {
    try {
      this.blockedCalls.inc({ reason: reason || 'UNKNOWN' });
    } catch (error) {
      this.logger.debug(`recordBlockedCall failed: ${error}`);
    }
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  contentType(): string {
    return this.registry.contentType;
  }

  /** Test seam — clears collected values without rebuilding the process. */
  reset() {
    this.registry.resetMetrics();
  }
}
