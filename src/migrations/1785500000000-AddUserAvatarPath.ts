import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Optional profile photo.
 *
 * The Create-profile screen has always promised "your name and profile picture
 * will be used for caller Id", while nothing in the stack could store one.
 * Nullable because it stays optional — an account without a photo is normal,
 * not incomplete. Holds a relative path under uploads/; the bytes live on disk.
 */
export class AddUserAvatarPath1785500000000 implements MigrationInterface {
  name = 'AddUserAvatarPath1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarPath" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatarPath"`);
  }
}
