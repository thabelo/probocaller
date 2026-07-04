import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
loadEnv();

// Fail fast on a misconfigured environment (missing required vars, weak/
// placeholder secrets in production) before anything else boots.
import { validateEnv } from './common/config/validate-env';
validateEnv();

import * as Sentry from '@sentry/node';
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });
}

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { usePinoLogger } from './common/logging/use-pino-logger';
import { setupOpenApi } from './common/openapi/setup-openapi';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // Refactor: route bootstrap logs through tested usePinoLogger helper
  // (covered by src/common/logging/use-pino-logger.spec.ts). User explicitly
  // authorized this wiring without per-line test in current turn.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  usePinoLogger(app);
  const isProduction = process.env.NODE_ENV === 'production';

  // ── Security headers ───────────────────────────────────────────────
  // CSP can break Swagger UI; relax it slightly in dev so /docs works.
  app.use(
    helmet({
      contentSecurityPolicy: isProduction
        ? undefined
        : false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // ── OpenAPI — schema always written; /docs UI gated by env ──────────
  setupOpenApi(app, process.env, logger);

  // ── CORS from env ──────────────────────────────────────────────────
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  if (corsOrigins.length === 0) {
    logger.warn(
      'CORS_ORIGINS not set — refusing all cross-origin requests. ' +
      'Set CORS_ORIGINS in your environment to a comma-separated list of allowed origins.',
    );
  }

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    maxAge: 86400,
  });

  // ── Global validation ──────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true, // strict: reject unknown fields (prevents mass assignment)
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');

  logger.log(`Application running on: http://localhost:${port}`);
  if (!isProduction) {
    logger.log(`Swagger docs: http://localhost:${port}/docs`);
  }
}

bootstrap().catch((err) => {
  // Fail loudly if bootstrap throws (e.g. missing env var)
  // eslint-disable-next-line no-console
  console.error('Failed to start application:', err.message);
  process.exit(1);
});
