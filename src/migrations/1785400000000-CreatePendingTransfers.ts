import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Money sent to a number that is not on ProboCaller yet.
 *
 * The sender is debited immediately, so the funds must be accounted for
 * somewhere. Holding them here rather than crediting a placeholder account
 * means no real balance ever sits against an unverified number nobody controls:
 * whoever signs up on that number claims it, and an unclaimed transfer is
 * refunded to the sender after it expires.
 */
export class CreatePendingTransfers1785400000000 implements MigrationInterface {
    name = 'CreatePendingTransfers1785400000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pending_transfers" ("id" SERIAL NOT NULL, "senderUserId" integer NOT NULL, "recipientPhone" character varying NOT NULL, "amount" numeric(10,4) NOT NULL, "note" character varying, "status" character varying NOT NULL DEFAULT 'pending', "claimedByUserId" integer, "claimedAt" TIMESTAMP, "expiresAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pending_transfers" PRIMARY KEY ("id"))`);
        // The claim path runs on every signup and filters on exactly this pair.
        await queryRunner.query(`CREATE INDEX "IDX_pending_transfers_phone_status" ON "pending_transfers" ("recipientPhone", "status") `);
        // Sweeping expired holds back to their senders.
        await queryRunner.query(`CREATE INDEX "IDX_pending_transfers_status_expiresAt" ON "pending_transfers" ("status", "expiresAt") `);
        await queryRunner.query(`ALTER TABLE "pending_transfers" ADD CONSTRAINT "FK_pending_transfers_sender" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pending_transfers" DROP CONSTRAINT "FK_pending_transfers_sender"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pending_transfers_status_expiresAt"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pending_transfers_phone_status"`);
        await queryRunner.query(`DROP TABLE "pending_transfers"`);
    }
}
