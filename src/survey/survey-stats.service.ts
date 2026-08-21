import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Survey } from './survey.entity';
import { Business } from '../business/business.entity';
import { fillRate, summariseStatus, surveyFinancials } from './survey-stats';

const DAY_MS = 24 * 60 * 60 * 1000;
/** How far back the response time-series looks. */
const SERIES_DAYS = 30;

/**
 * Survey performance, for two audiences:
 *   - a BUSINESS looking at its own surveys (forBusiness), and
 *   - an ADMIN looking across every business (platform).
 *
 * Money reconciles against real wallet moves, so all of it runs through the
 * pure survey-stats functions; only the response counts and the time series
 * are SQL, because they aggregate a table the survey row does not carry.
 */
@Injectable()
export class SurveyStatsService {
  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepo: Repository<Survey>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly dataSource: DataSource,
  ) {}

  async forBusiness(userId: number, businessId: number) {
    const business = await this.businessRepo.findOne({ where: { id: businessId, userId } });
    if (!business) {
      throw new ForbiddenException('This business does not belong to your account.');
    }

    const surveys = await this.surveyRepo.find({ where: { businessId } });
    const responseCounts = await this.responseCounts(businessId);
    const series = await this.responseSeries(businessId);

    const published = surveys.filter((s) => s.status !== 'draft');
    const responses = [...responseCounts.values()].reduce((a, b) => a + b, 0);
    const targetTotal = published.reduce((a, s) => a + (s.targetResponses || 0), 0);
    const spend = surveys.reduce((a, s) => a + Number(s.totalHeld ?? 0), 0);
    const paidToRespondents = surveys.reduce((a, s) => a + Number(s.totalPaid ?? 0), 0);

    const topSurveys = surveys
      .map((s) => {
        const r = responseCounts.get(s.id) ?? 0;
        return {
          surveyId: s.id,
          title: s.title,
          status: s.status,
          responses: r,
          target: s.targetResponses || 0,
          fillRate: fillRate(r, s.targetResponses || 0),
        };
      })
      .sort((a, b) => b.responses - a.responses)
      .slice(0, 8);

    return {
      totals: {
        surveys: surveys.length,
        live: surveys.filter((s) => s.status === 'live').length,
        responses,
        targetTotal,
        fillRate: fillRate(responses, targetTotal),
        spend: round2(spend),
        paidToRespondents: round2(paidToRespondents),
      },
      statusBreakdown: summariseStatus(surveys),
      topSurveys,
      responsesOverTime: series,
    };
  }

  async platform() {
    const surveys = await this.surveyRepo.find();
    const responseCounts = await this.responseCounts();
    const series = await this.responseSeries();
    const businesses = await this.businessRepo.find();
    const nameOf = new Map(businesses.map((b) => [b.id, b.companyName]));

    const published = surveys.filter((s) => s.status !== 'draft');
    const responses = [...responseCounts.values()].reduce((a, b) => a + b, 0);
    const platformRevenue = round2(
      published.reduce((a, s) => a + surveyFinancials(s).realisedRevenue, 0),
    );
    const paidToRespondents = round2(surveys.reduce((a, s) => a + Number(s.totalPaid ?? 0), 0));

    // Group by business.
    const byBiz = new Map<number, { surveys: number; responses: number; spend: number; revenue: number }>();
    for (const s of surveys) {
      const agg = byBiz.get(s.businessId) ?? { surveys: 0, responses: 0, spend: 0, revenue: 0 };
      agg.surveys += 1;
      agg.responses += responseCounts.get(s.id) ?? 0;
      agg.spend += Number(s.totalHeld ?? 0);
      agg.revenue += surveyFinancials(s).realisedRevenue;
      byBiz.set(s.businessId, agg);
    }
    const topBusinesses = [...byBiz.entries()]
      .map(([businessId, agg]) => ({
        businessId,
        name: nameOf.get(businessId) ?? `Business ${businessId}`,
        surveys: agg.surveys,
        responses: agg.responses,
        spend: round2(agg.spend),
        revenue: round2(agg.revenue),
      }))
      .sort((a, b) => b.responses - a.responses || b.spend - a.spend)
      .slice(0, 10);

    return {
      totals: {
        surveys: surveys.length,
        businesses: byBiz.size,
        responses,
        platformRevenue,
        paidToRespondents,
      },
      statusBreakdown: summariseStatus(surveys),
      topBusinesses,
      responsesOverTime: series,
    };
  }

  /** Submitted-response count per survey, optionally scoped to one business. */
  private async responseCounts(businessId?: number): Promise<Map<number, number>> {
    const rows = await this.dataSource.query(
      `SELECT r."surveyId" AS "surveyId", COUNT(*)::int AS responses
         FROM survey_responses r
         JOIN surveys s ON s."id" = r."surveyId"
        WHERE r."submittedAt" IS NOT NULL
          ${businessId != null ? 'AND s."businessId" = $1' : ''}
        GROUP BY r."surveyId"`,
      businessId != null ? [businessId] : [],
    );
    return new Map(rows.map((r: any) => [Number(r.surveyId), Number(r.responses)]));
  }

  /** Submitted responses per day over the recent window, gap-filled. */
  private async responseSeries(businessId?: number): Promise<Array<{ date: string; responses: number }>> {
    const from = new Date(Date.now() - SERIES_DAYS * DAY_MS);
    const params: any[] = [from];
    if (businessId != null) params.push(businessId);
    const rows = await this.dataSource.query(
      `SELECT date_trunc('day', r."submittedAt") AS day, COUNT(*)::int AS responses
         FROM survey_responses r
         JOIN surveys s ON s."id" = r."surveyId"
        WHERE r."submittedAt" IS NOT NULL AND r."submittedAt" >= $1
          ${businessId != null ? 'AND s."businessId" = $2' : ''}
        GROUP BY day ORDER BY day ASC`,
      params,
    );

    const key = (d: Date) => d.toISOString().slice(0, 10);
    const counts = new Map<string, number>(
      rows.map((r: any) => [key(new Date(r.day)), Number(r.responses)]),
    );
    const out: Array<{ date: string; responses: number }> = [];
    const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    for (let t = start.getTime(); t <= Date.now(); t += DAY_MS) {
      const date = key(new Date(t));
      out.push({ date, responses: counts.get(date) ?? 0 });
    }
    return out;
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
