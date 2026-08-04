import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { FicaSubmission } from './fica-submission.entity';

/** Required document types — keep aligned with `REQUIRED_DOCS` in fica.service.ts */
/**
 * `id_document` is LEGACY: submissions made before SA KYC required both sides of
 * the card hold a single one. It is no longer offered, but is still accepted and
 * counts as the front, so those people are not dragged back to draft.
 */
export type FicaDocType =
  | 'id_front'
  | 'id_back'
  | 'id_document'
  | 'proof_of_address'
  | 'selfie';

@Entity('fica_documents')
export class FicaDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column()
  submissionId: number;

  @ManyToOne(() => FicaSubmission, (s) => s.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submissionId' })
  submission: FicaSubmission;

  @Column()
  documentType: FicaDocType;

  @Column()
  originalName: string;

  /** Path under `uploads/` */
  @Column()
  filePath: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  fileSizeBytes: number;

  @CreateDateColumn()
  uploadedAt: Date;
}
