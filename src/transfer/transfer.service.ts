import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not } from 'typeorm';
import { User } from '../user/user.entity';
import { Transaction } from '../transaction/transaction.entity';

@Injectable()
export class TransferService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly ds: DataSource,
  ) {}

  /**
   * Atomic P2P transfer.  Deducts from sender, credits recipient, logs both
   * sides. Recipient is identified by phone number (last 10 digits match).
   * The whole operation is wrapped in a DB transaction so a failure mid-flight
   * never leaves one side credited without the other debited.
   */
  async send(senderUserId: number, recipientPhone: string, amount: number, note?: string) {
    if (!(amount > 0)) throw new BadRequestException('Amount must be greater than zero.');
    if (amount > 1_000_000) throw new BadRequestException('Amount exceeds the maximum per transfer.');

    const sender = await this.userRepo.findOne({ where: { id: senderUserId } });
    if (!sender) throw new NotFoundException('Sender not found.');

    const cleanedRecipient = String(recipientPhone || '').replace(/\D/g, '');
    if (cleanedRecipient.length < 7) throw new BadRequestException('Invalid recipient phone number.');
    const last10 = cleanedRecipient.slice(-10);

    // Match recipient by trailing 10 digits — works for both "0123456789" and "+27123456789" stored numbers.
    const candidates = await this.userRepo.createQueryBuilder('u')
      .where(`REPLACE(REPLACE(u.phoneNumber, '+', ''), ' ', '') LIKE :tail`, { tail: `%${last10}` })
      .getMany();

    const recipient = candidates.find((u) => u.id !== sender.id);
    if (!recipient) throw new NotFoundException('Recipient is not on Probo.');
    if (recipient.id === sender.id) throw new BadRequestException('You cannot send to yourself.');

    return this.ds.transaction(async (m) => {
      // Lock both wallet rows inside the txn so two parallel sends from the
      // same account can't both pass the balance check and end up double-
      // spending (finding C3). Locks are taken in id order to avoid deadlocks
      // when two transfers go in opposite directions between the same pair.
      const [firstId, secondId] = [sender.id, recipient.id].sort((a, b) => a - b);
      const firstRow  = await m.findOne(User, { where: { id: firstId },  lock: { mode: 'pessimistic_write' } });
      const secondRow = await m.findOne(User, { where: { id: secondId }, lock: { mode: 'pessimistic_write' } });
      const freshSender    = firstId  === sender.id ? firstRow  : secondRow;
      const freshRecipient = firstId  === sender.id ? secondRow : firstRow;
      if (!freshSender || !freshRecipient) throw new NotFoundException('User missing during transfer.');

      const senderBal = Number(freshSender.walletBalance);
      if (amount > senderBal) {
        throw new BadRequestException(`Insufficient balance (you have ${senderBal.toFixed(4)}).`);
      }

      freshSender.walletBalance = parseFloat((senderBal - amount).toFixed(4));
      freshRecipient.walletBalance = parseFloat((Number(freshRecipient.walletBalance) + amount).toFixed(4));
      await m.save(freshSender);
      await m.save(freshRecipient);

      const desc = note ? `Transfer: ${note}` : 'Transfer';
      const ref = `P2P-${Date.now()}-${freshSender.id}-${freshRecipient.id}`;
      const sendTx = m.create(Transaction, {
        userId: freshSender.id,
        type: 'P2P_SEND',
        amount: -amount,
        description: `${desc} to ${freshRecipient.name || freshRecipient.phoneNumber}`,
        reference: ref,
        callId: null,
      });
      const recvTx = m.create(Transaction, {
        userId: freshRecipient.id,
        type: 'P2P_RECEIVE',
        amount: amount,
        description: `${desc} from ${freshSender.name || freshSender.phoneNumber}`,
        reference: ref,
        callId: null,
      });
      await m.save([sendTx, recvTx]);

      return {
        amount,
        recipient: { id: freshRecipient.id, name: freshRecipient.name, phoneNumber: freshRecipient.phoneNumber },
        newBalance: Number(freshSender.walletBalance),
        reference: ref,
      };
    });
  }
}
