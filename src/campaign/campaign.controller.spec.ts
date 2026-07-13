import { CampaignController } from './campaign.controller';

describe('CampaignController', () => {
  const svc = {
    list: jest.fn().mockResolvedValue([{ id: 1 }]),
    create: jest.fn().mockResolvedValue({ id: 2 }),
    update: jest.fn().mockResolvedValue({ id: 2, status: 'active' }),
    remove: jest.fn().mockResolvedValue(undefined),
  } as any;
  const controller = new CampaignController(svc);
  const req = { user: { userId: 7 } } as any;

  beforeEach(() => jest.clearAllMocks());

  it("lists the caller's campaigns for a business", async () => {
    await controller.list(req, 3);
    expect(svc.list).toHaveBeenCalledWith(7, 3);
  });

  it('creates a campaign scoped to the caller and business', async () => {
    const body = { businessId: 3, name: 'Q3 push', budget: 250 };
    await controller.create(req, body as any);
    expect(svc.create).toHaveBeenCalledWith(7, 3, body);
  });

  it('updates a campaign as the caller', async () => {
    await controller.update(req, 2, { status: 'active' } as any);
    expect(svc.update).toHaveBeenCalledWith(7, 2, { status: 'active' });
  });

  it('removes a campaign as the caller', async () => {
    await controller.remove(req, 2);
    expect(svc.remove).toHaveBeenCalledWith(7, 2);
  });
});
