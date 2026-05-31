import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from '../user/user.entity';

@Entity('blocked_keywords')
@Unique(['userId', 'keyword'])
export class BlockedKeyword {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  keyword: string;

  @Column({ default: 'both' })
  scope: string; // 'sms' | 'call' | 'both'

  @Column({ default: true })
  active: boolean;

  @Column({ nullable: true })
  note: string;

  @CreateDateColumn()
  createdAt: Date;
}
