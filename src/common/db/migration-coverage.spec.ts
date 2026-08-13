import * as fs from 'fs';
import * as path from 'path';
import { getMetadataArgsStorage } from 'typeorm';
import { ENTITIES } from './entities';

/**
 * Guard: every column an entity declares must be created by a migration.
 *
 * Dev runs with synchronize:true, so a column added to an entity works locally
 * the moment it is typed. Production runs migrations only. A column with no
 * migration therefore passes every local check and every test, and then fails
 * on production for as long as nobody looks at the logs.
 *
 * That is not hypothetical: Business.walletBalance was added to the entity with
 * no migration at all, and production logged 2537 "column
 * BusinessNumber__BusinessNumber_business.walletBalance does not exist" errors —
 * breaking caller-ID lookups and the privacy screen — before this test existed.
 */
describe('migration coverage (every entity column is migrated)', () => {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const sql = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), 'utf8'))
    .join('\n');

  /**
   * Columns the migrations give a table, from both shapes that create one:
   * the CREATE TABLE body and any later ALTER TABLE … ADD.
   */
  const migratedColumns = (table: string): Set<string> => {
    const found = new Set<string>();

    const created = new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?"${table}" \\(([\\s\\S]*?)\\)\``, 'g');
    for (const match of sql.matchAll(created)) {
      for (const col of match[1].matchAll(/"([A-Za-z0-9_]+)"\s+[a-zA-Z]/g)) found.add(col[1]);
    }

    const altered = new RegExp(`ALTER TABLE "${table}" ADD (?:COLUMN )?(?:IF NOT EXISTS )?"([A-Za-z0-9_]+)"`, 'g');
    for (const match of sql.matchAll(altered)) found.add(match[1]);

    return found;
  };

  const tableFor = (entity: unknown): string | null => {
    const meta = getMetadataArgsStorage().tables.find((t) => t.target === entity);
    return (meta?.name as string) || null;
  };

  // Relation columns (userId, businessId, …) are emitted by the relation, not a
  // @Column, so this covers plain declared columns only.
  const declaredColumns = (entity: unknown): string[] =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === entity)
      .map((c) => c.options.name || c.propertyName);

  /**
   * The louder case the per-column check below deliberately skips: a table no
   * migration creates AT ALL. Every column is "missing", so skipping it there
   * kept the failure quiet — and nothing else actually owned it. An entity in
   * ENTITIES with no CREATE TABLE anywhere works perfectly under the local
   * synchronize:true schema and makes a fresh-database deploy impossible.
   */
  it.each(ENTITIES.map((e) => [(e as { name: string }).name, e] as const))(
    '%s has a table created by a migration',
    (_name, entity) => {
      const table = tableFor(entity);
      if (!table) return; // not a persisted table — nothing to migrate

      expect({ table, migrated: migratedColumns(table).size > 0 }).toEqual({ table, migrated: true });
    },
  );

  it.each(ENTITIES.map((e) => [(e as { name: string }).name, e] as const))(
    '%s has a migration for every column it declares',
    (_name, entity) => {
      const table = tableFor(entity);
      if (!table) return; // not a persisted table — nothing to migrate

      const migrated = migratedColumns(table);
      // A table absent from every migration is a separate, louder failure than
      // a single missing column; ENTITIES/baseline coverage owns that case.
      if (migrated.size === 0) return;

      const missing = declaredColumns(entity).filter((c) => !migrated.has(c));
      expect({ table, missing }).toEqual({ table, missing: [] });
    },
  );
});
