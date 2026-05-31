import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { KybSubmission } from './kyb-submission.entity';

@Entity('kyb_documents')
export class KybDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  submissionId: number;

  @ManyToOne(() => KybSubmission, (s) => s.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: KybSubmission;

  // Matches a key in the country's documents array (e.g. 'cipc_certificate')
  @Column()
  documentType: string;

  @Column()
  originalName: string;

  // Path relative to the uploads root (e.g. 'kyb/42/cipc_certificate/file.pdf')
  @Column()
  filePath: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  fileSizeBytes: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
