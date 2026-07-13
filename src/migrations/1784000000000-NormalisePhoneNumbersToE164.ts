import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Store every phone number in canonical E.164.
 *
 * Rules (identical to src/common/phone.ts — we never guess a country):
 *   "+27…"        -> kept
 *   "0027…"       -> "+27…"
 *   "0" + 9 digits-> "+27…"   (the SA national form the app already assumes)
 *   anything else -> left untouched; no country can be inferred.
 *
 * `users.phoneNumber` is UNIQUE, and some accounts exist twice — once national,
 * once international (e.g. "0801234567" and "+27801234567"). Normalising those
 * would violate the constraint, and deciding which account survives is a merge,
 * not a migration. Those rows are therefore SKIPPED and left for a human.
 */
export class NormalisePhoneNumbersToE1641784000000000 implements MigrationInterface {
    name = 'NormalisePhoneNumbersToE1641784000000000'

    // Neither a dial code nor a national significant number begins with 0, so a
    // string like "0000000000" is not a phone number and is left untouched.
    private static readonly E164 = `
        CASE
            WHEN "phoneNumber" ~ '^\\+[1-9][0-9]{5,14}$' THEN "phoneNumber"
            WHEN "phoneNumber" ~ '^00[1-9][0-9]{5,14}$' THEN '+' || substring("phoneNumber" from 3)
            WHEN "phoneNumber" ~ '^0[1-9][0-9]{8}$' THEN '+27' || substring("phoneNumber" from 2)
            WHEN "phoneNumber" ~ '^27[1-9][0-9]{8}$' THEN '+' || "phoneNumber"
            ELSE NULL
        END`;

    public async up(queryRunner: QueryRunner): Promise<void> {
        const e164 = NormalisePhoneNumbersToE1641784000000000.E164;

        // business_numbers — unique, but no collisions are possible here because
        // a duplicate number was already rejected at insert time.
        await queryRunner.query(`
            UPDATE "business_numbers"
            SET "phoneNumber" = ${e164}
            WHERE ${e164} IS NOT NULL AND ${e164} <> "phoneNumber"
        `);

        // users — skip any row whose normalised value already belongs to another user.
        await queryRunner.query(`
            UPDATE "users" u
            SET "phoneNumber" = n.e164
            FROM (SELECT id, ${e164} AS e164 FROM "users") n
            WHERE n.id = u.id
              AND n.e164 IS NOT NULL
              AND n.e164 <> u."phoneNumber"
              AND NOT EXISTS (
                  SELECT 1 FROM "users" other
                  WHERE other."phoneNumber" = n.e164 AND other.id <> u.id
              )
        `);
    }

    public async down(): Promise<void> {
        // Irreversible: the original national/international spelling is not retained.
    }
}
