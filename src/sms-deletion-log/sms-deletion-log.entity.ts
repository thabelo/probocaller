import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('sms_deletion_logs')
@Index(['userId', 'deletedAt'])
export class SmsDeletionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  sender: string;

  @Column()
  matchedPattern: string;

  @Column({ nullable: true })
  matchedText: string;

  // Encrypted SMS body — opaque ciphertext. The server NEVER sees plaintext.
  // Both fields are populated together when the user opts into "backup SMS to server".
  @Column({ type: 'text', nullable: true })
  bodyEncrypted: string;

  @Column({ nullable: true })
  iv: string;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  deletedAt: Date;
}
