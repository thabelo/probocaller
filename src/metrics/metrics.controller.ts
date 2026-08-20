import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

/**
 * Prometheus scrape endpoint.
 *
 * Unauthenticated, like /health — Prometheus scrapes without credentials. It
 * exposes operational counters only (no PII, no balances per user), but it
 * should still be reachable only from the monitoring network: keep :3000 off
 * the public internet, or restrict /metrics at the reverse proxy.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @ApiExcludeEndpoint()
  async metrics(@Res() res: any) {
    // Sent raw: Prometheus needs the exposition format verbatim, and a
    // JSON-wrapped body silently produces an unusable scrape target.
    res.set('Content-Type', this.metricsService.contentType());
    res.send(await this.metricsService.render());
  }
}
