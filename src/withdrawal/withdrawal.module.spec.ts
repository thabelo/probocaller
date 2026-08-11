import 'reflect-metadata';
import { WithdrawalModule } from './withdrawal.module';
import { WithdrawalService } from './withdrawal.service';
import { ConfigModule } from '../config/config.module';

/**
 * WithdrawalService now reads WITHDRAWAL_PENDING_CAP through the shared
 * SettingsReaderService (ConfigModule), not process.env — the module must
 * actually import ConfigModule or the app refuses to boot.
 */
describe('WithdrawalModule wiring', () => {
  it('provides WithdrawalService and imports ConfigModule', () => {
    const imports = Reflect.getMetadata('imports', WithdrawalModule) || [];
    const providers = Reflect.getMetadata('providers', WithdrawalModule) || [];

    expect(providers).toContain(WithdrawalService);
    expect(imports).toEqual(expect.arrayContaining([ConfigModule]));
  });
});
