import { MigrationInterface, QueryRunner } from "typeorm";

export class PayToContactEscrow1780000000000 implements MigrationInterface {
    name = 'PayToContactEscrow1780000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_permission_requests" ADD "bidAmount" numeric(10,4) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" ADD "escrowAmount" numeric(10,4)`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" ADD "escrowStatus" character varying NOT NULL DEFAULT 'none'`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" ADD "settledAt" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "call_permission_requests" DROP COLUMN "settledAt"`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" DROP COLUMN "escrowStatus"`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" DROP COLUMN "escrowAmount"`);
        await queryRunner.query(`ALTER TABLE "call_permission_requests" DROP COLUMN "bidAmount"`);
    }

}
