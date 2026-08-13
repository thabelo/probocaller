import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Surveys (src/survey/) — see docs/product/surveys-spec.md.
 *
 * A business publishes a survey and pays for it up front: publishing debits
 * and HOLDS `pricePerResponse × targetResponses`, respondents are paid out of
 * that pot on completion, and the unspent remainder is refunded when the
 * survey closes or expires (§1.2). `totalHeld` / `totalPaid` live on the row so
 * the refund is a subtraction, not a replay of the ledger.
 *
 * Two uniqueness rules are enforced here rather than in a service, because
 * both guard money: one response per person per survey (a check-then-insert
 * would let two concurrent submissions both draw from the pot), and one answer
 * per question per response.
 *
 * `survey_responses.userId` exists for payment and de-duplication only. A
 * business sees answers plus the demographic bands it targeted, never an
 * identity (§2.1) — that is enforced in the API layer; the column being here
 * is not permission to return it.
 */
export class CreateSurveyTables1786700000000 implements MigrationInterface {
  name = 'CreateSurveyTables1786700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "survey_templates" ("id" SERIAL NOT NULL, "key" character varying NOT NULL, "name" character varying NOT NULL, "description" text NOT NULL DEFAULT '', "category" character varying(64) NOT NULL DEFAULT '', "questionsJson" jsonb NOT NULL DEFAULT '[]'::jsonb, "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_survey_templates" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_survey_templates_key" ON "survey_templates" ("key")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "surveys" ("id" SERIAL NOT NULL, "businessId" integer NOT NULL, "title" character varying NOT NULL, "description" text NOT NULL DEFAULT '', "category" character varying(64) NOT NULL DEFAULT '', "status" character varying(16) NOT NULL DEFAULT 'draft', "filtersJson" jsonb NOT NULL DEFAULT '{}'::jsonb, "targetResponses" integer NOT NULL DEFAULT 0, "pricePerResponse" numeric(12,2) NOT NULL DEFAULT 0, "totalHeld" numeric(12,2) NOT NULL DEFAULT 0, "totalPaid" numeric(12,2) NOT NULL DEFAULT 0, "expiresAt" TIMESTAMP, "publishedAt" TIMESTAMP, "closedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_surveys" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_surveys_businessId" ON "surveys" ("businessId")`);
    // The respondent-facing list and the expiry sweep both filter on status.
    await queryRunner.query(`CREATE INDEX "IDX_surveys_status" ON "surveys" ("status")`);
    await queryRunner.query(
      `ALTER TABLE "surveys" ADD CONSTRAINT "FK_surveys_businessId" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "survey_questions" ("id" SERIAL NOT NULL, "surveyId" integer NOT NULL, "type" character varying(32) NOT NULL, "prompt" text NOT NULL, "position" integer NOT NULL DEFAULT 0, "optionsJson" jsonb, "required" boolean NOT NULL DEFAULT true, "feeAtPublish" numeric(12,2) NOT NULL DEFAULT 0, CONSTRAINT "PK_survey_questions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_survey_questions_surveyId" ON "survey_questions" ("surveyId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_questions" ADD CONSTRAINT "FK_survey_questions_surveyId" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "survey_responses" ("id" SERIAL NOT NULL, "surveyId" integer NOT NULL, "userId" integer NOT NULL, "startedAt" TIMESTAMP NOT NULL, "submittedAt" TIMESTAMP, "amountPaid" numeric(12,2) NOT NULL DEFAULT 0, CONSTRAINT "PK_survey_responses" PRIMARY KEY ("id"))`,
    );
    // One response per person per survey — in the database, because two
    // concurrent submissions would both pass a check-then-insert and both be paid.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_survey_responses_survey_user" ON "survey_responses" ("surveyId", "userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_responses" ADD CONSTRAINT "FK_survey_responses_surveyId" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_responses" ADD CONSTRAINT "FK_survey_responses_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "survey_answers" ("id" SERIAL NOT NULL, "responseId" integer NOT NULL, "questionId" integer NOT NULL, "valueText" text, "valueJson" jsonb, CONSTRAINT "PK_survey_answers" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_survey_answers_response_question" ON "survey_answers" ("responseId", "questionId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_answers" ADD CONSTRAINT "FK_survey_answers_responseId" FOREIGN KEY ("responseId") REFERENCES "survey_responses"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_answers" ADD CONSTRAINT "FK_survey_answers_questionId" FOREIGN KEY ("questionId") REFERENCES "survey_questions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "survey_answers" DROP CONSTRAINT "FK_survey_answers_questionId"`);
    await queryRunner.query(`ALTER TABLE "survey_answers" DROP CONSTRAINT "FK_survey_answers_responseId"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_survey_answers_response_question"`);
    await queryRunner.query(`DROP TABLE "survey_answers"`);

    await queryRunner.query(`ALTER TABLE "survey_responses" DROP CONSTRAINT "FK_survey_responses_userId"`);
    await queryRunner.query(`ALTER TABLE "survey_responses" DROP CONSTRAINT "FK_survey_responses_surveyId"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_survey_responses_survey_user"`);
    await queryRunner.query(`DROP TABLE "survey_responses"`);

    await queryRunner.query(`ALTER TABLE "survey_questions" DROP CONSTRAINT "FK_survey_questions_surveyId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_survey_questions_surveyId"`);
    await queryRunner.query(`DROP TABLE "survey_questions"`);

    await queryRunner.query(`ALTER TABLE "surveys" DROP CONSTRAINT "FK_surveys_businessId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_surveys_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_surveys_businessId"`);
    await queryRunner.query(`DROP TABLE "surveys"`);

    await queryRunner.query(`DROP INDEX "public"."UQ_survey_templates_key"`);
    await queryRunner.query(`DROP TABLE "survey_templates"`);
  }
}
