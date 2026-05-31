import { usePinoLogger } from './use-pino-logger';
import { Logger as PinoLogger } from 'nestjs-pino';

describe('usePinoLogger', () => {
  it('resolves the PinoLogger from the app and installs it via useLogger', () => {
    const pino = {} as PinoLogger;
    const app = {
      get: jest.fn().mockReturnValue(pino),
      useLogger: jest.fn(),
    };

    usePinoLogger(app as any);

    expect(app.get).toHaveBeenCalledWith(PinoLogger);
    expect(app.useLogger).toHaveBeenCalledWith(pino);
  });
});
