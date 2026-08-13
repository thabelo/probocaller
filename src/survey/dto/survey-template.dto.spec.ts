import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTemplateDto, UpdateTemplateDto } from './survey-template.dto';

/**
 * The global ValidationPipe runs with forbidNonWhitelisted, so these DTOs are
 * the actual allow-list for console curation of the template library — what
 * they omit cannot be set at all.
 */
const errorsFor = async (cls: any, payload: unknown) =>
  validate(plainToInstance(cls, payload as object));

const validQuestion = { type: 'yes_no', prompt: 'Would you recommend us?' };

describe('CreateTemplateDto', () => {
  it('accepts a well-formed template', async () => {
    expect(await errorsFor(CreateTemplateDto, {
      key: 'insurance-nps', name: 'Insurance NPS', questions: [validQuestion],
    })).toHaveLength(0);
  });

  /** A type with no fee setting could never be priced at publish. */
  it('rejects a question type that has no fee', async () => {
    const errors = await errorsFor(CreateTemplateDto, {
      key: 'k', name: 'n', questions: [{ type: 'essay', prompt: 'Why?' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a template with no questions', async () => {
    const errors = await errorsFor(CreateTemplateDto, { key: 'k', name: 'n', questions: [] });
    expect(errors.length).toBeGreaterThan(0);
  });

  /** Keys are matched by the client and must stay predictable, like app keys. */
  it('rejects a key that is not lower-case kebab-case', async () => {
    for (const key of ['Insurance NPS', 'insurance_nps', 'InsuranceNps', '-leading']) {
      expect((await errorsFor(CreateTemplateDto, {
        key, name: 'n', questions: [validQuestion],
      })).length).toBeGreaterThan(0);
    }
  });
});

describe('UpdateTemplateDto', () => {
  it('accepts a copy-only edit', async () => {
    expect(await errorsFor(UpdateTemplateDto, { name: 'Renamed' })).toHaveLength(0);
  });

  it('accepts retiring a template', async () => {
    expect(await errorsFor(UpdateTemplateDto, { isActive: false })).toHaveLength(0);
  });

  /**
   * `key` is not editable: a survey is built from a template by key, so
   * renaming one would orphan the trail back to it. Checked the way the global
   * pipe actually behaves — forbidNonWhitelisted rejects the unknown property.
   */
  it('refuses an attempt to rename a template key', async () => {
    const errors = await validate(
      plainToInstance(UpdateTemplateDto, { key: 'renamed' }),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toContain('key');
  });

  it('still validates replacement questions', async () => {
    const errors = await errorsFor(UpdateTemplateDto, {
      questions: [{ type: 'essay', prompt: 'Why?' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
