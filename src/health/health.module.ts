// GREEN step: minimum module to expose HealthController.
// Failing spec at ./health.module.spec.ts authored first.
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
