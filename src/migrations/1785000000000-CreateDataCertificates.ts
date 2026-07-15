import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Data-usage certificates: issued to a business when it purchases lead data for
 * a period; the public `code` validates the business's authorisation window over
 * the covered numbers, and holding one unlocks the Leads view.
 */
export class CreateDataCertificates1785000000000 implements MigrationInterface {
  name = 'CreateDataCertificates1785000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "data_certificates" (
        "id" SERIAL NOT NULL,
        "code" character varying NOT NULL,
        "name" character varying NOT NULL DEFAULT '',
        "businessId" integer NOT NULL,
        "businessName" character varying NOT NULL DEFAULT '',
        "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL,
        "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
        "leadCount" integer NOT NULL DEFAULT 0,
        "basePrice" numeric(12,4) NOT NULL DEFAULT 0,
        "leadsCost" numeric(12,4) NOT NULL DEFAULT 0,
        "totalPrice" numeric(12,4) NOT NULL DEFAULT 0,
        "userIds" jsonb NOT NULL DEFAULT '[]',
        "purpose" character varying,
        "issuedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_data_certificates" PRIMARY KEY ("id")
      )
    `);
    await q.query(`CREATE UNIQUE INDEX "IDX_data_certificates_code" ON "data_certificates" ("code")`);
    await q.query(`
      ALTER TABLE "data_certificates"
      ADD CONSTRAINT "FK_data_certificates_business"
      FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "data_certificates" DROP CONSTRAINT "FK_data_certificates_business"`);
    await q.query(`DROP INDEX "IDX_data_certificates_code"`);
    await q.query(`DROP TABLE "data_certificates"`);
  }
}
