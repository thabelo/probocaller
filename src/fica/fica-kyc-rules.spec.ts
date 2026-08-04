jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { FicaService, REQUIRED_DOCS } from './fica.service';
import { FicaSubmission } from './entities/fica-submission.entity';
import { FicaDocument } from './entities/fica-document.entity';

/**
 * South African KYC needs BOTH sides of the ID card — the back carries the
 * barcode and the issue details a reviewer checks against the front. One
 * "id_document" slot silently accepted half the evidence.
 */
describe('FICA required documents', () => {
  const keys = REQUIRED_DOCS.map((d) => d.key);

  it('asks for both sides of the ID', () => {
    expect(keys).toContain('id_front');
    expect(keys).toContain('id_back');
  });

  it('still asks for proof of address and a selfie', () => {
    expect(keys).toEqual(expect.arrayContaining(['proof_of_address', 'selfie']));
  });

  /** The single-slot type is gone from the required set but must stay accepted. */
  it('no longer lists the old single ID slot', () => {
    expect(keys).not.toContain('id_document');
  });
});

describe('FicaService — edits stay open until an admin verifies', () => {
  let service: FicaService;
  let submissionRepo: any;
  let documentRepo: any;

  beforeEach(async () => {
    submissionRepo = {
      findOne: jest.fn(),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => x),
      count: jest.fn(),
    };
    documentRepo = { findOne: jest.fn(), find: jest.fn(async () => []), create: jest.fn(), save: jest.fn(), remove: jest.fn() };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FicaService,
        { provide: getRepositoryToken(FicaSubmission), useValue: submissionRepo },
        { provide: getRepositoryToken(FicaDocument), useValue: documentRepo },
      ],
    }).compile();
    service = mod.get(FicaService);
  });

  const dto = {
    fullName: 'Thabelo M',
    idNumber: '8505106073083',
    residentialAddress: '103A Blue hills',
  };

  it('lets a draft be edited', async () => {
    submissionRepo.findOne.mockResolvedValue({ id: 1, userId: 42, status: 'draft' });
    await expect(service.submit(42, dto)).resolves.toBeTruthy();
  });

  /**
   * The point of the change: "under review" is not "decided". Until an admin
   * actually verifies, the person can still correct a typo in their ID number
   * rather than waiting for a rejection to fix it.
   */
  it('lets a submission still under review be edited', async () => {
    submissionRepo.findOne.mockResolvedValue({ id: 1, userId: 42, status: 'pending' });
    await expect(service.submit(42, dto)).resolves.toBeTruthy();
    expect(submissionRepo.save).toHaveBeenCalled();
  });

  /** Once verified the record is evidence — it must not change underneath it. */
  it('refuses to edit an approved submission', async () => {
    submissionRepo.findOne.mockResolvedValueOnce(null);       // no draft/pending
    submissionRepo.findOne.mockResolvedValueOnce({ id: 2, userId: 42, status: 'approved' });
    await expect(service.submit(42, dto)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('FicaService — completeness tolerates the legacy single ID slot', () => {
  let service: FicaService;
  let submissionRepo: any;
  let documentRepo: any;

  beforeEach(async () => {
    submissionRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn(async (x) => x), count: jest.fn() };
    documentRepo = { find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(), remove: jest.fn() };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FicaService,
        { provide: getRepositoryToken(FicaSubmission), useValue: submissionRepo },
        { provide: getRepositoryToken(FicaDocument), useValue: documentRepo },
      ],
    }).compile();
    service = mod.get(FicaService);
  });

  /**
   * Submissions made before the split hold one "id_document". Treating that as
   * incomplete would drag already-submitted people back to draft through no
   * fault of their own.
   */
  it('counts a legacy id_document as the ID front', () => {
    const present = new Set(['id_document', 'proof_of_address', 'selfie']);
    expect(service.isSubmissionComplete(present)).toBe(false); // still missing the back
    present.add('id_back');
    expect(service.isSubmissionComplete(present)).toBe(true);
  });

  it('accepts the new front/back pair', () => {
    const present = new Set(['id_front', 'id_back', 'proof_of_address', 'selfie']);
    expect(service.isSubmissionComplete(present)).toBe(true);
  });

  it('is not complete without the back of the ID', () => {
    const present = new Set(['id_front', 'proof_of_address', 'selfie']);
    expect(service.isSubmissionComplete(present)).toBe(false);
  });
});
