import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  const makeService = () => ({
    purchaseLeads: jest.fn().mockResolvedValue({ purchased: 2, leads: [], totalCost: 0.4 }),
    queryAudience: jest.fn().mockResolvedValue({ estimatedReach: 5, estimatedTotalCost: 0.25 }),
  });
  const req = () => ({
    business: { id: 3, userId: 7, companyName: 'Acme' },
    apiKey: { scopes: ['income_range', 'age_range'] },
  });

  it('POST /leads passes the key scopes to purchaseLeads', async () => {
    const svc = makeService() as any;
    const controller = new LeadsController(svc);
    const dto = { filters: { income_range: { op: 'gte', value: 'lt_5k' } } } as any;

    const result = await controller.getLeads(req(), dto);

    expect(svc.purchaseLeads).toHaveBeenCalledWith(7, dto, ['income_range', 'age_range']);
    expect(svc.queryAudience).not.toHaveBeenCalled();
    expect(result).toEqual({ purchased: 2, leads: [], totalCost: 0.4 });
  });

  it('dryRun estimates via queryAudience (scoped) and never bills', async () => {
    const svc = makeService() as any;
    const controller = new LeadsController(svc);
    const dto = { dryRun: true, filters: {} } as any;

    const result = await controller.getLeads(req(), dto);

    expect(svc.queryAudience).toHaveBeenCalledWith(7, dto, ['income_range', 'age_range']);
    expect(svc.purchaseLeads).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, scopes: ['income_range', 'age_range'], estimatedReach: 5 });
  });
});
