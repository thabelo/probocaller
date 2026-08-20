import * as fs from 'fs';
import * as path from 'path';

/**
 * Guard: the three apps the sign-up picker offers must be installable.
 *
 * After registering, a new user is shown one screen with Databroker, Surveys
 * and the Caller Management App all toggled on, and pressing Continue installs
 * whatever is still on. Only a 'live' app can be installed, so an app that is
 * missing from the catalogue — or parked at 'coming_soon' — turns a toggle the
 * user deliberately left on into a silent no-op.
 *
 * That is not hypothetical: Surveys shipped its screens while its catalogue row
 * was still 'coming_soon', so the picker would have offered an app the install
 * endpoint refuses.
 *
 * This reads the migrations rather than a live database because the seed IS the
 * migrations — the catalogue has no other source of truth at deploy time.
 */
describe('sign-up picker catalogue', () => {
  const migrationsDir = path.join(__dirname, '..', 'migrations');

  /**
   * Forward SQL only. A migration file holds its own rollback too, and reading
   * the whole file would let a `down` that parks Surveys back at 'coming_soon'
   * read as the state the catalogue actually ends up in.
   */
  const sql = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8').split(/public async down\s*\(/)[0])
    .join('\n');

  /** The status an app row ends up with: seeded, then any later UPDATE wins. */
  const statusOf = (key: string): string | null => {
    let status: string | null = null;

    // Seeded row: a VALUES tuple opening with the key. The status is the
    // 'live' | 'beta' | 'coming_soon' | 'retired' literal inside that tuple.
    const seeded = new RegExp(`\\('${key}',[\\s\\S]*?\\)(?=,\\s*\\n|\\s*\\n\\s*ON CONFLICT)`, 'g');
    for (const tuple of sql.matchAll(seeded)) {
      const found = tuple[0].match(/'(live|beta|coming_soon|retired)'/);
      if (found) status = found[1];
    }

    // A later status change, e.g. releasing an app that was announced early.
    const updated = new RegExp(
      `UPDATE "apps"\\s+SET "status" = '(live|beta|coming_soon|retired)'[\\s\\S]*?'${key}'`,
      'g',
    );
    for (const change of sql.matchAll(updated)) status = change[1];

    return status;
  };

  // Databroker is the base app and cannot be switched off in the picker;
  // Surveys and Caller Management are the two add-ons.
  it.each(['data-broker', 'surveys', 'caller-management'])(
    'seeds %s as live, so the picker can install it',
    (key) => {
      expect(statusOf(key)).toBe('live');
    },
  );

  /**
   * Everyone who registered before the picker existed already HAS caller
   * management — screening, the dialer and the messages and contacts tabs were
   * the app's default shell. Turning it into something you install means those
   * users need an install row, or the upgrade silently takes the whole calling
   * side of the app away from every existing account.
   */
  it('back-fills caller-management for users who registered before the picker', () => {
    const backfill = sql.match(
      /INSERT INTO "app_installs"[\s\S]*?'caller-management'[\s\S]*?FROM "users"/,
    );
    expect(backfill).not.toBeNull();
  });
});
