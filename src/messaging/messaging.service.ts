import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';
import { User } from '../user/user.entity';

export interface ConversationSummary {
  id: number;
  otherUserId: number;
  otherUser: { id: number; name: string | null; phoneNumber: string } | null;
  lastMessage: Message | null;
  unreadCount: number;
  isRequest: boolean;
  accepted: boolean;
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Conversation) private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message) private readonly msgRepo: Repository<Message>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  /** Send a message to a registered user by phone number, creating the 1:1
   * conversation on first contact. A reply from the non-initiator accepts the
   * conversation (moves it out of the recipient's "requests" inbox). */
  async send(senderId: number, recipientPhone: string, body: string): Promise<Message> {
    const text = (body ?? '').trim();
    if (!text) throw new BadRequestException('Message body must not be empty.');

    const recipient = await this.userRepo.findOne({ where: { phoneNumber: recipientPhone } });
    if (!recipient) throw new NotFoundException('No Probo user with that phone number.');
    if (recipient.id === senderId) throw new BadRequestException('You cannot message yourself.');

    const [participantA, participantB] = senderId < recipient.id
      ? [senderId, recipient.id]
      : [recipient.id, senderId];

    let conv = await this.convRepo.findOne({ where: { participantA, participantB } });
    if (!conv) {
      conv = await this.convRepo.save(
        this.convRepo.create({ participantA, participantB, initiatorId: senderId, accepted: false }),
      );
    } else if (!conv.accepted && conv.initiatorId !== senderId) {
      // Recipient is replying — accept the request.
      conv.accepted = true;
      await this.convRepo.save(conv);
    }

    return this.msgRepo.save(
      this.msgRepo.create({ conversationId: conv.id, senderId, body: text, readAt: null }),
    );
  }

  async listConversations(userId: number): Promise<ConversationSummary[]> {
    const convs = await this.convRepo.find({
      where: [{ participantA: userId }, { participantB: userId }],
    });

    const summaries = await Promise.all(
      convs.map(async (conv) => {
        const otherUserId = conv.participantA === userId ? conv.participantB : conv.participantA;
        const other = await this.userRepo.findOne({ where: { id: otherUserId } });
        const otherUser = other
          ? { id: other.id, name: other.name ?? null, phoneNumber: other.phoneNumber }
          : null;
        const lastMessage = await this.msgRepo.findOne({
          where: { conversationId: conv.id },
          order: { createdAt: 'DESC' },
        });
        const unreadCount = await this.msgRepo.count({
          where: { conversationId: conv.id, senderId: Not(userId), readAt: IsNull() },
        });
        const isRequest = conv.initiatorId !== userId && !conv.accepted;
        return { id: conv.id, otherUserId, otherUser, lastMessage, unreadCount, isRequest, accepted: conv.accepted };
      }),
    );

    return summaries.sort(
      (a, b) =>
        (b.lastMessage?.createdAt?.getTime() ?? 0) - (a.lastMessage?.createdAt?.getTime() ?? 0),
    );
  }

  async getMessages(userId: number, conversationId: number): Promise<Message[]> {
    await this.assertParticipant(userId, conversationId);
    return this.msgRepo.find({ where: { conversationId }, order: { createdAt: 'ASC' } });
  }

  async markRead(userId: number, conversationId: number): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.msgRepo.update(
      { conversationId, senderId: Not(userId), readAt: IsNull() },
      { readAt: new Date() },
    );
    return { ok: true };
  }

  private async assertParticipant(userId: number, conversationId: number): Promise<Conversation> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Conversation not found.');
    if (conv.participantA !== userId && conv.participantB !== userId) {
      throw new ForbiddenException('Not a participant in this conversation.');
    }
    return conv;
  }
}
