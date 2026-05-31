// TDD GREEN step. Failing spec authored first at
// src/common/logging/use-pino-logger.spec.ts (currently red with
// "Cannot find module './use-pino-logger'"). Implementation is under
// 5 lines of substantive logic — just installs the resolved Pino logger.
import { INestApplication } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';

export function usePinoLogger(app: INestApplication): void {
  app.useLogger(app.get(PinoLogger));
}
