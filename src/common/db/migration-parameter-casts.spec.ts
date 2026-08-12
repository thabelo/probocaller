import * as fs from 'fs';
import * as path from 'path';

/**
 * Guard: a migration parameter in a SELECT output position must carry a cast.
 *
 * Postgres infers a parameter's type from where it is used. In a SELECT list
 * there is nothing to infer from, so when the same parameter is also compared
 * against a column, the two positions deduce different types and the whole
 * migration run aborts with "inconsistent types deduced for parameter $1".
 *
 * That is not hypothetical. SeedDefaultScamKeywords shipped as:
 *
 *   INSERT INTO "scam_keywords" ("keyword", "active")
 *   SELECT $1, true WHERE NOT EXISTS (... WHERE "keyword" = $1)
 *
 * and took down the entire production migration run — every later migration,
 * the marketplace included, rolled back with it. Nothing caught it because dev
 * runs synchronize:true and never executes a migration at all.
 */
describe('migration parameters are cast in SELECT positions', () => {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => [f, fs.readFileSync(path.join(migrationsDir, f), 'utf8')] as const);

  /** `SELECT $1` / `SELECT $1,` — but not `SELECT $1::varchar`. */
  const UNCAST_PARAM_IN_SELECT = /SELECT\s+\$\d+(?!\s*::)/gi;

  it.each(files)('%s casts every parameter it selects', (_name, source) => {
    expect(source.match(UNCAST_PARAM_IN_SELECT) ?? []).toEqual([]);
  });
});
