import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  // CREDIT_ADDED | CALL_CHARGE | CALL_EARN | ADMIN_CREDIT | ADMIN_DEBIT | DATA_PURCHASE | DATA_EARN
  @Column()
  type: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  amount: number;

  @Column({ default: '' })
  description: string;

  @Column({ type: 'int', nullable: true, default: null })
  callId: number;

  @Column({ nullable: true })
  reference: string;

  @CreateDateColumn()
  createdAt: Date;
}
