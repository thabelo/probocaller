import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';

@Entity('data_access_logs')
export class DataAccessLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  businessId: number;

  @Column('simple-array')
  fieldsAccessed: string[];

  @Column({ nullable: true })
  purpose: string;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  creditsCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  userEarnings: number;

  // When this consent expires (null = permanent until revoked)
  @Column({ nullable: true, type: 'timestamptz' })
  consentExpiresAt: Date | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @CreateDateColumn()
  accessedAt: Date;
}
