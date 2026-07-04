# Database migrations

## Production boot contract

In production (`NODE_ENV=production`, or `RUN_MIGRATIONS=true`) the app boots with
`synchronize: false` and `migrationsRun: true` — TypeORM applies every pending
migration on startup **before** any module loads. So the migrations in this
folder must, on their own, build the **entire** schema from an empty database.
Dev uses `synchronize: true`, which silently creates tables from entities and
therefore hides any migration gaps — never rely on it to validate a deploy.

## Baseline schema (squash)

`*-BaselineSchema.ts` is a single squashed baseline that `CREATE`s every table.

It replaced four older migrations that were **ALTER-only** — they assumed tables
already existed, so a fresh production database crashed on boot with
`relation "call_logs" does not exist`. They only ever "worked" via dev
`synchronize`. Because the product had never deployed to production, there was no
real migration history to preserve, so the chain was squashed to one correct
baseline generated from the full entity set.

## Single source of truth for entities

Both the runtime (`src/app.module.ts`) and the migration CLI (`data-source.ts`)
import the entity list from [`src/common/db/entities.ts`](../common/db/entities.ts).
This is what prevents the original failure mode: `data-source.ts` used to list
only 14 of 27 entities, so migration tooling was blind to 13 tables. The guard
test [`src/common/db/entities.spec.ts`](../common/db/entities.spec.ts) fails if the
list is incomplete. **Add new entities there and nowhere else.**

## Verifying a fresh-DB deploy locally

This is the exact check to run in CI before any deploy — it reproduces a clean
production first boot against a throwaway database:

```bash
# 1. empty database
psql -h localhost -U "$DB_USER" -d postgres -c 'CREATE DATABASE probocaller_verify;'

# 2. run the whole migration chain against it
DB_NAME=probocaller_verify npx ts-node ./node_modules/typeorm/cli.js migration:run -d data-source.ts

# 3. confirm the full schema exists (expect 27 entity tables + the `migrations` table)
psql -h localhost -U "$DB_USER" -d probocaller_verify \
  -tAc "select count(*) from information_schema.tables where table_schema='public';"

# 4. cleanup
psql -h localhost -U "$DB_USER" -d postgres -c 'DROP DATABASE probocaller_verify WITH (FORCE);'
```

## Generating new migrations

```bash
npm run migration:generate --name=MyChange   # diffs entities vs a live DB
```

### Known quirk — decimal column defaults

`migration:generate` always re-emits these two lines, no matter the schema state:

```sql
ALTER TABLE "call_logs"      ALTER COLUMN "ratePerSecond" SET DEFAULT '0.002'
ALTER TABLE "profile_fields" ALTER COLUMN "creditCost"    SET DEFAULT '0.01'
```

This is a TypeORM ↔ Postgres `numeric` default-formatting mismatch (Postgres
reports `0.002`, the entity declares `'0.002'`) — it can never be reconciled by
`generate`. The baseline already creates these columns with the correct defaults,
so the re-emitted ALTERs are idempotent no-ops. Delete them from any newly
generated migration unless you actually changed those defaults. (This churn is
exactly what the old, now-removed `InitialSchema` migration was.)
