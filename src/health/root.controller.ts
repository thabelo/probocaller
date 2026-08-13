import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * What the bare domain says.
 *
 * Without this, opening the API host in a browser returned
 * {"message":"Cannot GET /"} — correct REST behaviour, but indistinguishable
 * from an outage to a human. This says the service is alive and where the
 * console is, and deliberately stops there: the root is unauthenticated and the
 * Swagger UI is withheld in production, so listing routes here would publish
 * the API surface by another door.
 */
@ApiTags('health')
@Controller()
export class RootController {
  @Get()
  @ApiOperation({ summary: 'Service identity — no API surface is exposed here' })
  index() {
    return {
      service: 'Probocaller API',
      status: 'ok',
      console: 'https://probocaller-admin.proboit.co.za',
      health: '/health',
    };
  }
}
