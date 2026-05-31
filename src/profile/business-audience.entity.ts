import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Business } from '../business/business.entity';

@Entity('business_audiences')
export class BusinessAudience {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  businessId: number;

  @ManyToOne(() => Business)
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  name: string;

  // { fieldKey: { op: 'eq'|'gte'|'lte'|'in', value: any } }
  @Column({ type: 'simple-json', default: '{}' })
  filters: Record<string, { op: string; value: any }>;

  @Column({ type: 'int', default: 0 })
  estimatedReach: number;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
