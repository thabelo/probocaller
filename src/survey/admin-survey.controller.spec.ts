import { Test, TestingModule } from '@nestjs/testing';
import { AdminSurveyController } from './admin-survey.controller';
import { SurveyTemplateService } from './survey-template.service';
import { SurveyStatsService } from './survey-stats.service';
import { AdminGuard } from '../admin/admin.guard';

/**
 * Console-side curation of the template library (surveys-spec §3.1).
 *
 * Admin-only, and deliberately without a delete: templates are retired by
 * flag so the surveys built from them stay traceable — the same reasoning that
 * gives the app catalogue a `retired` status instead of a DELETE.
 */
describe('AdminSurveyController', () => {
  let controller: AdminSurveyController;
  let templates: { listAll: jest.Mock; create: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    templates = {
      listAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(async (input: any) => ({ id: 1, ...input })),
      update: jest.fn(async (key: string, input: any) => ({ id: 1, key, ...input })),
    };

    const mod: TestingModule = await Test.createTestingModule({
      controllers: [AdminSurveyController],
      providers: [
        { provide: SurveyTemplateService, useValue: templates },
        { provide: SurveyStatsService, useValue: { platform: jest.fn().mockResolvedValue({ totals: {} }) } },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = mod.get(AdminSurveyController);
  });

  it('is admin-only', () => {
    const guards = Reflect.getMetadata('__guards__', AdminSurveyController) || [];
    expect(guards).toContain(AdminGuard);
  });

  it('lists every template including retired ones', async () => {
    await controller.listTemplates();
    expect(templates.listAll).toHaveBeenCalled();
  });

  it('creates a template from the console', async () => {
    await controller.createTemplate({
      key: 'insurance-nps',
      name: 'Insurance NPS',
      questions: [{ type: 'yes_no', prompt: 'Would you recommend us?' }],
    });
    expect(templates.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'insurance-nps' }),
    );
  });

  it('edits a template by key', async () => {
    await controller.updateTemplate('insurance-nps', { name: 'Renamed' });
    expect(templates.update).toHaveBeenCalledWith('insurance-nps', { name: 'Renamed' });
  });

  /** Retiring is an update, not a delete — there must be no delete route. */
  it('offers no way to delete a template', () => {
    const methods = Object.getOwnPropertyNames(AdminSurveyController.prototype);
    expect(methods.some((m) => /delete|remove|destroy/i.test(m))).toBe(false);
  });
});
