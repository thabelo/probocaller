import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Survey, SurveyFilters } from './survey.entity';
import { SurveyQuestion } from './survey-question.entity';
import { SurveyTemplate } from './survey-template.entity';
import { Business } from '../business/business.entity';
import { SurveyPricingService } from './survey-pricing.service';
import { SurveyMatchingService } from './survey-matching.service';
import { CHOICE_TYPES, QuestionType, isQuestionType } from './question-type';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SurveyQuestionInput {
  type: QuestionType;
  prompt: string;
  options?: string[];
  required?: boolean;
}

export interface CreateSurveyInput {
  businessId: number;
  title: string;
  description?: string;
  category?: string;
  filters?: SurveyFilters;
  targetResponses: number;
  /**
   * Ask respondents for their phone number. Opt-in and priced per response
   * (SURVEY_FEE_PHONE_NUMBER) on top of the question fees — its own price,
   * separate from the data-broking one-off.
   */
  collectPhoneNumber?: boolean;
  /** Days the survey runs for; null means indefinite (§3.3). */
  durationDays: number | null;
  /** Either give questions outright, or name a template to copy them from. */
  questions?: SurveyQuestionInput[];
  templateKey?: string;
}

export type UpdateSurveyInput = Partial<Omit<CreateSurveyInput, 'businessId' | 'templateKey'>>;

/**
 * Creating and editing surveys — build-order step 2. DRAFT ONLY: nothing here
 * moves money. Publishing (the wallet hold, §1.2) is step 3.
 *
 * The builder is an API first and two clients second (surveys-spec §3.4), so
 * every decision a mobile or web builder needs lives here — what it costs, who
 * it targets, how long it runs. No client may re-derive any of it.
 */
@Injectable()
export class SurveyService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyQuestion)
    private readonly questionRepository: Repository<SurveyQuestion>,
    @InjectRepository(SurveyTemplate)
    private readonly templateRepository: Repository<SurveyTemplate>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly pricing: SurveyPricingService,
    private readonly matching: SurveyMatchingService,
  ) {}

  /** The business, or throw — scoping every operation to what the caller owns. */
  private async ownedBusiness(userId: number, businessId: number): Promise<Business> {
    const business = await this.businessRepository.findOne({ where: { id: businessId, userId } });
    if (!business) {
      throw new NotFoundException('Business not found or does not belong to your account.');
    }
    return business;
  }

  private async ownedSurvey(userId: number, id: number): Promise<Survey> {
    const survey = await this.surveyRepository.findOne({ where: { id }, relations: ['business'] });
    if (!survey) throw new NotFoundException('Survey not found');
    if (!survey.business || survey.business.userId !== userId) {
      throw new ForbiddenException('This survey does not belong to your account.');
    }
    return survey;
  }

  async createDraft(userId: number, input: CreateSurveyInput) {
    await this.ownedBusiness(userId, input.businessId);

    const template = input.templateKey
      ? await this.loadTemplate(input.templateKey)
      : null;

    // A business builds from a COPY of a template (§3.1): the questions are
    // duplicated onto the survey here, so editing the template later cannot
    // reach a survey already built from it.
    const questions = template
      ? template.questionsJson.map((q) => ({ ...q }))
      : (input.questions ?? []);

    this.validateQuestions(questions);
    // targetResponses is required at creation, so an absent one must fail here
    // rather than defaulting to something a business did not choose.
    this.validateTargeting(input, { requireTarget: true });
    // Filter keys must name real profile fields — a typo matches nobody.
    await this.matching.assertKnownFields(input.filters ?? {});

    const survey = await this.surveyRepository.save(
      this.surveyRepository.create({
        businessId: input.businessId,
        title: input.title,
        description: input.description ?? '',
        category: input.category ?? template?.category ?? '',
        status: 'draft',
        filtersJson: input.filters ?? {},
        targetResponses: input.targetResponses,
        collectPhoneNumber: input.collectPhoneNumber ?? false,
        // Price is frozen at PUBLISH, not here. Writing it now would mean a
        // draft left for a week is escrowed at a rate nobody agreed to.
        pricePerResponse: '0',
        totalHeld: '0',
        totalPaid: '0',
        expiresAt: this.expiryFrom(input.durationDays),
        publishedAt: null,
        closedAt: null,
      }),
    );

    await this.replaceQuestions(survey.id, questions);

    return {
      ...survey,
      questions,
      quote: await this.quoteFor(questions, input.targetResponses, survey.collectPhoneNumber),
    };
  }

  async list(userId: number, businessId: number): Promise<Survey[]> {
    await this.ownedBusiness(userId, businessId);
    return this.surveyRepository.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
    });
  }

  async get(userId: number, id: number) {
    const survey = await this.ownedSurvey(userId, id);
    const questions = await this.questionRepository.find({
      where: { surveyId: id },
      order: { position: 'ASC' },
    });
    return {
      ...survey,
      questions,
      quote: await this.quoteFor(questions, survey.targetResponses, survey.collectPhoneNumber),
    };
  }

  async update(userId: number, id: number, input: UpdateSurveyInput) {
    const survey = await this.ownedSurvey(userId, id);

    // Editing a live survey changes what respondents agreed to answer and what
    // was priced and escrowed. The safe default (§3.3) is close and republish.
    if (survey.status !== 'draft') {
      throw new BadRequestException(
        'Only a draft can be edited. Close this survey and publish a new one instead.',
      );
    }

    if (input.questions !== undefined) this.validateQuestions(input.questions);
    // Only what the caller actually sent: re-checking untouched stored values
    // would let a rule added later reject an edit to an unrelated field.
    this.validateTargeting(input);
    if (input.filters !== undefined) await this.matching.assertKnownFields(input.filters);

    if (input.title !== undefined) survey.title = input.title;
    if (input.description !== undefined) survey.description = input.description;
    if (input.category !== undefined) survey.category = input.category;
    if (input.filters !== undefined) survey.filtersJson = input.filters;
    if (input.targetResponses !== undefined) survey.targetResponses = input.targetResponses;
    if (input.collectPhoneNumber !== undefined) survey.collectPhoneNumber = input.collectPhoneNumber;
    if (input.durationDays !== undefined) survey.expiresAt = this.expiryFrom(input.durationDays);

    const saved = await this.surveyRepository.save(survey);

    if (input.questions !== undefined) {
      await this.replaceQuestions(id, input.questions);
    }

    return saved;
  }

  /**
   * Throw a draft away.
   *
   * Only a draft: it holds no escrow and has no responses, so nothing is lost.
   * A live, closed or expired survey is a record of money that moved and of
   * answers people were paid for — that is never deleted, the same reasoning
   * that gives the app catalogue and the template library no delete either.
   */
  async deleteDraft(userId: number, id: number): Promise<void> {
    const survey = await this.ownedSurvey(userId, id);
    if (survey.status !== 'draft') {
      throw new BadRequestException(
        `Only a draft can be deleted — this survey is ${survey.status}. Close it instead.`,
      );
    }

    await this.questionRepository.delete({ surveyId: id });
    await this.surveyRepository.delete({ id });
  }

  private async loadTemplate(key: string): Promise<SurveyTemplate> {
    const template = await this.templateRepository.findOne({ where: { key } });
    if (!template) throw new NotFoundException(`No template with key "${key}"`);
    if (!template.isActive) {
      throw new BadRequestException(`The "${template.name}" template has been retired.`);
    }
    return template;
  }

  /**
   * The whole question set is replaced rather than diffed. A draft has no
   * responses, so there is nothing to preserve, and diffing would risk leaving
   * an answer pointing at a question that no longer says what it did.
   */
  private async replaceQuestions(surveyId: number, questions: SurveyQuestionInput[]) {
    await this.questionRepository.delete({ surveyId });

    for (const [position, question] of questions.entries()) {
      await this.questionRepository.save(
        this.questionRepository.create({
          surveyId,
          type: question.type,
          prompt: question.prompt,
          position,
          optionsJson: CHOICE_TYPES.includes(question.type) ? question.options ?? null : null,
          required: question.required ?? true,
          // Frozen at publish, not now — see pricePerResponse above.
          feeAtPublish: '0',
        }),
      );
    }
  }

  /** What this survey WOULD cost if published right now. */
  private async quoteFor(
    questions: { type: QuestionType }[],
    targetResponses: number,
    collectPhoneNumber = false,
  ) {
    return this.pricing.quote(questions.map((q) => q.type), targetResponses, collectPhoneNumber);
  }

  private expiryFrom(durationDays: number | null | undefined): Date | null {
    if (durationDays == null) return null; // indefinite (§3.3)
    return new Date(Date.now() + durationDays * DAY_MS);
  }

  private validateQuestions(questions: SurveyQuestionInput[]): void {
    if (!questions?.length) {
      throw new BadRequestException('A survey must have at least one question');
    }
    for (const question of questions) {
      if (!isQuestionType(question.type)) {
        // No fee setting exists for an unknown type, so it cannot be priced.
        throw new BadRequestException(`Unknown question type: ${question.type}`);
      }
      if (!question.prompt?.trim()) {
        throw new BadRequestException('Every question needs a prompt');
      }
      if (CHOICE_TYPES.includes(question.type) && !question.options?.length) {
        throw new BadRequestException(`A ${question.type} question needs options`);
      }
    }
  }

  /**
   * Checks only the fields present on `input`. An edit that renames a survey
   * must not be rejected by a rule about a field it never touched.
   */
  private validateTargeting(
    input: { targetResponses?: number; durationDays?: number | null },
    { requireTarget = false }: { requireTarget?: boolean } = {},
  ): void {
    const { targetResponses, durationDays } = input;

    if (requireTarget || targetResponses !== undefined) {
      if (!Number.isInteger(targetResponses as number) || (targetResponses as number) <= 0) {
        throw new BadRequestException('Target responses must be a whole number greater than zero');
      }
    }
    if (durationDays != null && (!Number.isFinite(durationDays) || durationDays <= 0)) {
      throw new BadRequestException(
        'Duration must be a positive number of days, or omitted to run indefinitely',
      );
    }
  }
}
