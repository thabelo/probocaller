import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyTemplate, TemplateQuestion } from './survey-template.entity';
import { CHOICE_TYPES, isQuestionType } from './question-type';

export interface CreateTemplateInput {
  key: string;
  name: string;
  description?: string;
  category?: string;
  questions: TemplateQuestion[];
}

export type UpdateTemplateInput = Partial<Omit<CreateTemplateInput, 'key'>> & {
  isActive?: boolean;
};

/**
 * The admin-curated template library (surveys-spec §3.1) — "Insurance NPS",
 * "Product feedback". Adding one is a DATA change, not a release.
 *
 * Businesses build from a COPY of a template, so editing one never reaches a
 * survey already published from it, and retiring one hides it without deleting
 * the row those surveys trace back to.
 */
@Injectable()
export class SurveyTemplateService {
  constructor(
    @InjectRepository(SurveyTemplate)
    private readonly templateRepository: Repository<SurveyTemplate>,
  ) {}

  /** What a business may build from. */
  async listActive(): Promise<SurveyTemplate[]> {
    return this.templateRepository.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  /** What the console curates — retired templates included. */
  async listAll(): Promise<SurveyTemplate[]> {
    return this.templateRepository.find({ order: { name: 'ASC' } });
  }

  async create(input: CreateTemplateInput): Promise<SurveyTemplate> {
    this.validateQuestions(input.questions);

    const existing = await this.templateRepository.findOne({ where: { key: input.key } });
    if (existing) {
      throw new BadRequestException(`A template with key "${input.key}" already exists`);
    }

    return this.templateRepository.save(
      this.templateRepository.create({
        key: input.key,
        name: input.name,
        description: input.description ?? '',
        category: input.category ?? '',
        questionsJson: input.questions,
        isActive: true,
      }),
    );
  }

  async update(key: string, input: UpdateTemplateInput): Promise<SurveyTemplate> {
    const template = await this.templateRepository.findOne({ where: { key } });
    if (!template) throw new NotFoundException(`No template with key "${key}"`);

    if (input.questions !== undefined) {
      this.validateQuestions(input.questions);
      template.questionsJson = input.questions;
    }
    if (input.name !== undefined) template.name = input.name;
    if (input.description !== undefined) template.description = input.description;
    if (input.category !== undefined) template.category = input.category;
    // Retire by flag: surveys built from this template stay traceable to it.
    if (input.isActive !== undefined) template.isActive = input.isActive;

    return this.templateRepository.save(template);
  }

  /**
   * Reject anything a survey built from this template could not be priced or
   * answered with. Catching it here means the business finds out while
   * choosing a template, not at publish after doing all the work.
   */
  private validateQuestions(questions: TemplateQuestion[]): void {
    if (!questions?.length) {
      throw new BadRequestException('A template must have at least one question');
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
}
