import { surveyFinancials, summariseStatus, fillRate } from './survey-stats';

const survey = (over: Record<string, any> = {}) => ({
  id: 1, businessId: 7, title: 'S', status: 'live',
  targetResponses: 100, pricePerResponse: '5', totalHeld: '700', totalPaid: '150',
  ...over,
});

/**
 * The money math for the survey charts, kept pure so it is decided by a table
 * of cases rather than by whatever a query happened to return.
 *
 * The platform's cut is added ON TOP of the respondent pot at publish, and the
 * rate is frozen there — not stored on the row, but recoverable from it:
 * totalHeld = respondentTotal × (1 + cutRate), so cutRate = held/pot − 1. The
 * cut REALISED so far is that rate applied to what respondents were actually
 * paid, which is exact regardless of refunds (undelivered responses paid
 * nobody, so they earned no cut).
 */
describe('surveyFinancials', () => {
  it('recovers the frozen cut rate from the row', () => {
    // pot = 5 × 100 = 500; held 700 → cut 200 → rate 0.4
    expect(surveyFinancials(survey()).cutRate).toBeCloseTo(0.4, 5);
  });

  it('realises revenue only on what respondents were actually paid', () => {
    // paid 150 × 0.4 = 60
    expect(surveyFinancials(survey()).realisedRevenue).toBeCloseTo(60, 5);
  });

  it('counts delivered responses from the pay-out, not the target', () => {
    // 150 / 5 = 30 delivered of 100 asked
    expect(surveyFinancials(survey()).delivered).toBe(30);
  });

  it('is all zero for a draft that has committed nothing', () => {
    const f = surveyFinancials(survey({ status: 'draft', pricePerResponse: '0', totalHeld: '0', totalPaid: '0', targetResponses: 50 }));
    expect(f).toMatchObject({ cutRate: 0, realisedRevenue: 0, delivered: 0, respondentTotal: 0 });
  });

  it('never divides by zero when a price or target is missing', () => {
    expect(() => surveyFinancials(survey({ pricePerResponse: '0', targetResponses: 0 }))).not.toThrow();
  });

  it('handles a fully delivered survey — the whole committed cut is realised', () => {
    // pot 500, held 700 (cut 200), paid 500 (all delivered) → revenue 200
    expect(surveyFinancials(survey({ totalPaid: '500' })).realisedRevenue).toBeCloseTo(200, 5);
  });
});

describe('fillRate', () => {
  it('is responses over target, as a fraction', () => {
    expect(fillRate(30, 100)).toBeCloseTo(0.3, 5);
  });
  it('caps at 1 — a survey never over-fills its escrow', () => {
    expect(fillRate(120, 100)).toBe(1);
  });
  it('is zero when nothing was asked', () => {
    expect(fillRate(5, 0)).toBe(0);
  });
});

describe('summariseStatus', () => {
  it('counts surveys by status, always listing the four states', () => {
    const out = summariseStatus([
      survey({ status: 'live' }), survey({ status: 'live' }),
      survey({ status: 'draft' }), survey({ status: 'closed' }),
    ]);
    expect(out).toEqual([
      { status: 'draft', count: 1 },
      { status: 'live', count: 2 },
      { status: 'closed', count: 1 },
      { status: 'expired', count: 0 },
    ]);
  });
});
