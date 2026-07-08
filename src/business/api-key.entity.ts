import {
  Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index,
} from 'typeorm';
import { Business } from './business.entity';

/**
 * An API key a business uses to call the /leads API. A business can have many,
 * each scoped to a set of profile-field keys it may access (empty = all fields).
 */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  businessId: number;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Index({ unique: true })
  @Column()
  key: string;

  @Column({ nullable: true })
  label: string | null;

  // Profile-field keys this key may access. Empty = all fields.
  @Column('simple-array', { default: '' })
  scopes: string[];

  @Column({ default: false })
  revoked: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
