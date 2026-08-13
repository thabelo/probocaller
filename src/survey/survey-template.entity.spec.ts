import { getMetadataArgsStorage } from 'typeorm';
import { SurveyTemplate } from './survey-template.entity';

/**
 * A curated starting point in the admin-managed library (§3.1), e.g.
 * "Insurance NPS". Adding one is a DATA change, not a release — the same rule
 * the marketplace catalogue follows.
 *
 * Businesses build from a COPY. They never modify the template, so a template
 * edit can never alter a survey already published against it.
 */
describe('SurveyTemplate entity', () => {
  const columns = () =>
    getMetadataArgsStorage()
      .columns.filter((c) => c.target === SurveyTemplate)
      .map((c) => c.propertyName);

  const column = (name: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === SurveyTemplate && c.propertyName === name,
    );

  it('is addressable by a stable key, like the app catalogue', () => {
    const index = getMetadataArgsStorage().indices.find((i) => i.target === SurveyTemplate);
    expect(columns()).toContain('key');
    expect(index?.unique).toBe(true);
  });

  it('carries its questions as data', () => {
    expect(columns()).toContain('questionsJson');
  });

  /**
   * Retiring a template must not delete it: surveys built from it stay
   * traceable to where they came from.
   */
  it('is retired by flag rather than deletion', () => {
    expect(column('isActive')?.options.default).toBe(true);
  });
});
