import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('profile_fields')
export class ProfileField {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  key: string;

  @Column()
  label: string;

  // 'select' | 'multi_select' | 'number' | 'boolean' | 'text'
  // multi_select holds an array of option values; 'all' means every option.
  @Column({ default: 'select' })
  type: string;

  // For 'select' type: [{ value: 'lt_5k', label: '< R5,000' }]
  @Column({ type: 'simple-json', default: '[]' })
  options: { value: string; label: string }[];

  // Contributes this many points toward the 100-point completion score
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  weight: number;

  // Credits a business pays to access this field per user
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0.01 })
  creditCost: number;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
