import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessDefaultBid1783278541229 implements MigrationInterface {
    name = 'AddBusinessDefaultBid1783278541229'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" ADD "defaultBidAmount" numeric(12,2) NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "businesses" DROP COLUMN "defaultBidAmount"`);
    }
}
