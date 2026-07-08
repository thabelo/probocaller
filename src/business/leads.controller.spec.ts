import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  const makeService = () => ({
    purchaseLeads: jest.fn().mockResolvedValue({ purchased: 2, leads: [], totalCost: 0.4 }),
    queryAudience: jest.fn().mockResolvedValue({ estimatedReach: 5, estimatedTotalCost: 0.25 }),
  });

  it('POST /leads runs the purchase for the api-key business and returns leads', async () => {
    const profileService = makeService() as any;
    const controller = new LeadsController(profileService);
    const req: any = { business: { id: 3, userId: 7, companyName: 'Acme' } };
    const dto = { filters: { income_range: { op: 'gte', value: 'lt_5k' } }, fromDate: '2026-01-01' } as any;

    const result = await controller.getLeads(req, dto);

    expect(profileService.purchaseLeads).toHaveBeenCalledWith(7, dto);
    expect(profileService.queryAudience).not.toHaveBeenCalled();
    expect(result).toEqual({ purchased: 2, leads: [], totalCost: 0.4 });
  });

  it('dryRun estimates via queryAudience and does NOT bill (purchaseLeads not called)', async () => {
    const profileService = makeService() as any;
    const controller = new LeadsController(profileService);
    const req: any = { business: { id: 3, userId: 7, companyName: 'Acme' } };
    const dto = { dryRun: true, filters: {} } as any;

    const result = await controller.getLeads(req, dto);

    expect(profileService.queryAudience).toHaveBeenCalledWith(7, dto);
    expect(profileService.purchaseLeads).not.toHaveBeenCalled();
    expect(result).toEqual({ dryRun: true, estimatedReach: 5, estimatedTotalCost: 0.25 });
  });
});
