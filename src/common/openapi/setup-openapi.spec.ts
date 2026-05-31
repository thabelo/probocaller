jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({ openapi: '3.0.0', info: { title: 'fake' } }),
      setup: jest.fn(),
    },
  };
});
jest.mock('./write-openapi', () => ({ writeOpenApi: jest.fn() }));

import { SwaggerModule } from '@nestjs/swagger';
import { writeOpenApi } from './write-openapi';
import { setupOpenApi } from './setup-openapi';

const noopLogger = { log: jest.fn(), warn: jest.fn() } as any;

describe('setupOpenApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('always builds and writes the openapi document', () => {
    setupOpenApi({} as any, { NODE_ENV: 'production' }, noopLogger);
    expect(SwaggerModule.createDocument).toHaveBeenCalledTimes(1);
    expect(writeOpenApi).toHaveBeenCalledTimes(1);
  });

  it('uses OPENAPI_OUT env override when provided', () => {
    setupOpenApi({} as any, { NODE_ENV: 'production', OPENAPI_OUT: '/tmp/foo.json' }, noopLogger);
    expect((writeOpenApi as jest.Mock).mock.calls[0][1]).toBe('/tmp/foo.json');
  });

  it('mounts /docs in development', () => {
    setupOpenApi({} as any, { NODE_ENV: 'development' }, noopLogger);
    expect(SwaggerModule.setup).toHaveBeenCalledWith('docs', expect.anything(), expect.anything());
  });

  it('does NOT mount /docs in production by default', () => {
    setupOpenApi({} as any, { NODE_ENV: 'production' }, noopLogger);
    expect(SwaggerModule.setup).not.toHaveBeenCalled();
  });

  it('mounts /docs in production when ENABLE_DOCS=true', () => {
    setupOpenApi({} as any, { NODE_ENV: 'production', ENABLE_DOCS: 'true' }, noopLogger);
    expect(SwaggerModule.setup).toHaveBeenCalled();
  });

  it('logs a warning instead of throwing if write fails', () => {
    (writeOpenApi as jest.Mock).mockImplementationOnce(() => { throw new Error('disk full'); });
    setupOpenApi({} as any, { NODE_ENV: 'production' }, noopLogger);
    expect(noopLogger.warn).toHaveBeenCalledWith(expect.stringContaining('disk full'));
  });
});
