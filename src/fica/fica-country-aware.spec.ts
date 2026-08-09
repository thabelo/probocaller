jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { FicaService } from './fica.service';
import { FicaSubmission } from './entities/fica-submission.entity';
import { FicaDocument } from './entities/fica-document.entity';

/**
 * FICA requirements are per-country: ZA keeps today's tailored 4-doc set,
 * every other real country gets the generic 3-doc fallback. These tests pin
 * that the *submission's own* countryCode — not a single global list —
 * drives requirements, upload validation and completeness.
 */
describe('FicaService — country-aware requirements', () => {
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
    documentRepo = {
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (x) => x),
      remove: jest.fn(),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        FicaService,
        { provide: getRepositoryToken(FicaSubmission), useValue: submissionRepo },
        { provide: getRepositoryToken(FicaDocument), useValue: documentRepo },
      ],
    }).compile();
    service = mod.get(FicaService);
  });

  const submitDto = {
    fullName: 'Thabelo M',
    idNumber: '8505106073083',
    residentialAddress: '103A Blue hills',
  };

  describe('getRequirements(countryCode)', () => {
    it('defaults to the ZA tailored 4-document set with no country given', () => {
      const { documents, countryCode, tailored } = service.getRequirements();
      expect(countryCode).toBe('ZA');
      expect(tailored).toBe(true);
      expect(documents.map((d) => d.key)).toEqual(['id_front', 'id_back', 'proof_of_address', 'selfie']);
    });

    it('returns the generic 3-document set for a non-ZA country', () => {
      const { documents, countryCode, tailored } = service.getRequirements('NG');
      expect(countryCode).toBe('NG');
      expect(tailored).toBe(false);
      expect(documents.map((d) => d.key)).toEqual(['id_document', 'proof_of_address', 'selfie']);
    });
  });

  describe('submit() — countryCode persistence', () => {
    it('defaults a brand-new submission to ZA when the dto omits countryCode', async () => {
      submissionRepo.findOne.mockResolvedValue(null); // no draft/pending, no approved
      const result = await service.submit(42, submitDto);
      expect(result.countryCode).toBe('ZA');
    });

    it('persists a non-ZA countryCode on a brand-new submission', async () => {
      submissionRepo.findOne.mockResolvedValue(null);
      const result = await service.submit(42, { ...submitDto, countryCode: 'NG' });
      expect(result.countryCode).toBe('NG');
    });

    it('keeps the countryCode set at creation immutable on resubmit, ignoring a later value', async () => {
      submissionRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 42,
        status: 'draft',
        countryCode: 'NG',
      });
      const result = await service.submit(42, { ...submitDto, countryCode: 'ZA' });
      expect(result.countryCode).toBe('NG');
    });
  });

  describe('isSubmissionComplete(present, countryCode)', () => {
    it('is complete for NG with only the combined ID doc, no front/back needed', () => {
      const present = new Set(['id_document', 'proof_of_address', 'selfie']);
      expect(service.isSubmissionComplete(present, 'NG')).toBe(true);
    });

    it('still requires the ID back for ZA with the same present set', () => {
      const present = new Set(['id_document', 'proof_of_address', 'selfie']);
      expect(service.isSubmissionComplete(present, 'ZA')).toBe(false);
    });
  });

  describe('uploadDocument() — validates against the submission\'s own country', () => {
    it('accepts the combined id_document for an NG submission', async () => {
      submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 42, status: 'draft', countryCode: 'NG' });
      documentRepo.findOne.mockResolvedValue(null);

      const file = { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'id.jpg' } as any;
      await expect(service.uploadDocument(42, 5, 'id_document', file)).resolves.toBeTruthy();
    });

    it('rejects id_front for an NG submission — that country does not use a front/back split', async () => {
      submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 42, status: 'draft', countryCode: 'NG' });
      documentRepo.findOne.mockResolvedValue(null);

      const file = { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'id.jpg' } as any;
      await expect(service.uploadDocument(42, 5, 'id_front', file)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still accepts id_front for a ZA submission', async () => {
      submissionRepo.findOne.mockResolvedValue({ id: 5, userId: 42, status: 'draft', countryCode: 'ZA' });
      documentRepo.findOne.mockResolvedValue(null);

      const file = { mimetype: 'image/jpeg', size: 1000, buffer: Buffer.from('x'), originalname: 'id.jpg' } as any;
      await expect(service.uploadDocument(42, 5, 'id_front', file)).resolves.toBeTruthy();
    });
  });
});
