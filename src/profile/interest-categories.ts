export interface InterestCategory {
  value: string;
  label: string;
}

/**
 * The industries this platform knows about.
 *
 * One list, three readers: the `interests` profile field a respondent fills in,
 * the `category` every survey template is tagged with, and the reporting label
 * a survey inherits from its template. Keeping them on one constant is what
 * makes "I am interested in Health" and "this is a Health survey" the same
 * word — which is the whole basis for sending someone a niche survey.
 *
 * Adding an industry means adding templates for it: the template library spec
 * asserts every category here has a full set behind it.
 */
export const INTEREST_CATEGORIES: InterestCategory[] = [
  { value: 'telecoms', label: 'Telecoms' },
  { value: 'health', label: 'Health & Medical' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'retail', label: 'Retail & Shopping' },
  { value: 'travel', label: 'Travel & Leisure' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'property', label: 'Property & Home' },
  { value: 'education', label: 'Education & Training' },
  { value: 'energy', label: 'Energy & Utilities' },
  { value: 'food', label: 'Food & Groceries' },
  { value: 'entertainment', label: 'Entertainment & Media' },
];

/**
 * What the `interests` profile field offers, which is the industries plus one
 * answer that is not an industry: "all" is a standing yes to everything, and
 * survey matching treats it as matching every filter rather than as a value to
 * compare against.
 */
export const INTEREST_FIELD_OPTIONS: InterestCategory[] = [
  { value: 'all', label: 'All industries' },
  ...INTEREST_CATEGORIES,
];
