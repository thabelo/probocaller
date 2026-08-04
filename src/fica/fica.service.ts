import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { extensionForMime } from '../common/mime-extension';
import { FicaSubmission, FicaStatus } from './entities/fica-submission.entity';
import { FicaDocument, FicaDocType } from './entities/fica-document.entity';

const ALLOWED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

export const REQUIRED_DOCS: { key: FicaDocType; label: string }[] = [
  // SA KYC needs BOTH sides: the back carries the barcode and issue details a
  // reviewer checks against the front.
  { key: 'id_front',         label: 'ID document — front' },
  { key: 'id_back',          label: 'ID document — back' },
  { key: 'proof_of_address', label: 'Proof of address (utility bill, < 3 months)' },
  { key: 'selfie',           label: 'Selfie holding your ID' },
];

/** Still accepted on upload, though no longer requested. See FicaDocType. */
const LEGACY_DOCS: FicaDocType[] = ['id_document'];

/** A legacy single-slot ID stands in for the front. */
const SATISFIED_BY: Partial<Record<FicaDocType, FicaDocType[]>> = {
  id_front: ['id_document'],
};

const ACTIVE: FicaStatus[] = ['draft', 'pending'];

export interface SubmitFicaInput {
  fullName: string;
  idNumber: string;
  idType?: string;
  residentialAddress: string;
}

@Injectable()
export class FicaService {
  private readonly uploadsRoot = path.resolve(process.cwd(), 'uploads');

  constructor(
    @InjectRepository(FicaSubmission)
    private readonly submissionRepo: Repository<FicaSubmission>,
    @InjectRepository(FicaDocument)
    private readonly documentRepo: Repository<FicaDocument>,
  ) {
    if (!fs.existsSync(this.uploadsRoot)) fs.mkdirSync(this.uploadsRoot, { recursive: true });
  }

  /**
   * Whether the uploaded set covers everything KYC needs.
   *
   * Public so the rule lives in one place: the auto-advance to "pending" and any
   * caller checking readiness must not drift apart.
   */
  isSubmissionComplete(present: Set<string>): boolean {
    return REQUIRED_DOCS.every(
      (r) => present.has(r.key) || (SATISFIED_BY[r.key] ?? []).some((alt) => present.has(alt)),
    );
  }

  getRequirements() {
    return { documents: REQUIRED_DOCS };
  }

  /** True iff the user has any approved FICA submission. */
  async isApproved(userId: number): Promise<boolean> {
    const count = await this.submissionRepo.count({ where: { userId, status: 'approved' } });
    return count > 0;
  }

  async getMyActiveSubmission(userId: number) {
    // Prefer the most-recently-updated active or approved record.
    const sub = await this.submissionRepo.findOne({
      where: [{ userId, status: 'draft' }, { userId, status: 'pending' }, { userId, status: 'approved' }],
      order: { updatedAt: 'DESC' },
      relations: ['documents'],
    });
    return sub;
  }

  async getMySubmissions(userId: number) {
    return this.submissionRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, relations: ['documents'] });
  }

  async submit(userId: number, dto: SubmitFicaInput): Promise<FicaSubmission> {
    // If there's an active draft/pending, mutate it; if approved, block; else create.
    const existing = await this.submissionRepo.findOne({
      where: [{ userId, status: 'draft' }, { userId, status: 'pending' }],
      order: { createdAt: 'DESC' },
    });

    // "Under review" is not "decided": until an admin actually verifies, the
    // person can still fix a typo rather than waiting for a rejection to do it.
    // Only a verified record is frozen — at that point it is evidence.
    if (!existing) {
      const approved = await this.submissionRepo.findOne({
        where: { userId, status: 'approved' },
      });
      if (approved) {
        throw new ForbiddenException('Your identity is already verified.');
      }
    }

    const target = existing ?? this.submissionRepo.create({ userId, status: 'draft' });
    target.fullName = dto.fullName;
    target.idNumber = dto.idNumber;
    target.idType = dto.idType ?? 'sa_id';
    target.residentialAddress = dto.residentialAddress;

    return this.submissionRepo.save(target);
  }

  async uploadDocument(
    userId: number,
    submissionId: number,
    documentType: FicaDocType,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" not allowed. Use PDF, JPG, or PNG.`);
    }
    if (file.size > MAX_BYTES) throw new BadRequestException('File exceeds 10 MB.');

    const accepted = [...REQUIRED_DOCS.map((d) => d.key), ...LEGACY_DOCS];
    if (!accepted.includes(documentType)) {
      throw new BadRequestException(`Invalid documentType "${documentType}".`);
    }

    const submission = await this.submissionRepo.findOne({ where: { id: submissionId, userId } });
    if (!submission) throw new NotFoundException('FICA submission not found.');
    if (!ACTIVE.includes(submission.status)) {
      throw new ForbiddenException(`Cannot upload to a "${submission.status}" submission.`);
    }

    // Replace existing of same type
    const existing = await this.documentRepo.findOne({ where: { submissionId, documentType } });
    if (existing) {
      this.deleteFileQuietly(existing.filePath);
      await this.documentRepo.remove(existing);
    }

    // Backend M11 — derive ext from the (validated) mime, never from the user-supplied originalname.
    const ext = extensionForMime(file.mimetype);
    const relDir = path.join('fica', String(submissionId), documentType);
    const absDir = path.join(this.uploadsRoot, relDir);
    fs.mkdirSync(absDir, { recursive: true });
    const fileName = `${Date.now()}${ext}`;
    const absPath = path.join(absDir, fileName);
    fs.writeFileSync(absPath, file.buffer);
    const relPath = path.join(relDir, fileName);

    const doc = this.documentRepo.create({
      submissionId,
      documentType,
      originalName: file.originalname,
      filePath: relPath,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
    });
    await this.documentRepo.save(doc);

    // Auto-advance to 'pending' once all required docs present
    const updated = await this.maybeAdvanceToPending(submission);
    return { document: doc, submission: updated };
  }

  private async maybeAdvanceToPending(submission: FicaSubmission): Promise<FicaSubmission> {
    if (submission.status !== 'draft') return submission;
    const docs = await this.documentRepo.find({ where: { submissionId: submission.id } });
    const present = new Set(docs.map((d) => d.documentType));
    const allPresent = this.isSubmissionComplete(present);
    if (allPresent) {
      submission.status = 'pending';
      submission.submittedAt = new Date();
      return this.submissionRepo.save(submission);
    }
    return submission;
  }

  private deleteFileQuietly(relPath: string) {
    try { fs.unlinkSync(path.join(this.uploadsRoot, relPath)); } catch {}
  }

  // ─────────── Admin ───────────
  async listForReview() {
    return this.submissionRepo.find({
      where: { status: In(['pending', 'approved', 'rejected']) },
      order: { submittedAt: 'DESC', updatedAt: 'DESC' },
      relations: ['documents'],
    });
  }

  async getById(id: number) {
    const sub = await this.submissionRepo.findOne({ where: { id }, relations: ['documents'] });
    if (!sub) throw new NotFoundException('Submission not found');
    return sub;
  }

  async review(adminUserId: number, id: number, decision: 'approved' | 'rejected', reason?: string) {
    const sub = await this.submissionRepo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('Submission not found');
    if (sub.status !== 'pending') throw new ForbiddenException(`Can only review pending submissions (status=${sub.status}).`);
    sub.status = decision;
    sub.reviewedBy = adminUserId;
    sub.reviewedAt = new Date();
    sub.rejectionReason = decision === 'rejected' ? (reason ?? 'No reason provided') : null;
    return this.submissionRepo.save(sub);
  }

  /**
   * A user reading back one of their OWN documents, for in-app preview.
   *
   * Separate from readFileBuffer (admin-only, no ownership test) because these
   * files are ID documents, proof of address and a selfie holding an ID — enough
   * to impersonate someone. Ownership is proven from the parent submission
   * BEFORE touching the disk, and a missing submission is treated as refusal
   * rather than as permission.
   */
  async readOwnFileBuffer(
    userId: number,
    documentId: number,
  ): Promise<{ buffer: Buffer; mime: string; name: string }> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');

    const submission = await this.submissionRepo.findOne({
      where: { id: doc.submissionId },
    });
    if (!submission || submission.userId !== userId) {
      throw new ForbiddenException('Not your document');
    }

    const abs = path.join(this.uploadsRoot, doc.filePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('File missing on disk');
    return { buffer: fs.readFileSync(abs), mime: doc.mimeType, name: doc.originalName };
  }

  async readFileBuffer(documentId: number): Promise<{ buffer: Buffer; mime: string; name: string }> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException('Document not found');
    const abs = path.join(this.uploadsRoot, doc.filePath);
    if (!fs.existsSync(abs)) throw new NotFoundException('File missing on disk');
    return { buffer: fs.readFileSync(abs), mime: doc.mimeType, name: doc.originalName };
  }
}
