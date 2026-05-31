import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Business } from './business.entity';

export const NUMBER_PURPOSES = {
  LIFE_COVER: 'Life Cover',
  TELE_SALES: 'Tele Sales',
  DEBT_COLLECTION: 'Debt Collection',
  INSURANCE: 'Insurance',
  SHORT_TERM_INSURANCE: 'Short-term Insurance',
  FUNERAL_COVER: 'Funeral Cover',
  MEDICAL_AID: 'Medical Aid',
  BANKING: 'Banking & Finance',
  CREDIT: 'Credit & Loans',
  INVESTMENT: 'Investment & Savings',
  FINANCIAL_SERVICES: 'Financial Services',
  HEALTHCARE: 'Healthcare',
  UTILITIES: 'Utilities',
  RETAIL: 'Retail & Shopping',
  REAL_ESTATE: 'Real Estate',
  AUTOMOTIVE: 'Automotive',
  TECH_SUPPORT: 'Tech Support',
  CUSTOMER_SERVICE: 'Customer Service',
  SURVEY: 'Survey & Research',
  POLITICAL: 'Political',
  CHARITY: 'Charity & Non-Profit',
  EDUCATION: 'Education',
  RECRUITMENT: 'Recruitment & HR',
  LEGAL: 'Legal Services',
  LOGISTICS: 'Logistics & Delivery',
  TELECOMMUNICATIONS: 'Telecommunications',
  FOOD_DELIVERY: 'Food & Delivery',
  TRAVEL: 'Travel & Tourism',
  ENTERTAINMENT: 'Entertainment & Media',
  GOVERNMENT: 'Government Services',
  EMERGENCY: 'Emergency Services',
  MARKETING: 'Marketing & Promotions',
  COLLECTIONS: 'Collections',
  VERIFICATION: 'Verification & KYC',
  APPOINTMENT: 'Appointment Reminder',
  FRAUD_PREVENTION: 'Fraud Prevention',
  WARRANTY: 'Warranty & Claims',
  LOYALTY: 'Loyalty & Rewards',
} as const;

export type NumberPurpose = keyof typeof NUMBER_PURPOSES;

@Entity('business_numbers')
export class BusinessNumber {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  businessId: number;

  @ManyToOne(() => Business, (b) => b.numbers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  phoneNumber: string;

  @Column()
  purpose: string;

  @Column({ nullable: true })
  label: string;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
