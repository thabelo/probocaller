import { INTEREST_CATEGORIES, INTEREST_FIELD_OPTIONS } from './interest-categories';

/**
 * The industry taxonomy, in one place.
 *
 * Three things are meant to agree: what a respondent can declare an interest
 * in, what a survey template is tagged with, and what a business can target.
 * They only stay in agreement if they are read from the same list — the
 * template library asserts against this one, so adding an industry to the
 * profile field without templates behind it fails the build.
 */
describe('interest categories', () => {
  it('offers a value and a human label for every industry', () => {
    expect(INTEREST_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    for (const category of INTEREST_CATEGORIES) {
      expect(category.value).toMatch(/^[a-z][a-z_]*$/);
      expect(category.label.trim()).not.toHaveLength(0);
    }
  });

  it('never repeats a value', () => {
    const values = INTEREST_CATEGORIES.map((c) => c.value);
    expect(new Set(values).size).toBe(values.length);
  });

  /**
   * "All" is an answer, not an industry: it means "send me everything" and no
   * template may be tagged with it. It is part of the profile field's options
   * and nothing else, which is why the two exports are separate.
   */
  it('puts "all industries" first in the profile field, and only there', () => {
    expect(INTEREST_FIELD_OPTIONS[0]).toEqual({ value: 'all', label: 'All industries' });
    expect(INTEREST_CATEGORIES.some((c) => c.value === 'all')).toBe(false);
    expect(INTEREST_FIELD_OPTIONS.slice(1)).toEqual(INTEREST_CATEGORIES);
  });
});
