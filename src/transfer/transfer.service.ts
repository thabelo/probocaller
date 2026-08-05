import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Not, In } from 'typeorm';
import { User } from '../user/user.entity';
import { isRegisteredAccount } from '../user/registered-account';
import { PendingTransfer } from './pending-transfer.entity';
import { toE164 } from '../auth/phone-variants';

/** How long an unclaimed hold waits before it can be refunded to the sender. */
const PENDING_TRANSFER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
import { Transaction } from '../transaction/transaction.entity';

export type AdminTransferStatus = 'completed' | 'held' | 'claimed' | 'expired';

export type AdminTransferRow = {
  id: string;
  senderUserId: number;
  senderName?: string;
  senderPhone?: string;
  /** Empty for a completed transfer: the ledger records the pair, not a number. */
  recipientPhone: string;
  amount: number;
  status: AdminTransferStatus;
  note?: string;
  createdAt: Date;
  expiresAt?: Date;
  claimedAt?: Date | null;
};

@Injectable()
export class TransferService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(PendingTransfer)
    private readonly pendingRepo: Repository<PendingTransfer>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly ds: DataSource,
  ) {}

  /**
   * Every person-to-person movement, for admin oversight.
   *
   * Held money is the reason this exists: it sits against a phone number with no
   * account behind it, so it appears in nobody's wallet and nobody's statement.
   * Without a view of it, an expiring hold or a mistyped number is invisible.
   *
   * Completed transfers are recorded as Transactions and held ones as
   * PendingTransfers, so the two are merged here rather than in the UI.
   */
  async listForAdmin(): Promise<AdminTransferRow[]> {
    const [holds, sends] = await Promise.all([
      this.pendingRepo.find(),
      this.txRepo.find({ where: { type: 'P2P_SEND' } }),
    ]);

    const senderIds = [
      ...new Set([
        ...holds.map((h) => h.senderUserId),
        ...sends.map((t) => t.userId),
      ]),
    ].filter((id) => id != null);

    const senders = senderIds.length
      ? await this.userRepo.find({ where: { id: In(senderIds) } })
      : [];
    const byId = new Map(senders.map((u) => [u.id, u]));

    const decorate = (userId: number) => {
      const u = byId.get(userId);
      return { senderUserId: userId, senderName: u?.name, senderPhone: u?.phoneNumber };
    };

    const heldRows: AdminTransferRow[] = holds.map((h) => ({
      id: `pending-${h.id}`,
      ...decorate(h.senderUserId),
      recipientPhone: h.recipientPhone,
      amount: Number(h.amount),
      // 'pending' is the row's own word for it; 'held' is what it means to a
      // person reading the list.
      status: h.status === 'pending' ? 'held' : (h.status as AdminTransferStatus),
      note: h.note ?? undefined,
      createdAt: h.createdAt,
      expiresAt: h.expiresAt,
      claimedAt: h.claimedAt ?? null,
    }));

    const sentRows: AdminTransferRow[] = sends.map((t) => ({
      id: `tx-${t.id}`,
      ...decorate(t.userId),
      recipientPhone: '',
      // Stored as a negative debit against the sender; shown as the amount that
      // moved, since a minus sign here would read as a refund.
      amount: Math.abs(Number(t.amount)),
      status: 'completed',
      note: t.description ?? undefined,
      createdAt: t.createdAt,
      claimedAt: null,
    }));

    return [...heldRows, ...sentRows].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

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

    // Refused whether or not the number is on ProboCaller. Compared in canonical
    // E.164: a last-10 comparison reads "+27821110000" as 7821110000 and
    // "0821110000" as 0821110000, so it misses the very case it guards.
    const senderCanonical = toE164(sender.phoneNumber || '');
    if (senderCanonical && senderCanonical === toE164(recipientPhone)) {
      throw new BadRequestException('You cannot send to yourself.');
    }

    // A row in `users` is not proof of membership: uploading a phonebook creates
    // one per contact. Paying such a row credits a wallet nobody has logged into
    // and suppresses the SMS, so the money is never discovered. Treat it as a
    // non-user and hold the funds until they actually sign up.
    const recipient = candidates.find((u) => u.id !== sender.id && isRegisteredAccount(u));

    // Not on ProboCaller: debit the sender and HOLD the amount against the
    // number until they sign up. Crediting a placeholder account instead would
    // put real money in a wallet belonging to an unverified number.
    if (!recipient) {
      return this.holdForNonUser(sender.id, recipientPhone, amount, note);
    }

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

      // In-app notification, so the recipient learns about it without opening
      // their wallet. Best-effort: a notification must never roll back money
      // that has already moved.
      try {
        const notes = freshRecipient.notifications || [];
        notes.unshift({
          id: Date.now(),
          message: `${freshSender.name || freshSender.phoneNumber} sent you ${amount.toFixed(2)}${note ? ` — ${note}` : ''}`,
          timestamp: new Date(),
          read: false,
        });
        freshRecipient.notifications = notes;
        await m.save(freshRecipient);
      } catch {
        /* non-fatal */
      }

      return {
        amount,
        pending: false,
        recipientOnProbo: true,
        recipient: { id: freshRecipient.id, name: freshRecipient.name, phoneNumber: freshRecipient.phoneNumber },
        newBalance: Number(freshSender.walletBalance),
        reference: ref,
      };
    });
  }

  /**
   * Sweep anything held for this number into a newly-created wallet.
   *
   * Called at signup — the moment held money can finally reach the person it
   * was sent to. Silent when nothing is waiting, which is the common case.
   */
  async claimPendingFor(userId: number, phoneNumber: string) {
    const canonical = toE164(phoneNumber);
    if (!canonical) return { claimed: 0, total: 0 };

    return this.ds.transaction(async (m) => {
      const holds = await m.find(PendingTransfer, {
        where: { recipientPhone: canonical, status: 'pending' },
      });
      if (holds.length === 0) return { claimed: 0, total: 0 };

      const user = await m.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) return { claimed: 0, total: 0 };

      const total = holds.reduce((sum, h) => sum + Number(h.amount), 0);
      user.walletBalance = parseFloat((Number(user.walletBalance) + total).toFixed(4));

      const now = new Date();
      for (const h of holds) {
        h.status = 'claimed';
        h.claimedByUserId = userId;
        h.claimedAt = now;
      }
      await m.save(holds);

      const notes = user.notifications || [];
      notes.unshift({
        id: Date.now(),
        message: `${total.toFixed(2)} was waiting for you and has been added to your wallet.`,
        timestamp: now,
        read: false,
      });
      user.notifications = notes;
      await m.save(user);

      await m.save(
        m.create(Transaction, {
          userId,
          type: 'P2P_RECEIVE',
          amount: total,
          description: 'Money held for you before you joined',
          reference: `P2P-CLAIM-${now.getTime()}-${userId}`,
          callId: null,
        }),
      );

      return { claimed: holds.length, total };
    });
  }

  /**
   * Debit the sender and hold the amount for a number that is not on
   * ProboCaller yet. Returns recipientOnProbo:false so the app knows to send the
   * heads-up SMS from the sender's own phone — the server has no SMS provider.
   */
  private async holdForNonUser(
    senderUserId: number,
    recipientPhone: string,
    amount: number,
    note?: string,
  ) {
    const canonical = toE164(recipientPhone);

    return this.ds.transaction(async (m) => {
      const freshSender = await m.findOne(User, {
        where: { id: senderUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!freshSender) throw new NotFoundException('Sender not found.');

      const senderBal = Number(freshSender.walletBalance);
      if (amount > senderBal) {
        throw new BadRequestException(`Insufficient balance (you have ${senderBal.toFixed(4)}).`);
      }

      freshSender.walletBalance = parseFloat((senderBal - amount).toFixed(4));
      await m.save(freshSender);

      const expiresAt = new Date(Date.now() + PENDING_TRANSFER_TTL_MS);
      const held = m.create(PendingTransfer, {
        senderUserId: freshSender.id,
        recipientPhone: canonical,
        amount,
        note: note ?? null,
        status: 'pending',
        claimedByUserId: null,
        claimedAt: null,
        expiresAt,
      });
      await m.save(held);

      const ref = `P2P-HOLD-${Date.now()}-${freshSender.id}`;
      await m.save(
        m.create(Transaction, {
          userId: freshSender.id,
          type: 'P2P_SEND',
          amount: -amount,
          description: `${note ? `Transfer: ${note}` : 'Transfer'} to ${canonical} (awaiting signup)`,
          reference: ref,
          callId: null,
        }),
      );

      return {
        amount,
        pending: true,
        recipientOnProbo: false,
        recipient: { id: null, name: null, phoneNumber: canonical },
        newBalance: Number(freshSender.walletBalance),
        reference: ref,
        expiresAt,
      };
    });
  }
}
