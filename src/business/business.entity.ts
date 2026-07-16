import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from '../user/user.entity';
import { BusinessNumber } from './business-number.entity';

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  companyName: string;

  @Column({ nullable: true })
  registrationNumber: string;

  /**
   * ISO 3166-1 alpha-2 country the business is registered in. Required for new
   * businesses (it drives the KYB requirements); nullable so pre-existing rows
   * that predate this column keep loading.
   */
  @Column({ type: 'varchar', length: 2, nullable: true })
  country: string | null;

  @Column()
  industry: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column({ nullable: true })
  contactEmail: string;

  @Column({ nullable: true })
  contactPhone: string;

  @Column({ nullable: true })
  address: string;

  // Pay-to-Contact: default credits this business stakes to reach a user when a
  // call-permission request doesn't specify an explicit bid. 0 = no default.
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  defaultBidAmount: number;

  // Each business has its OWN wallet — business spend (leads, calls) draws from
  // here, funded by top-ups or transfers from the owner's personal balance.
  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  walletBalance: number;

  @Column({ default: false })
  verified: boolean;

  @Column({ default: true })
  active: boolean;

  // Trust tier: 'unverified' | 'verified' | 'trusted' | 'premium'
  @Column({ default: 'unverified' })
  tier: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  totalRatings: number;

  @OneToMany(() => BusinessNumber, (bn) => bn.business, { cascade: true, eager: true })
  numbers: BusinessNumber[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
