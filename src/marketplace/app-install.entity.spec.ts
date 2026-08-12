import { getMetadataArgsStorage } from 'typeorm';
import { AppInstall } from './app-install.entity';

/**
 * One row per app a user has installed.
 *
 * Removing an app is a REVOKE, not a delete: the row survives with
 * `uninstalledAt` set. Two things depend on that. Consent history has to remain
 * auditable after the user opts out (Databroker's install IS the data-sharing
 * consent), and reinstalling has to restore the user's previous settings rather
 * than silently resetting them.
 */
describe('AppInstall entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === AppInstall)
      .map((c) => c.propertyName);

  it('records removal as a reversible revoke rather than deleting the row', () => {
    expect(columns()).toContain('uninstalledAt');
  });

  it('keeps per-app settings so a reinstall restores what the user had', () => {
    expect(columns()).toContain('settingsJson');
  });
});
