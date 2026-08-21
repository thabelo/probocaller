/**
 * The money and completion math behind the survey charts.
 *
 * Pure and table-driven: these figures reconcile against real wallet moves, so
 * the rules that produce them belong in one place a test can pin, not scattered
 * through a query.
 */
export interface SurveyRowLike {
  status: string;
  targetResponses: number;
  pricePerResponse: string | number;
  totalHeld: string | number;
  totalPaid: string | number;
}

export interface SurveyFinancials {
  /** pricePerResponse × targetResponses — the respondent pot the cut sits on. */
  respondentTotal: number;
  /** The platform's cut rate, frozen at publish, recovered from the row. */
  cutRate: number;
  /** The cut earned so far: only on responses actually paid for. */
  realisedRevenue: number;
  /** How many responses have been delivered (paid out), from the pay-out. */
  delivered: number;
}

const num = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function surveyFinancials(survey: SurveyRowLike): SurveyFinancials {
  const price = num(survey.pricePerResponse);
  const target = num(survey.targetResponses);
  const held = num(survey.totalHeld);
  const paid = num(survey.totalPaid);

  const respondentTotal = round2(price * target);
  // held = pot × (1 + cutRate); with no pot there is no cut to recover.
  const cutRate = respondentTotal > 0 ? held / respondentTotal - 1 : 0;
  const realisedRevenue = round2(paid * Math.max(0, cutRate));
  const delivered = price > 0 ? Math.round(paid / price) : 0;

  return { respondentTotal, cutRate: Math.max(0, cutRate), realisedRevenue, delivered };
}

/** Responses over target, a fraction in [0, 1] — an escrow never over-fills. */
export function fillRate(responses: number, target: number): number {
  if (!target || target <= 0) return 0;
  return Math.min(1, responses / target);
}

export const SURVEY_STATUSES = ['draft', 'live', 'closed', 'expired'] as const;

/** Count by status, always listing all four so a chart has a stable shape. */
export function summariseStatus(surveys: Array<{ status: string }>): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>(SURVEY_STATUSES.map((s) => [s, 0]));
  for (const survey of surveys) {
    counts.set(survey.status, (counts.get(survey.status) ?? 0) + 1);
  }
  return SURVEY_STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}
