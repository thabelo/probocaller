import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type AdminInviteStatus = 'pending' | 'redeemed' | 'revoked';

@Entity('admin_invites')
@Index(['status'])
export class AdminInvite {
  @PrimaryGeneratedColumn()
  id: number;

  // The phone number being invited to become an admin (E.164).
  @Column()
  phoneNumber: string;

  // One-time secret the invitee presents to redeem the invite.
  @Column({ unique: true })
  token: string;

  @Column({ default: 'admin' })
  role: string;

  @Column()
  invitedByUserId: number;

  @Column({ default: 'pending' })
  status: AdminInviteStatus;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  redeemedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
