import { TestingModule } from '@nestjs/testing';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createIntegrationModule } from './integration/harness';
import { ConsentModule } from '../src/consent/consent.module';
import { ConsentService } from '../src/consent/consent.service';
import { User } from '../src/user/user.entity';

/**
 * Real-DB integration proof: the consent flow round-trips through Postgres,
 * including the `revokedAt IS NULL` filter that drives "active" consent — the
 * exact kind of SQL semantics a mocked repo can't validate.
 */
describe('Consent flow (integration, real Postgres)', () => {
  let moduleRef: TestingModule;
  let consent: ConsentService;
  let users: Repository<User>;
  let userId: number;

  beforeAll(async () => {
    moduleRef = await createIntegrationModule([
      TypeOrmModule.forFeature([User]),
      ConsentModule,
    ]);
    consent = moduleRef.get(ConsentService);
    users = moduleRef.get(getRepositoryToken(User));
    const u = await users.save(
      users.create({ phoneNumber: `+27it${Date.now()}`, email: 'it@probo.local', name: 'Integration' }),
    );
    userId = u.id;
  });

  afterAll(async () => {
    if (users && userId) await users.delete({ id: userId }); // cascades to user_consents
    if (moduleRef) await moduleRef.close();
  });

  it('persists a granted consent and reads it back as active', async () => {
    await consent.grant(userId, 'data_sharing', '1.0.0');
    expect(await consent.hasActiveConsent(userId, 'data_sharing')).toBe(true);
    const active = await consent.getActive(userId);
    expect(active.find((c) => c.consentType === 'data_sharing')?.version).toBe('1.0.0');
  });

  it('supersedes the prior consent when re-granted (one active row, history kept)', async () => {
    await consent.grant(userId, 'data_sharing', '2.0.0');
    const active = await consent.getActive(userId);
    const dataSharing = active.filter((c) => c.consentType === 'data_sharing');
    expect(dataSharing).toHaveLength(1);
    expect(dataSharing[0].version).toBe('2.0.0');
  });

  it('revokes consent so it is no longer active', async () => {
    await consent.revoke(userId, 'data_sharing');
    expect(await consent.hasActiveConsent(userId, 'data_sharing')).toBe(false);
  });
});
