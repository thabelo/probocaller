import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { CallLog } from './call.entity';
import { Business } from '../business/business.entity';

@Entity('call_ratings')
export class CallRating {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  callId: number;

  @ManyToOne(() => CallLog)
  @JoinColumn({ name: 'callId' })
  call: CallLog;

  @Column()
  raterId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'raterId' })
  rater: User;

  @Column()
  businessId: number;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'text', nullable: true, default: null })
  comment: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
