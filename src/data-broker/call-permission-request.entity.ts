import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';

@Entity('call_permission_requests')
export class CallPermissionRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  businessId: number;

  @ManyToOne(() => Business, { eager: true })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  // 'pending' | 'approved' | 'rejected'
  @Column({ default: 'pending' })
  status: string;

  @Column({ type: 'varchar', length: 160, nullable: true, default: null })
  pitch: string | null;

  @Column({ nullable: true, default: null })
  callCategory: string | null;

  // Pay-to-Contact: the credits a business stakes to request this call.
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  bidAmount: number;

  // Amount currently held in escrow against this request (null once settled/refunded).
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true, default: null })
  escrowAmount: number | null;

  // 'none' | 'held' | 'released' | 'refunded'
  @Column({ default: 'none' })
  escrowStatus: string;

  @Column({ type: 'timestamp', nullable: true, default: null })
  settledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  approvedAt: Date | null;

  // Free-call whitelist: when the user allows the business to call FREE for a
  // window, freeCall=true and expiresAt bounds it. Calls from this business are
  // not charged until expiresAt passes.
  @Column({ default: false })
  freeCall: boolean;

  @Column({ type: 'timestamp', nullable: true, default: null })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
