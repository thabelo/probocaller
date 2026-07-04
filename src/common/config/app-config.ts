/**
 * Single, typed view of per-environment configuration. Centralises the
 * NODE_ENV checks and env-derived settings that were scattered across the app so
 * dev / staging / production behave predictably and differ in one obvious place.
 */

type Env = Record<string, string | undefined>;

export type Environment = 'development' | 'staging' | 'production' | 'test';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  environment: Environment;
  isProduction: boolean;
  isStaging: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  port: number;
  enableDocs: boolean;
  corsOrigins: string[];
  logLevel: LogLevel;
}

function normalizeEnv(raw: string | undefined): Environment {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'production':
    case 'prod':
      return 'production';
    case 'staging':
    case 'stage':
      return 'staging';
    case 'test':
      return 'test';
    default:
      return 'development';
  }
}

export function resolveAppConfig(env: Env = process.env): AppConfig {
  const environment = normalizeEnv(env.NODE_ENV);
  const isProduction = environment === 'production';
  const isStaging = environment === 'staging';
  const isDevelopment = environment === 'development';
  const isTest = environment === 'test';

  const enableDocs =
    env.ENABLE_DOCS != null ? env.ENABLE_DOCS === 'true' : !isProduction;

  const logLevel = (env.LOG_LEVEL as LogLevel) || (isProduction ? 'info' : 'debug');

  return {
    environment,
    isProduction,
    isStaging,
    isDevelopment,
    isTest,
    port: parseInt(env.PORT || '3000', 10),
    enableDocs,
    corsOrigins: (env.CORS_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel,
  };
}
