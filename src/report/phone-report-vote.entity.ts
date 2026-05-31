import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Unique } from 'typeorm';

@Entity('phone_report_votes')
@Unique(['reporterPhone', 'reportedPhone'])
export class PhoneReportVote {
  @PrimaryGeneratedColumn()
  id: number;

  /** The phone number of the user who submitted the report */
  @Column()
  reporterPhone: string;

  /** The phone number being reported (E.164) */
  @Column()
  reportedPhone: string;

  /** Reporter-selected reason: spam | scam | robocall | harassment | debt | other */
  @Column({ nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
