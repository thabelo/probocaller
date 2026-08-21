import 'reflect-metadata';
import { SmsInsightController, AdminSmsInsightController } from './sms-insight.controller';

describe('SmsInsightController', () => {
  const insights = {
    analyseForUser: jest.fn().mockResolvedValue({ profile: [], survey: [] }),
    pendingProfileFor: jest.fn().mockResolvedValue([]),
    applyProfileSuggestion: jest.fn().mockResolvedValue({ id: 1, status: 'applied' }),
    resolve: jest.fn().mockResolvedValue({ id: 1, status: 'dismissed' }),
    pendingSurveySuggestions: jest.fn().mockResolvedValue([]),
  } as any;
  const req = { user: { userId: 7 } };

  const controller = new SmsInsightController(insights);
  const admin = new AdminSmsInsightController(insights);

  it('passes the token user and mapped messages to the service', async () => {
    await controller.analyse(req, { messages: [{ body: 'hi', address: '+27', receivedAt: '2026-08-01' }] } as any);
    const [userId, msgs] = insights.analyseForUser.mock.calls.at(-1)!;
    expect(userId).toBe(7);
    expect(msgs[0]).toMatchObject({ body: 'hi', address: '+27' });
    expect(msgs[0].receivedAt).toBeInstanceOf(Date);
  });

  it('reads only the caller’s own profile suggestions', async () => {
    await controller.profileSuggestions(req);
    expect(insights.pendingProfileFor).toHaveBeenCalledWith(7);
  });

  it('applies and dismisses by the token user, not a body id', async () => {
    await controller.apply(req, 5);
    expect(insights.applyProfileSuggestion).toHaveBeenCalledWith(7, 5);
    await controller.dismiss(req, 5);
    expect(insights.resolve).toHaveBeenCalledWith(7, 5, 'dismissed');
  });

  it('exposes survey suggestions on the admin controller', async () => {
    await admin.surveySuggestions();
    expect(insights.pendingSurveySuggestions).toHaveBeenCalled();
  });
});
