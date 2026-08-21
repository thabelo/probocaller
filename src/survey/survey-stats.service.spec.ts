import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SurveyStatsService } from './survey-stats.service';
import { Survey } from './survey.entity';
import { Business } from '../business/business.entity';

describe('SurveyStatsService', () => {
  let service: SurveyStatsService;
  let surveyRepo: any;
  let businessRepo: any;
  let query: jest.Mock;

  const SURVEYS = [
    { id: 1, businessId: 7, title: 'NPS', status: 'live', targetResponses: 100, pricePerResponse: '5', totalHeld: '700', totalPaid: '150', publishedAt: new Date('2026-08-01') },
    { id: 2, businessId: 7, title: 'Claims', status: 'closed', targetResponses: 50, pricePerResponse: '4', totalHeld: '280', totalPaid: '200', publishedAt: new Date('2026-07-20') },
    { id: 3, businessId: 7, title: 'Draft', status: 'draft', targetResponses: 30, pricePerResponse: '0', totalHeld: '0', totalPaid: '0', publishedAt: null },
  ];

  const build = async () => {
    query = jest.fn(async (sql: string) => {
      if (/date_trunc/i.test(sql)) return [{ day: new Date('2026-08-01T00:00:00Z'), responses: 20 }];
      // per-survey submitted counts
      return [{ surveyId: 1, responses: 30 }, { surveyId: 2, responses: 45 }];
    });
    surveyRepo = { find: jest.fn().mockResolvedValue(SURVEYS) };
    businessRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 7, userId: 1, companyName: 'Acme' }),
      find: jest.fn().mockResolvedValue([{ id: 7, companyName: 'Acme' }]),
    };
    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyStatsService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepo },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = mod.get(SurveyStatsService);
    return service;
  };

  describe('forBusiness', () => {
    it('refuses a business the caller does not own', async () => {
      await build();
      businessRepo.findOne.mockResolvedValue(null);
      await expect(service.forBusiness(1, 7)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('totals responses, targets and spend across the business', async () => {
      const out = await (await build()).forBusiness(1, 7);
      expect(out.totals.surveys).toBe(3);
      expect(out.totals.live).toBe(1);
      expect(out.totals.responses).toBe(75);          // 30 + 45
      expect(out.totals.spend).toBeCloseTo(980, 2);    // 700 + 280
      expect(out.totals.paidToRespondents).toBeCloseTo(350, 2); // 150 + 200
    });

    it('reports an overall fill rate', async () => {
      const out = await (await build()).forBusiness(1, 7);
      // 75 responses / 150 target (100 + 50; draft's 30 not published) 
      expect(out.totals.fillRate).toBeCloseTo(0.5, 2);
    });

    it('lists the busiest surveys with their fill', async () => {
      const out = await (await build()).forBusiness(1, 7);
      expect(out.topSurveys[0]).toMatchObject({ title: 'Claims', responses: 45, target: 50 });
      expect(out.topSurveys[0].fillRate).toBeCloseTo(0.9, 2);
    });

    it('returns a per-day response series', async () => {
      const out = await (await build()).forBusiness(1, 7);
      expect(out.responsesOverTime.some((d: any) => d.responses === 20)).toBe(true);
    });

    it('breaks surveys down by status', async () => {
      const out = await (await build()).forBusiness(1, 7);
      expect(out.statusBreakdown).toEqual(expect.arrayContaining([
        { status: 'live', count: 1 }, { status: 'closed', count: 1 }, { status: 'draft', count: 1 },
      ]));
    });

    it('scopes the response query to the business', async () => {
      await (await build()).forBusiness(1, 7);
      const sql = query.mock.calls.map(([s]: any[]) => s).join('\n');
      expect(sql).toMatch(/"businessId"\s*=\s*\$1|s\."businessId"/i);
    });
  });

  describe('platform', () => {
    it('totals across all businesses and realises platform revenue', async () => {
      const out = await (await build()).platform();
      // revenue: survey1 150×0.4=60, survey2 pot=200 held280 cut0.4 paid200→80 → 140
      expect(out.totals.platformRevenue).toBeCloseTo(140, 2);
      expect(out.totals.responses).toBe(75);
      expect(out.totals.businesses).toBe(1);
    });

    it('ranks the top businesses by responses and spend', async () => {
      const out = await (await build()).platform();
      expect(out.topBusinesses[0]).toMatchObject({ businessId: 7, name: 'Acme', responses: 75 });
      expect(out.topBusinesses[0].revenue).toBeCloseTo(140, 2);
    });

    it('returns a platform-wide response series', async () => {
      const out = await (await build()).platform();
      expect(out.responsesOverTime.length).toBeGreaterThan(0);
    });
  });
});
