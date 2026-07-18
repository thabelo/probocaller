import { DataBrokerController } from './data-broker.controller';

describe('DataBrokerController — approve with free-call window', () => {
  const makeService = () => ({ respondToRequest: jest.fn().mockResolvedValue({ id: 7, status: 'approved' }) });
  const req = { user: { userId: 1 } };

  it('maps freeWindow "24h" to 24h in ms and approves', async () => {
    const svc = makeService() as any;
    const c = new DataBrokerController(svc);
    await c.approve(req, 7, { freeWindow: '24h' });
    expect(svc.respondToRequest).toHaveBeenCalledWith(1, 7, true, 24 * 60 * 60 * 1000);
  });

  it('maps "week" and "month" windows', async () => {
    const svc = makeService() as any;
    const c = new DataBrokerController(svc);
    await c.approve(req, 7, { freeWindow: 'week' });
    expect(svc.respondToRequest).toHaveBeenCalledWith(1, 7, true, 7 * 24 * 60 * 60 * 1000);
    await c.approve(req, 7, { freeWindow: 'month' });
    expect(svc.respondToRequest).toHaveBeenCalledWith(1, 7, true, 30 * 24 * 60 * 60 * 1000);
  });

  it('approving with no window passes undefined (plain paid approval)', async () => {
    const svc = makeService() as any;
    const c = new DataBrokerController(svc);
    await c.approve(req, 7, {});
    expect(svc.respondToRequest).toHaveBeenCalledWith(1, 7, true, undefined);
  });
});
