import { DataBrokerController } from './data-broker.controller';

const VALID_ACTIONS = ['free', 'paid', 'blocked'];

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

/**
 * The mobile app previously hardcoded BOTH call-preset (callPolicy.ts
 * CALL_PRESETS) and SMS-preset (smsPolicy.ts SMS_PRESETS) definitions with
 * no server source. This endpoint makes the server's existing
 * call-policy.ts / sms-policy.ts constants — already the source of truth
 * used to validate/persist a user's chosen preset — readable by the app.
 */
describe('DataBrokerController — GET /data-broker/policy-presets', () => {
  const svc = {} as any;

  it('returns both call and sms preset tables, each with all 6 presets fully mapped', () => {
    const c = new DataBrokerController(svc);
    const res = c.policyPresets();

    expect(Object.keys(res)).toEqual(expect.arrayContaining(['call', 'sms']));

    for (const table of [res.call, res.sms]) {
      const presetNames = Object.keys(table);
      expect(presetNames).toHaveLength(6);
      for (const preset of Object.values<Record<string, string>>(table)) {
        const categories = Object.keys(preset);
        expect(categories).toHaveLength(4);
        for (const action of Object.values(preset)) {
          expect(VALID_ACTIONS).toContain(action);
        }
      }
    }
  });

  it('exposes the exact 6 named call presets with the documented category → action mapping', () => {
    const c = new DataBrokerController(svc);
    const res = c.policyPresets();
    expect(res.call).toEqual({
      all_calls: { contacts: 'free', business: 'free', newCaller: 'free', unknown: 'free' },
      all_paid_biz: { contacts: 'free', business: 'paid', newCaller: 'free', unknown: 'free' },
      contacts_paid_biz: { contacts: 'free', business: 'paid', newCaller: 'blocked', unknown: 'blocked' },
      paid_all: { contacts: 'free', business: 'paid', newCaller: 'paid', unknown: 'paid' },
      contacts_only: { contacts: 'free', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' },
      dnd: { contacts: 'blocked', business: 'blocked', newCaller: 'blocked', unknown: 'blocked' },
    });
  });
});
