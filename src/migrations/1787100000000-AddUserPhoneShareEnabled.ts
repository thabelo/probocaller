import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Consent flag for handing a user's phone number to a business alongside the
 * profile data it buys.
 *
 * Defaults to TRUE: the leads payload has always included the number, so this
 * column records the status quo rather than changing it. An account that wants
 * the number withheld now has a switch; nobody's delivery changes on deploy.
 */
export class AddUserPhoneShareEnabled1787100000000 implements MigrationInterface {
    name = 'AddUserPhoneShareEnabled1787100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "phoneShareEnabled" boolean NOT NULL DEFAULT true`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "phoneShareEnabled"`);
    }
}
