import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Push device registrations. The token is UNIQUE because it identifies a
 * handset, not a person: a device handed to another account must move, not
 * duplicate, or pushes leak to the previous owner.
 */
export class CreateDeviceTokens1786900000000 implements MigrationInterface {
    name = 'CreateDeviceTokens1786900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS "device_tokens" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "token" character varying NOT NULL, "platform" character varying NOT NULL DEFAULT 'android', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_device_tokens_token" UNIQUE ("token"), CONSTRAINT "PK_device_tokens" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_device_tokens_userId" ON "device_tokens" ("userId")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_device_tokens_userId"`);
        await queryRunner.query(`DROP TABLE "device_tokens"`);
    }
}
