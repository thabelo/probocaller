import { buildPinoOptions } from './logger.module';

describe('logger configuration (buildPinoOptions)', () => {
  it('uses pino-pretty transport when NODE_ENV is not production', () => {
    const opts = buildPinoOptions('development');
    expect(opts.pinoHttp).toBeDefined();
    expect((opts.pinoHttp as any).transport).toEqual(
      expect.objectContaining({ target: 'pino-pretty' }),
    );
    expect((opts.pinoHttp as any).level).toBe('debug');
  });

  it('emits raw JSON (no transport) and info level in production', () => {
    const opts = buildPinoOptions('production');
    expect((opts.pinoHttp as any).transport).toBeUndefined();
    expect((opts.pinoHttp as any).level).toBe('info');
  });

  it('redacts known sensitive fields', () => {
    const opts = buildPinoOptions('production');
    const redactPaths = (opts.pinoHttp as any).redact.paths as string[];
    expect(redactPaths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
      ]),
    );
  });
});
