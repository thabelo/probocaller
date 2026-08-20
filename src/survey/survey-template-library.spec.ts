import { TEMPLATE_LIBRARY } from './survey-template-library';
import { INTEREST_CATEGORIES } from '../profile/interest-categories';
import { CHOICE_TYPES, QUESTION_TYPES, isQuestionType } from './question-type';

/**
 * The shipped template library.
 *
 * These are the starting points a business builds a survey from, so a bad one
 * is not a cosmetic problem: a question with no options cannot be answered, an
 * unknown type cannot be priced, and a category outside the interests taxonomy
 * can never reach a respondent who asked for that industry.
 *
 * This guards the data itself. Seeding it is SurveyTemplateService's job.
 */
describe('survey template library', () => {
  it('covers every industry a respondent can declare an interest in', () => {
    const covered = new Set(TEMPLATE_LIBRARY.map((t) => t.category));
    for (const { value } of INTEREST_CATEGORIES) {
      expect([value, covered.has(value)]).toEqual([value, true]);
    }
  });

  it('is tagged only with real industries', () => {
    const known = new Set(INTEREST_CATEGORIES.map((c) => c.value));
    for (const template of TEMPLATE_LIBRARY) {
      expect([template.key, known.has(template.category)]).toEqual([template.key, true]);
    }
  });

  /**
   * Ten each, so every industry is a usable library on its own rather than one
   * or two token examples next to a well-served neighbour.
   */
  it('gives every industry ten templates', () => {
    for (const { value } of INTEREST_CATEGORIES) {
      const count = TEMPLATE_LIBRARY.filter((t) => t.category === value).length;
      expect([value, count]).toEqual([value, 10]);
    }
  });

  it('never repeats a key', () => {
    const keys = TEMPLATE_LIBRARY.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /** Keys are what a business names when building, so they say their industry. */
  it('names each template after its industry', () => {
    for (const template of TEMPLATE_LIBRARY) {
      expect(template.key).toMatch(new RegExp(`^${template.category}-[a-z0-9-]+$`));
    }
  });

  it('describes what each template is for', () => {
    for (const template of TEMPLATE_LIBRARY) {
      expect(template.name.trim()).not.toHaveLength(0);
      expect([template.key, template.description.trim().length > 20]).toEqual([template.key, true]);
    }
  });

  describe('questions', () => {
    const questions = TEMPLATE_LIBRARY.flatMap((t) => t.questions.map((q) => ({ ...q, key: t.key })));

    it('asks something answerable every time', () => {
      for (const question of questions) {
        expect(isQuestionType(question.type)).toBe(true);
        expect(question.prompt.trim()).not.toHaveLength(0);
        // A prompt that is not a question is a statement the respondent has to
        // guess the response scale for.
        expect([question.prompt, question.prompt.endsWith('?')]).toEqual([question.prompt, true]);
      }
    });

    it('gives every choice question distinct options to choose from', () => {
      for (const question of questions.filter((q) => CHOICE_TYPES.includes(q.type))) {
        const options = question.options ?? [];
        expect([question.prompt, options.length >= 2]).toEqual([question.prompt, true]);
        expect(new Set(options).size).toBe(options.length);
      }
    });

    it('leaves options off the questions that are not choices', () => {
      for (const question of questions.filter((q) => !CHOICE_TYPES.includes(q.type))) {
        expect(question.options).toBeUndefined();
      }
    });

    /**
     * Long enough to be worth a respondent's time and a business's money,
     * short enough to finish on a phone.
     */
    it('keeps each template between three and six questions', () => {
      for (const template of TEMPLATE_LIBRARY) {
        const count = template.questions.length;
        expect([template.key, count >= 3 && count <= 6]).toEqual([template.key, true]);
      }
    });

    /**
     * Every question type carries its own fee, so a library that only ever
     * reached for the cheapest one would quietly cap what a respondent earns.
     */
    it('uses more than one kind of question', () => {
      for (const template of TEMPLATE_LIBRARY) {
        const kinds = new Set(template.questions.map((q) => q.type));
        expect([template.key, kinds.size > 1]).toEqual([template.key, true]);
      }
      const used = new Set(questions.map((q) => q.type));
      for (const type of QUESTION_TYPES) {
        // dropdown is multiple_choice shown collapsed — a control for long
        // lists, and nothing here has one.
        if (type === 'dropdown') continue;
        expect([type, used.has(type)]).toEqual([type, true]);
      }
    });
  });
});
