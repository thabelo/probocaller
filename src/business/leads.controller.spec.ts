import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  const makeProfile = () => ({
    purchaseLeads: jest.fn().mockResolvedValue({ purchased: 2, leads: [], totalCost: 0.4 }),
    queryAudience: jest.fn().mockResolvedValue({ estimatedReach: 5, estimatedTotalCost: 0.25 }),
  });
  const makeBusiness = () => ({ recordApiKeyUsage: jest.fn().mockResolvedValue(undefined) });
  const req = () => ({
    business: { id: 3, userId: 7, companyName: 'Acme' },
    apiKey: { id: 11, scopes: ['income_range', 'age_range'], label: 'CRM' },
  });

  it('passes scopes to purchaseLeads and records usage against the key', async () => {
    const profile = makeProfile() as any;
    const business = makeBusiness() as any;
    const controller = new LeadsController(profile, business);
    const dto = { filters: { income_range: { op: 'gte', value: 'lt_5k' } } } as any;

    const result = await controller.getLeads(req(), dto);

    // uncapped key → spendCap null (4th arg); source attributes the cert (5th arg)
    expect(profile.purchaseLeads).toHaveBeenCalledWith(
      7, dto, ['income_range', 'age_range'], null, { apiKeyId: 11, label: 'CRM' },
    );
    expect(business.recordApiKeyUsage).toHaveBeenCalledWith(11, 0.4);
    expect(result).toEqual({ purchased: 2, leads: [], totalCost: 0.4 });
  });

  it("forwards the key's per-call spend cap to purchaseLeads", async () => {
    const profile = makeProfile() as any;
    const controller = new LeadsController(profile, makeBusiness() as any);
    const capReq = { business: { id: 3, userId: 7 }, apiKey: { id: 11, scopes: ['income_range'], label: 'Nightly', maxSpendPerCall: '750.0000' } };
    const dto = { filters: {} } as any;

    await controller.getLeads(capReq, dto);

    expect(profile.purchaseLeads).toHaveBeenCalledWith(7, dto, ['income_range'], 750, { apiKeyId: 11, label: 'Nightly' });
  });

  it('dryRun estimates (scoped), never bills, and records no usage', async () => {
    const profile = makeProfile() as any;
    const business = makeBusiness() as any;
    const controller = new LeadsController(profile, business);
    const dto = { dryRun: true, filters: {} } as any;

    const result = await controller.getLeads(req(), dto);

    expect(profile.queryAudience).toHaveBeenCalledWith(7, dto, ['income_range', 'age_range']);
    expect(profile.purchaseLeads).not.toHaveBeenCalled();
    expect(business.recordApiKeyUsage).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, scopes: ['income_range', 'age_range'], estimatedReach: 5 });
  });
});
