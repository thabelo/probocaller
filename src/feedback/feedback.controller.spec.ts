import { FeedbackController } from './feedback.controller';

describe('FeedbackController', () => {
  let controller: FeedbackController;
  let service: { submit: jest.Mock; listForAdmin: jest.Mock };

  beforeEach(() => {
    service = { submit: jest.fn(), listForAdmin: jest.fn() };
    controller = new FeedbackController(service as any);
  });

  it('submits feedback for the authenticated user', async () => {
    service.submit.mockResolvedValue({ id: 7 });
    const body = { category: 'bug', message: 'broken' } as any;
    const res = await controller.submit({ user: { userId: 42 } } as any, body);
    expect(service.submit).toHaveBeenCalledWith(42, body);
    expect(res).toEqual({ id: 7 });
  });

  it('lists feedback for admin with status + parsed limit', async () => {
    service.listForAdmin.mockResolvedValue([]);
    await controller.listForAdmin('open', '25');
    expect(service.listForAdmin).toHaveBeenCalledWith({ status: 'open', limit: 25 });
  });
});
