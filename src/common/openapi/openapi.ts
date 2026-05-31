import { DocumentBuilder } from '@nestjs/swagger';
import * as pkg from '../../../package.json';

const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Probocaller API')
    .setDescription('Probocaller backend API documentation')
    .setVersion((pkg as any).version || '0.0.0')
    .addTag('users')
    .addTag('calls')
    .addTag('admin')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
}

export function shouldExposeDocsUi(env: NodeJS.ProcessEnv | Record<string, string | undefined>): boolean {
  if (env.NODE_ENV !== 'production') return true;
  return TRUTHY.has(String(env.ENABLE_DOCS ?? '').toLowerCase());
}
