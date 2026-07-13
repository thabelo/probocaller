import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { extensionForMime } from '../common/mime-extension';
import { KybSubmission, KybStatus } from './entities/kyb-submission.entity';
import { KybDocument } from './entities/kyb-document.entity';
import { Business } from '../business/business.entity';
import { SubmitKybDto } from './dto/submit-kyb.dto';
import { sanitiseBusinessInfo } from './sanitise-business-info';
import { ReviewKybDto } from './dto/review-kyb.dto';
import {
  getCountryKybConfig,
  getAllSupportedCountries,
  CountryKybConfig,
} from './kyb-country-config';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ACTIVE_STATUSES: KybStatus[] = ['draft', 'pending', 'under_review'];

@Injectable()
export class KybService {
  private readonly uploadsRoot: string;

  constructor(
    @InjectRepository(KybSubmission)
    private submissionRepo: Repository<KybSubmission>,
    @InjectRepository(KybDocument)
    private documentRepo: Repository<KybDocument>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
  ) {
    this.uploadsRoot = process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.resolve(process.cwd(), 'uploads');
  }

  // ─── Country config ─────────────────────────────────────────────────────────

  getRequirements(countryCode: string): CountryKybConfig {
    // Every real country resolves (researched config, else a generic one), so the
    // only failure mode left is a code that isn't a country at all.
    const config = getCountryKybConfig(countryCode);
    if (!config) {
      throw new BadRequestException(
        `"${String(countryCode).toUpperCase()}" is not a valid ISO 3166-1 alpha-2 country code. Use GET /kyb/countries to list countries.`,
      );
    }
    return config;
  }

  getSupportedCountries() {
    return getAllSupportedCountries();
  }

  // ─── Business-facing ────────────────────────────────────────────────────────

  async submitKyb(userId: number, dto: SubmitKybDto): Promise<KybSubmission> {
    const business = await this.businessRepo.findOne({ where: { id: dto.businessId, userId } });
    if (!business) {
      throw new NotFoundException('Business profile not found or does not belong to your account.');
    }

    // Ensure country is supported
    const config = this.getRequirements(dto.countryCode);

    // Only one active submission allowed per business at a time
    const active = await this.submissionRepo.findOne({
      where: { businessId: business.id, status: In(ACTIVE_STATUSES) },
    });
    if (active) {
      throw new ConflictException(
        `This business already has an active KYB submission (id: ${active.id}, status: ${active.status}). ` +
        'Upload remaining documents to advance it, or wait for the current review to complete.',
      );
    }

    // Backend M10 — strip any keys not in the country's businessInfoFields
    // whitelist, cap value lengths, enforce total-size cap. Tested in
    // sanitise-business-info.spec.ts (7 cases).
    const safeBusinessInfo = sanitiseBusinessInfo(dto.businessInfo, config.businessInfoFields);

    const submission = this.submissionRepo.create({
      businessId: business.id,
      countryCode: dto.countryCode.toUpperCase(),
      status: 'draft',
      businessInfo: safeBusinessInfo,
    });

    return this.submissionRepo.save(submission);
  }

  async uploadDocument(
    userId: number,
    submissionId: number,
    documentType: string,
    file: Express.Multer.File,
  ): Promise<{ document: KybDocument; submission: KybSubmission }> {
    // Validate file
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed. Accepted formats: PDF, JPG, PNG.`,
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB size limit.');
    }

    const business = await this.businessRepo.findOne({ where: { userId } });
    if (!business) throw new NotFoundException('Business profile not found.');

    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId, businessId: business.id },
    });
    if (!submission) throw new NotFoundException('KYB submission not found.');

    if (!ACTIVE_STATUSES.includes(submission.status)) {
      throw new ForbiddenException(
        `Cannot upload documents to a submission with status "${submission.status}".`,
      );
    }

    const config = this.getRequirements(submission.countryCode);
    const validDocType = config.documents.find((d) => d.key === documentType);
    if (!validDocType) {
      const valid = config.documents.map((d) => d.key).join(', ');
      throw new BadRequestException(
        `"${documentType}" is not a valid document type for ${config.countryName}. Valid types: ${valid}.`,
      );
    }

    // Replace any existing doc of the same type for this submission
    const existing = await this.documentRepo.findOne({
      where: { submissionId, documentType },
    });
    if (existing) {
      this.deleteFileQuietly(existing.filePath);
      await this.documentRepo.remove(existing);
    }

    // Persist file to disk
    // Backend M11 — derive ext from the (validated) mime, never from the user-supplied originalname.
    const ext = extensionForMime(file.mimetype);
    const relDir = path.join('kyb', String(submissionId), documentType);
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

    // Advance status to 'pending' if all required docs are now uploaded
    const updatedSubmission = await this.maybeAdvanceToPending(submission, config);

    return { document: doc, submission: updatedSubmission };
  }

  async getMySubmissions(userId: number): Promise<KybSubmission[]> {
    const businesses = await this.businessRepo.find({ where: { userId } });
    if (!businesses.length) throw new NotFoundException('Business profile not found.');

    const businessIds = businesses.map((b) => b.id);
    return this.submissionRepo.find({
      where: { businessId: In(businessIds) },
      relations: ['documents'],
      order: { submittedAt: 'DESC' },
    });
  }

  async getMyActiveSubmission(userId: number): Promise<KybSubmission | null> {
    const businesses = await this.businessRepo.find({ where: { userId } });
    if (!businesses.length) throw new NotFoundException('Business profile not found.');

    const businessIds = businesses.map((b) => b.id);
    return this.submissionRepo.findOne({
      where: { businessId: In(businessIds), status: In(ACTIVE_STATUSES) },
      relations: ['documents'],
      order: { submittedAt: 'DESC' },
    });
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async listSubmissions(filters: {
    status?: string;
    countryCode?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: KybSubmission[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));

    const qb = this.submissionRepo
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.business', 'b')
      .leftJoinAndSelect('s.documents', 'd')
      .orderBy('s.submittedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.status) {
      qb.andWhere('s.status = :status', { status: filters.status });
    }
    if (filters.countryCode) {
      qb.andWhere('UPPER(s.countryCode) = :cc', { cc: filters.countryCode.toUpperCase() });
    }
    if (filters.search) {
      qb.andWhere(
        '(b.companyName ILIKE :q OR CAST(s.businessId AS TEXT) ILIKE :q OR s."businessInfo"::text ILIKE :q)',
        { q: `%${filters.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getSubmission(submissionId: number): Promise<KybSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['documents', 'business'],
    });
    if (!submission) throw new NotFoundException(`KYB submission ${submissionId} not found.`);
    return submission;
  }

  async reviewSubmission(
    submissionId: number,
    reviewerId: number,
    dto: ReviewKybDto,
  ): Promise<KybSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: ['business'],
    });
    if (!submission) throw new NotFoundException(`KYB submission ${submissionId} not found.`);

    if (submission.status === 'approved') {
      throw new ConflictException('This submission is already approved.');
    }

    if (dto.status === 'approved' && submission.status === 'draft') {
      throw new BadRequestException(
        'Cannot approve a draft submission. The business must upload all required documents first.',
      );
    }

    submission.status = dto.status;
    submission.reviewedBy = reviewerId;
    submission.reviewedAt = new Date();
    submission.rejectionReason = dto.rejectionReason ?? null;
    submission.reviewerNotes = dto.reviewerNotes ?? submission.reviewerNotes;

    if (dto.status === 'approved') {
      await this.businessRepo.update(submission.businessId, { verified: true });
    } else if (dto.status === 'rejected') {
      // Revert verification flag if previously approved
      await this.businessRepo.update(submission.businessId, { verified: false });
    }

    return this.submissionRepo.save(submission);
  }

  async getDocumentFilePath(documentId: number): Promise<string> {
    const doc = await this.documentRepo.findOne({ where: { id: documentId } });
    if (!doc) throw new NotFoundException(`Document ${documentId} not found.`);
    const absPath = path.join(this.uploadsRoot, doc.filePath);
    if (!fs.existsSync(absPath)) {
      throw new NotFoundException('Document file not found on disk.');
    }
    return absPath;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async maybeAdvanceToPending(
    submission: KybSubmission,
    config: CountryKybConfig,
  ): Promise<KybSubmission> {
    if (submission.status !== 'draft') return submission;

    const requiredKeys = config.documents
      .filter((d) => d.required)
      .map((d) => d.key);

    const uploaded = await this.documentRepo.find({
      where: { submissionId: submission.id },
      select: ['documentType'],
    });
    const uploadedKeys = new Set(uploaded.map((d) => d.documentType));

    const allUploaded = requiredKeys.every((k) => uploadedKeys.has(k));
    if (allUploaded) {
      submission.status = 'pending';
      return this.submissionRepo.save(submission);
    }

    return submission;
  }

  private deleteFileQuietly(relPath: string): void {
    try {
      const absPath = path.join(this.uploadsRoot, relPath);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {
      // Non-fatal — log in production if needed
    }
  }
}
