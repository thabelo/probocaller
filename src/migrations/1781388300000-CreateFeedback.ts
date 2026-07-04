import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFeedback1781388300000 implements MigrationInterface {
    name = 'CreateFeedback1781388300000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "feedback" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "category" character varying NOT NULL, "message" text NOT NULL, "appVersion" character varying, "platform" character varying, "status" character varying NOT NULL DEFAULT 'open', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_feedback" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_feedback_status_createdAt" ON "feedback" ("status", "createdAt") `);
        await queryRunner.query(`ALTER TABLE "feedback" ADD CONSTRAINT "FK_feedback_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "feedback" DROP CONSTRAINT "FK_feedback_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_feedback_status_createdAt"`);
        await queryRunner.query(`DROP TABLE "feedback"`);
    }
}
