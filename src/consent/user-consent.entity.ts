import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../user/user.entity';

export type ConsentType = 'data_sharing' | 'terms' | 'privacy';

@Entity('user_consents')
@Index(['userId', 'consentType'])
export class UserConsent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  consentType: ConsentType;

  // The version of the document/policy the user consented to.
  @Column()
  version: string;

  @Column({ type: 'timestamp' })
  grantedAt: Date;

  // Null while the consent is active; set when withdrawn.
  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
