import { MigrationInterface, QueryRunner } from "typeorm";

export class CallScreening1780600000000 implements MigrationInterface {
    name = 'CallScreening1780600000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "call_screenings" (
                "id" SERIAL NOT NULL,
                "userId" integer NOT NULL,
                "callerNumber" character varying NOT NULL,
                "action" character varying NOT NULL,
                "transcript" text,
                "summary" text,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_call_screenings" PRIMARY KEY ("id")
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "call_screenings"`);
    }

}
