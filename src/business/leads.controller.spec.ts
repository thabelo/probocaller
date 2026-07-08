import { LeadsController } from './leads.controller';

describe('LeadsController', () => {
  it('POST /leads runs the purchase for the api-key business and returns leads', async () => {
    const profileService = {
      purchaseLeads: jest.fn().mockResolvedValue({ purchased: 2, leads: [], totalCost: 0.4 }),
    } as any;
    const controller = new LeadsController(profileService);
    const req: any = { business: { id: 3, userId: 7, companyName: 'Acme' } };
    const dto = { filters: { income_range: { op: 'gte', value: 'lt_5k' } }, fromDate: '2026-01-01' } as any;

    const result = await controller.getLeads(req, dto);

    expect(profileService.purchaseLeads).toHaveBeenCalledWith(7, dto);
    expect(result).toEqual({ purchased: 2, leads: [], totalCost: 0.4 });
  });
});
