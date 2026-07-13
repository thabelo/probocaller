import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A business is registered in a jurisdiction, and that jurisdiction decides its
 * KYB requirements. Nullable so existing rows keep loading; new registrations are
 * validated in BusinessService.register(). Existing rows are backfilled from the
 * country of their most recent KYB submission where one exists.
 */
export class AddBusinessCountry1783850000000 implements MigrationInterface {
    name = 'AddBusinessCountry1783850000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" ADD "country" character varying(2)`);
        await queryRunner.query(`
            UPDATE "businesses" b
            SET "country" = s."countryCode"
            FROM (
                SELECT DISTINCT ON ("businessId") "businessId", "countryCode"
                FROM "kyb_submissions"
                ORDER BY "businessId", "submittedAt" DESC
            ) s
            WHERE s."businessId" = b."id" AND b."country" IS NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "country"`);
    }
}
