import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type DevicePlatform = 'android' | 'ios';

/**
 * One push token = one device. The token is unique across the table because it
 * identifies a HANDSET, not a person: if a device is handed on or the account
 * on it is switched, the token must follow the account that registered it last,
 * or pushes leak to the previous owner.
 */
@Entity('device_tokens')
@Index(['userId'])
export class DeviceToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column({ unique: true })
  token: string;

  @Column({ default: 'android' })
  platform: DevicePlatform;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
