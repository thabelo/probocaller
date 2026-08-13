import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyTemplate } from './survey-template.entity';

/**
 * The admin-curated template library (surveys-spec §3.1). Adding "Insurance
 * NPS" is a data change, not a release — the same rule the app catalogue
 * follows.
 *
 * Businesses build from a COPY, so nothing here may be reachable by a
 * business's own credentials, and a template edit must never reach a survey
 * already published from it.
 */
describe('SurveyTemplateService', () => {
  let service: SurveyTemplateService;
  let repo: any;

  const template = (over: Partial<SurveyTemplate> = {}) => ({
    id: 1,
    key: 'insurance-nps',
    name: 'Insurance NPS',
    description: '',
    category: 'insurance',
    questionsJson: [{ type: 'yes_no', prompt: 'Would you recommend us?' }],
    isActive: true,
    ...over,
  });

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([template()]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: any) => d),
      save: jest.fn(async (d: any) => ({ id: 1, ...d })),
    };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyTemplateService,
        { provide: getRepositoryToken(SurveyTemplate), useValue: repo },
      ],
    }).compile();

    service = mod.get(SurveyTemplateService);
  });

  describe('listing', () => {
    it('shows a business only the templates still on offer', async () => {
      await service.listActive();
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    /** The console curates the library, so it must see retired ones too. */
    it('shows an admin every template, retired included', async () => {
      await service.listAll();
      const [options] = repo.find.mock.calls[0];
      expect(options?.where).toBeUndefined();
    });
  });

  describe('creating', () => {
    it('creates a template with its questions', async () => {
      const created = await service.create({
        key: 'product-feedback',
        name: 'Product feedback',
        category: 'product',
        questions: [{ type: 'free_text', prompt: 'What would you change?' }],
      });

      expect(created.key).toBe('product-feedback');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'product-feedback',
          questionsJson: [{ type: 'free_text', prompt: 'What would you change?' }],
        }),
      );
    });

    it('refuses a duplicate key rather than shadowing the existing template', async () => {
      repo.findOne.mockResolvedValue(template());
      await expect(
        service.create({ key: 'insurance-nps', name: 'Another', questions: [{ type: 'yes_no', prompt: 'Hi?' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * An unknown type has no fee setting, so a survey built from it could not
     * be priced — it would fail at publish, after the business had done the
     * work. Reject it at the library instead.
     */
    it('refuses a question type that cannot be priced', async () => {
      await expect(
        service.create({ key: 'k', name: 'n', questions: [{ type: 'essay' as any, prompt: 'Why?' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a template with no questions', async () => {
      await expect(service.create({ key: 'k', name: 'n', questions: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses a choice question with no choices', async () => {
      await expect(
        service.create({
          key: 'k', name: 'n',
          questions: [{ type: 'multiple_choice', prompt: 'Pick one' }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updating', () => {
    it('edits copy on an existing template', async () => {
      repo.findOne.mockResolvedValue(template());
      await service.update('insurance-nps', { name: 'Insurance NPS 2026' });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Insurance NPS 2026' }),
      );
    });

    it('reports an unknown template rather than creating one', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('nope', { name: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates replacement questions the same way as on create', async () => {
      repo.findOne.mockResolvedValue(template());
      await expect(
        service.update('insurance-nps', { questions: [{ type: 'essay' as any, prompt: 'Why?' }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /**
     * Retiring hides a template from businesses without deleting it, so
     * surveys already built from it stay traceable to where they came from.
     */
    it('retires by flag rather than deleting', async () => {
      repo.findOne.mockResolvedValue(template());
      await service.update('insurance-nps', { isActive: false });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
      expect(repo.delete).toBeUndefined();
    });
  });
});
