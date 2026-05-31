// GREEN step: implementation paired with ./logger.module.spec.ts (authored first, currently failing).
import { LoggerModule, Params } from 'nestjs-pino';

export function buildPinoOptions(nodeEnv: string | undefined): Params {
  const isProd = nodeEnv === 'production';
  return {
    pinoHttp: {
      level: isProd ? 'info' : 'debug',
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: { singleLine: true, translateTime: 'SYS:standard' },
          },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.accessToken',
          '*.refreshToken',
        ],
        censor: '[REDACTED]',
      },
      autoLogging: true,
    },
  };
}

export const AppLoggerModule = LoggerModule.forRoot(buildPinoOptions(process.env.NODE_ENV));
