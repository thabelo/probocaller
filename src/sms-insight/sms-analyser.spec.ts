import { RuleBasedSmsAnalyser } from './sms-analyser';

const msg = (body: string, over: Record<string, any> = {}) =>
  ({ body, address: '+2782', receivedAt: new Date('2026-08-01'), ...over });

/**
 * The analyser turns SMS CONTENT into structured suggestions — never into an
 * automatic change. This is the seam an internal LLM slots into: a real model
 * implements the same analyse(messages) → { profileSuggestions, surveySuggestions }
 * signature. Until one is wired, this rule-based version is the working default,
 * and its determinism is what makes the whole pipeline testable.
 */
describe('RuleBasedSmsAnalyser', () => {
  const analyser = new RuleBasedSmsAnalyser();

  it('suggests a household/children update from a birth message', () => {
    const out = analyser.analyse([msg('Congratulations on your new baby! Mother and child are well.')]);
    const fields = out.profileSuggestions.map((s) => s.fieldKey);
    expect(fields).toContain('has_children');
    expect(out.profileSuggestions.find((s) => s.fieldKey === 'has_children')!.suggestedValue).toBe('true');
  });

  it('suggests an employment update from a job-offer message', () => {
    const out = analyser.analyse([msg('We are pleased to offer you the position. Your start date is Monday.')]);
    expect(out.profileSuggestions.map((s) => s.fieldKey)).toContain('employment_status');
  });

  it('suggests a vehicle-finance update from a car-loan message', () => {
    const out = analyser.analyse([msg('Your vehicle finance application with WesBank has been approved.')]);
    const f = out.profileSuggestions.map((s) => s.fieldKey);
    expect(f.some((k) => k === 'has_vehicle' || k === 'vehicle_finance_status')).toBe(true);
  });

  it('carries a confidence and a REDACTED shred of evidence, never the whole SMS', () => {
    const body = 'Congratulations on your new baby, account 1234567890, at 12 Long Street.';
    const [s] = analyser.analyse([msg(body)]).profileSuggestions;
    expect(s.confidence).toBeGreaterThan(0);
    expect(s.confidence).toBeLessThanOrEqual(1);
    // Evidence is a short reason, not the raw text, and never the digits/address.
    expect(s.evidence).not.toContain('1234567890');
    expect(s.evidence).not.toContain('Long Street');
    expect(s.evidence.length).toBeLessThan(body.length);
  });

  it('proposes a survey question when a theme recurs but no field fits', () => {
    const out = analyser.analyse([
      msg('Your medical aid claim was processed.'),
      msg('Discovery: your plan renews next month.'),
    ]);
    expect(out.surveySuggestions.length).toBeGreaterThan(0);
    expect(out.surveySuggestions[0]).toHaveProperty('prompt');
    expect(out.surveySuggestions[0]).toHaveProperty('type');
  });

  it('finds nothing in ordinary chatter, rather than inventing a signal', () => {
    const out = analyser.analyse([msg('Hey, are we still on for coffee at 3?'), msg('lol ok see you then')]);
    expect(out.profileSuggestions).toEqual([]);
    expect(out.surveySuggestions).toEqual([]);
  });

  it('does not suggest the same field twice, keeping the strongest evidence', () => {
    const out = analyser.analyse([
      msg('Your new baby is registered.'),
      msg('Congratulations on the birth of your child.'),
    ]);
    const children = out.profileSuggestions.filter((s) => s.fieldKey === 'has_children');
    expect(children).toHaveLength(1);
  });

  it('handles an empty inbox', () => {
    expect(analyser.analyse([])).toEqual({ profileSuggestions: [], surveySuggestions: [] });
  });
});
