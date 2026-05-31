import { Test, TestingModule } from '@nestjs/testing';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

describe('MessagingController', () => {
  let controller: MessagingController;
  let service: any;
  const req = { user: { userId: 1 } };

  beforeEach(async () => {
    service = {
      send: jest.fn().mockResolvedValue({ id: 100 }),
      listConversations: jest.fn().mockResolvedValue([]),
      getMessages: jest.fn().mockResolvedValue([]),
      markRead: jest.fn().mockResolvedValue({ ok: true }),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MessagingController],
      providers: [{ provide: MessagingService, useValue: service }],
    }).compile();
    controller = module.get(MessagingController);
  });

  it('POST /messages delegates to send with the authed user id', async () => {
    await controller.send(req as any, { recipientPhone: '+919999999999', body: 'hi' });
    expect(service.send).toHaveBeenCalledWith(1, '+919999999999', 'hi');
  });

  it('GET /conversations delegates to listConversations', async () => {
    await controller.list(req as any);
    expect(service.listConversations).toHaveBeenCalledWith(1);
  });

  it('GET /conversations/:id/messages delegates to getMessages', async () => {
    await controller.thread(req as any, 7);
    expect(service.getMessages).toHaveBeenCalledWith(1, 7);
  });

  it('POST /conversations/:id/read delegates to markRead', async () => {
    await controller.read(req as any, 7);
    expect(service.markRead).toHaveBeenCalledWith(1, 7);
  });
});
