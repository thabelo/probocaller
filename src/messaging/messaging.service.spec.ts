import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from '../user/user.entity';

const makeUser = (o: Partial<User> = {}): User =>
  ({ id: 2, phoneNumber: '+919999999999', name: 'Bob', ...o } as User);

describe('MessagingService', () => {
  let service: MessagingService;
  let convRepo: any;
  let msgRepo: any;
  let userRepo: any;

  beforeEach(async () => {
    convRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest.fn().mockImplementation(async (c) => ({ id: 7, ...c })),
    };
    msgRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation((d) => ({ ...d })),
      save: jest.fn().mockImplementation(async (m) => ({ id: 100, ...m })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    userRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: getRepositoryToken(Conversation), useValue: convRepo },
        { provide: getRepositoryToken(Message), useValue: msgRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
      ],
    }).compile();

    service = module.get(MessagingService);
  });

  describe('send', () => {
    it('creates a conversation and message when none exists', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ id: 2 }));
      convRepo.findOne.mockResolvedValue(null);

      const msg = await service.send(1, '+919999999999', 'hi');

      expect(convRepo.save).toHaveBeenCalledTimes(1);
      // canonical participant ordering (1 < 2) + initiator recorded
      expect(convRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ participantA: 1, participantB: 2, initiatorId: 1, accepted: false }),
      );
      expect(msgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 7, senderId: 1, body: 'hi' }),
      );
      expect(msg).toMatchObject({ senderId: 1, body: 'hi' });
    });

    it('reuses an existing conversation instead of creating a new one', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ id: 2 }));
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2, initiatorId: 1, accepted: true });

      await service.send(1, '+919999999999', 'again');

      expect(convRepo.create).not.toHaveBeenCalled();
      expect(msgRepo.save).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 7 }));
    });

    it('rejects an empty/whitespace body', async () => {
      userRepo.findOne.mockResolvedValue(makeUser());
      await expect(service.send(1, '+919999999999', '   ')).rejects.toThrow(BadRequestException);
    });

    it('rejects messaging a phone number with no registered user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.send(1, '+910000000000', 'hi')).rejects.toThrow(NotFoundException);
    });

    it('rejects messaging yourself', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ id: 1 }));
      await expect(service.send(1, '+919999999999', 'hi')).rejects.toThrow(BadRequestException);
    });

    it('accepts the conversation when the recipient (non-initiator) replies', async () => {
      userRepo.findOne.mockResolvedValue(makeUser({ id: 1 }));
      // current sender is user 2, who is NOT the initiator (user 1) and not yet accepted
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2, initiatorId: 1, accepted: false });

      await service.send(2, '+919999999999', 'sure');

      expect(convRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 7, accepted: true }));
    });
  });

  describe('getMessages', () => {
    it('throws Forbidden when the user is not a participant', async () => {
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2 });
      await expect(service.getMessages(99, 7)).rejects.toThrow(ForbiddenException);
    });

    it('returns the thread ordered oldest-first for a participant', async () => {
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2 });
      msgRepo.find.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const out = await service.getMessages(1, 7);
      expect(msgRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: 7 }, order: { createdAt: 'ASC' } }),
      );
      expect(out).toHaveLength(2);
    });
  });

  describe('markRead', () => {
    it('marks the other party\'s unread messages as read', async () => {
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2 });
      await service.markRead(1, 7);
      expect(msgRepo.update).toHaveBeenCalledTimes(1);
      const [where, patch] = msgRepo.update.mock.calls[0];
      expect(where).toEqual(expect.objectContaining({ conversationId: 7 }));
      expect(patch).toEqual(expect.objectContaining({ readAt: expect.any(Date) }));
    });

    it('forbids a non-participant from marking read', async () => {
      convRepo.findOne.mockResolvedValue({ id: 7, participantA: 1, participantB: 2 });
      await expect(service.markRead(99, 7)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listConversations', () => {
    it('flags an inbound, not-yet-accepted conversation as a request and reports unread count + other user', async () => {
      convRepo.find.mockResolvedValue([
        { id: 7, participantA: 1, participantB: 2, initiatorId: 2, accepted: false },
      ]);
      msgRepo.findOne.mockResolvedValue({ id: 5, conversationId: 7, senderId: 2, body: 'hey', createdAt: new Date() });
      msgRepo.count.mockResolvedValue(3);
      userRepo.findOne.mockResolvedValue(makeUser({ id: 2, name: 'Bob', phoneNumber: '+918888888888' }));

      const list = await service.listConversations(1);

      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ id: 7, otherUserId: 2, unreadCount: 3, isRequest: true });
      expect(list[0].otherUser).toMatchObject({ id: 2, name: 'Bob', phoneNumber: '+918888888888' });
    });

    it('does not flag a conversation the user initiated as a request', async () => {
      convRepo.find.mockResolvedValue([
        { id: 8, participantA: 1, participantB: 2, initiatorId: 1, accepted: false },
      ]);
      msgRepo.findOne.mockResolvedValue({ id: 6, conversationId: 8, senderId: 1, body: 'yo', createdAt: new Date() });

      const list = await service.listConversations(1);
      expect(list[0]).toMatchObject({ id: 8, otherUserId: 2, isRequest: false });
    });
  });
});
