import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-business call attribution: stamp each call with the business, calling
 * number and campaign it came from. All nullable (personal/legacy calls carry
 * none). The business link is nulled — never cascade-deleted — so a business
 * being removed doesn't erase its call history.
 */
export class AddCallAttribution1784100000000 implements MigrationInterface {
    name = 'AddCallAttribution1784100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_logs" ADD "businessId" integer`);
        await queryRunner.query(`ALTER TABLE "call_logs" ADD "callingNumberId" integer`);
        await queryRunner.query(`ALTER TABLE "call_logs" ADD "campaignId" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_call_logs_businessId" ON "call_logs" ("businessId")`);
        await queryRunner.query(`CREATE INDEX "IDX_call_logs_campaignId" ON "call_logs" ("campaignId")`);
        await queryRunner.query(`
            ALTER TABLE "call_logs"
            ADD CONSTRAINT "FK_call_logs_business"
            FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE SET NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_logs" DROP CONSTRAINT "FK_call_logs_business"`);
        await queryRunner.query(`DROP INDEX "IDX_call_logs_campaignId"`);
        await queryRunner.query(`DROP INDEX "IDX_call_logs_businessId"`);
        await queryRunner.query(`ALTER TABLE "call_logs" DROP COLUMN "campaignId"`);
        await queryRunner.query(`ALTER TABLE "call_logs" DROP COLUMN "callingNumberId"`);
        await queryRunner.query(`ALTER TABLE "call_logs" DROP COLUMN "businessId"`);
    }
}
