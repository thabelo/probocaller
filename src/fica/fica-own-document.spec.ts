jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(() => Buffer.from('PDFBYTES')),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import * as fs from 'fs';
import { FicaService } from './fica.service';
import { FicaSubmission } from './entities/fica-submission.entity';
import { FicaDocument } from './entities/fica-document.entity';

/**
 * Letting someone preview their own uploaded ID is a small feature with a large
 * blast radius: these files are ID documents, proof of address and a selfie
 * holding an ID — everything needed to impersonate a person. The admin download
 * is safe because it sits behind AdminGuard; a user-facing one is only safe if
 * it proves ownership on every request, so that is what these pin.
 */
describe('FicaService.readOwnFileBuffer', () => {
  let service: FicaService;
  let documentRepo: any;
  let submissionRepo: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    documentRepo = { findOne: jest.fn() };
    submissionRepo = { findOne: jest.fn(), count: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FicaService,
        { provide: getRepositoryToken(FicaSubmission), useValue: submissionRepo },
        { provide: getRepositoryToken(FicaDocument), useValue: documentRepo },
      ],
    }).compile();
    service = mod.get(FicaService);

    (fs.existsSync as unknown as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as unknown as jest.Mock).mockReturnValue(Buffer.from('PDFBYTES'));
  });

  const doc = (submissionId = 5) => ({
    id: 9,
    submissionId,
    filePath: 'fica/abc.pdf',
    mimeType: 'application/pdf',
    originalName: 'id.pdf',
  });

  it('returns the file when the document belongs to the caller', async () => {
    documentRepo.findOne.mockResolvedValue(doc());
    submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 42 });

    const out = await service.readOwnFileBuffer(42, 9);
    expect(out.mime).toBe('application/pdf');
    expect(out.name).toBe('id.pdf');
    expect(out.buffer.toString()).toBe('PDFBYTES');
  });

  /** The whole point: another user's ID must never be readable. */
  it('refuses a document belonging to someone else', async () => {
    documentRepo.findOne.mockResolvedValue(doc());
    submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 999 });

    await expect(service.readOwnFileBuffer(42, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not read from disk at all when the caller is not the owner', async () => {
    documentRepo.findOne.mockResolvedValue(doc());
    submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 999 });

    await expect(service.readOwnFileBuffer(42, 9)).rejects.toBeTruthy();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('404s an unknown document', async () => {
    documentRepo.findOne.mockResolvedValue(null);
    await expect(service.readOwnFileBuffer(42, 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  /** An orphaned document row must not fall through to "allowed". */
  it('refuses when the parent submission cannot be found', async () => {
    documentRepo.findOne.mockResolvedValue(doc());
    submissionRepo.findOne.mockResolvedValue(null);
    await expect(service.readOwnFileBuffer(42, 9)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the row exists but the file is gone from disk', async () => {
    documentRepo.findOne.mockResolvedValue(doc());
    submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 42 });
    (fs.existsSync as unknown as jest.Mock).mockReturnValue(false);

    await expect(service.readOwnFileBuffer(42, 9)).rejects.toBeInstanceOf(NotFoundException);
  });
});
