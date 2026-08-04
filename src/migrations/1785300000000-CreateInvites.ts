import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Person-to-person invites. Separate from `admin_invites`, which grants an admin
 * role — this records an ordinary user inviting someone to the product, giving
 * the referral chain an auditable origin instead of only appearing once the
 * invitee happens to sign up.
 */
export class CreateInvites1785300000000 implements MigrationInterface {
    name = 'CreateInvites1785300000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "invites" ("id" SERIAL NOT NULL, "inviterUserId" integer NOT NULL, "phoneNumber" character varying NOT NULL, "referralCode" character varying NOT NULL, "channel" character varying NOT NULL DEFAULT 'sms', "status" character varying NOT NULL DEFAULT 'sent', "acceptedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_invites" PRIMARY KEY ("id"))`);
        // Admin list sorts by recency within a status.
        await queryRunner.query(`CREATE INDEX "IDX_invites_status_createdAt" ON "invites" ("status", "createdAt") `);
        // Accept-on-signup looks the invite up by the invited number.
        await queryRunner.query(`CREATE INDEX "IDX_invites_phoneNumber" ON "invites" ("phoneNumber") `);
        // One live invite per (inviter, number): re-inviting the same person
        // refreshes that row rather than piling up duplicates in the admin view.
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_invites_inviter_phone" ON "invites" ("inviterUserId", "phoneNumber") `);
        await queryRunner.query(`ALTER TABLE "invites" ADD CONSTRAINT "FK_invites_inviter" FOREIGN KEY ("inviterUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "invites" DROP CONSTRAINT "FK_invites_inviter"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_invites_inviter_phone"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_invites_phoneNumber"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_invites_status_createdAt"`);
        await queryRunner.query(`DROP TABLE "invites"`);
    }
}
