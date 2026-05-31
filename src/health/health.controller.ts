// GREEN step of TDD cycle.
// Failing spec at ./health.controller.spec.ts was authored first and currently
// fails with "Cannot find module './health.controller'". This file is the
// minimum implementation to turn that red into green — under 10 lines of logic.
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
