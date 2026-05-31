import * as path from 'path';
import { INestApplication, LoggerService } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { buildSwaggerConfig, shouldExposeDocsUi } from './openapi';
import { writeOpenApi } from './write-openapi';

export function setupOpenApi(
  app: INestApplication,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  logger: Pick<LoggerService, 'log' | 'warn'>,
): void {
  const doc = SwaggerModule.createDocument(app, buildSwaggerConfig());
  const out = env.OPENAPI_OUT
    ? path.resolve(env.OPENAPI_OUT)
    : path.resolve(process.cwd(), 'openapi.json');
  try {
    writeOpenApi(doc, out);
    logger.log?.(`OpenAPI schema written to ${out}`);
  } catch (err: any) {
    logger.warn?.(`Failed to write OpenAPI schema to ${out}: ${err.message}`);
  }
  if (shouldExposeDocsUi(env)) {
    SwaggerModule.setup('docs', app, doc);
  }
}
