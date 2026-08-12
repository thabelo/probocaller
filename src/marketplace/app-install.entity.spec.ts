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

  /**
   * The migration creates a partial unique index over active installs only.
   * The entity has to declare the same thing, or a `synchronize` schema — which
   * is what local development runs on — silently drops the uniqueness and a
   * double-install bug stays invisible until it violates the constraint in
   * production.
   */
  it('allows only one active install per user and app', () => {
    const index = getMetadataArgsStorage().indices.find(
      (i) => i.target === AppInstall,
    );

    expect(index?.unique).toBe(true);
    expect(index?.where).toMatch(/uninstalledAt.*IS NULL/);
  });
});
