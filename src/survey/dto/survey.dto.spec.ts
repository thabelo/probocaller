import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AudienceDto, CreateSurveyDto, QuoteSurveyDto, UpdateSurveyDto } from './survey.dto';

const errorsFor = async (cls: any, payload: unknown, options = {}) =>
  validate(plainToInstance(cls, payload as object), options);

const valid = {
  businessId: 7,
  title: 'How are we doing?',
  targetResponses: 100,
  durationDays: 30,
  questions: [{ type: 'yes_no', prompt: 'Would you recommend us?' }],
};

describe('CreateSurveyDto', () => {
  it('accepts a well-formed survey', async () => {
    expect(await errorsFor(CreateSurveyDto, valid)).toHaveLength(0);
  });

  it('accepts building from a template instead of questions', async () => {
    const { questions, ...rest } = valid;
    expect(await errorsFor(CreateSurveyDto, { ...rest, templateKey: 'insurance-nps' })).toHaveLength(0);
  });

  it('accepts an indefinite lifetime', async () => {
    expect(await errorsFor(CreateSurveyDto, { ...valid, durationDays: null })).toHaveLength(0);
  });

  it('rejects a target of zero or a fraction', async () => {
    expect((await errorsFor(CreateSurveyDto, { ...valid, targetResponses: 0 })).length).toBeGreaterThan(0);
    expect((await errorsFor(CreateSurveyDto, { ...valid, targetResponses: 2.5 })).length).toBeGreaterThan(0);
  });

  it('rejects a question type that has no fee', async () => {
    const errors = await errorsFor(CreateSurveyDto, {
      ...valid, questions: [{ type: 'essay', prompt: 'Why?' }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  /**
   * Money is computed from the question types and frozen at publish. A client
   * that could send a price could name its own — so the pipe must reject these
   * outright rather than the service quietly ignoring them.
   */
  it('refuses a client-supplied price or escrow amount', async () => {
    for (const field of ['pricePerResponse', 'totalHeld', 'totalPaid', 'status']) {
      const errors = await errorsFor(
        CreateSurveyDto,
        { ...valid, [field]: '1' },
        { whitelist: true, forbidNonWhitelisted: true },
      );
      expect(errors.map((e) => e.property)).toContain(field);
    }
  });
});

describe('UpdateSurveyDto', () => {
  it('accepts a rename on its own', async () => {
    expect(await errorsFor(UpdateSurveyDto, { title: 'Renamed' })).toHaveLength(0);
  });

  /**
   * A survey cannot be moved between businesses: the wallet that funds it
   * belongs to one of them, and the escrow is drawn from that wallet.
   */
  it('refuses to move a survey to another business', async () => {
    const errors = await errorsFor(
      UpdateSurveyDto,
      { businessId: 9 },
      { whitelist: true, forbidNonWhitelisted: true },
    );
    expect(errors.map((e) => e.property)).toContain('businessId');
  });
});

/**
 * Pricing a survey that does not exist yet, so the builder can show a cost
 * before a business commits to building anything.
 */
describe('QuoteSurveyDto', () => {
  /** A business may ask "how many does R500 buy?" instead of naming a count. */
  it('accepts a budget instead of a target', async () => {
    expect(await errorsFor(QuoteSurveyDto, {
      questions: [{ type: 'free_text', prompt: 'Why?' }],
      budget: 500,
    })).toHaveLength(0);
  });

  it('rejects a budget of zero', async () => {
    const errors = await errorsFor(QuoteSurveyDto, {
      questions: [{ type: 'free_text', prompt: 'Why?' }],
      budget: 0,
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts questions and a target', async () => {
    expect(await errorsFor(QuoteSurveyDto, {
      questions: [{ type: 'free_text', prompt: 'Why?' }],
      targetResponses: 100,
    })).toHaveLength(0);
  });

  it('rejects a quote with no questions', async () => {
    const errors = await errorsFor(QuoteSurveyDto, { questions: [], targetResponses: 100 });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects an unpriceable question type', async () => {
    const errors = await errorsFor(QuoteSurveyDto, {
      questions: [{ type: 'essay', prompt: 'Why?' }],
      targetResponses: 100,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('AudienceDto', () => {
  it('accepts a filter map', async () => {
    expect(await errorsFor(AudienceDto, { filters: { province: 'Gauteng' } })).toHaveLength(0);
  });

  it('accepts no filters at all — that is "everyone"', async () => {
    expect(await errorsFor(AudienceDto, {})).toHaveLength(0);
  });
});
