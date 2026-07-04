import { MigrationInterface, QueryRunner } from "typeorm";

export class AddReferredByIndex1781388256956 implements MigrationInterface {
    name = 'AddReferredByIndex1781388256956'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_users_referredBy" ON "users" ("referredBy")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_users_referredBy"`);
    }
}
