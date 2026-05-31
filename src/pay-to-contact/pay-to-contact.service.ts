import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CallPermissionRequest } from '../data-broker/call-permission-request.entity';
import { User } from '../user/user.entity';
import { TransactionService } from '../transaction/transaction.service';

export interface EscrowSplit {
  businessCharge: number;
  platformFee: number;
  userEarnings: number;
}

const round4 = (n: number) => parseFloat(n.toFixed(4));

@Injectable()
export class PayToContactService {
  constructor(
    @InjectRepository(CallPermissionRequest)
    private readonly reqRepo: Repository<CallPermissionRequest>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tx: TransactionService,
    private readonly ds: DataSource,
  ) {}

  /**
   * Divide a staked bid when a paid call is approved.
   * The business is charged the full bid; the platform keeps `feeRate` of it
   * and the user earns the remainder. Both parts are rounded to 4 dp (wallet
   * precision) and the earnings absorb any rounding remainder so the two parts
   * always sum back to the full charge.
   */
  splitEscrow(amount: number, feeRate = 0.3): EscrowSplit {
    if (!(amount > 0)) {
      throw new BadRequestException('Bid amount must be greater than zero.');
    }
    const businessCharge = round4(amount);
    const platformFee = round4(businessCharge * feeRate);
    const userEarnings = round4(businessCharge - platformFee);
    return { businessCharge, platformFee, userEarnings };
  }

  /**
   * Stake a bid against a call-permission request: debit the business wallet
   * and hold the amount in escrow on the request. Atomic, with write-locks on
   * both the request row and the business wallet row so concurrent stakes
   * cannot double-spend. The audit row joins the same transaction (H10).
   */
  async stake(
    businessUserId: number,
    requestId: number,
    bidAmount: number,
  ): Promise<CallPermissionRequest> {
    if (!(bidAmount > 0)) {
      throw new BadRequestException('Bid amount must be greater than zero.');
    }
    return this.ds.transaction(async (m) => {
      const request = await m.findOne(CallPermissionRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Call permission request not found.');
      if (request.escrowStatus === 'held') {
        throw new ConflictException('This request already has a stake held.');
      }

      const business = await m.findOne(User, {
        where: { id: businessUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!business) throw new NotFoundException('Business account not found.');

      const balance = Number(business.walletBalance);
      if (bidAmount > balance) {
        throw new BadRequestException(
          `Insufficient balance to stake (you have ${balance.toFixed(4)}).`,
        );
      }

      business.walletBalance = round4(balance - bidAmount);
      request.bidAmount = bidAmount;
      request.escrowAmount = bidAmount;
      request.escrowStatus = 'held';

      await m.save(business);
      const saved = await m.save(request);

      await this.tx.log(
        businessUserId,
        'CALL_STAKE',
        -bidAmount,
        `Pay-to-Contact stake for request #${requestId}`,
        undefined,
        m,
      );
      return saved;
    });
  }

  /**
   * Release a held escrow when the user approves: pay the user their earnings
   * (bid minus platform fee), mark the request settled. Atomic, write-locking
   * the request and the user wallet; CALL_EARN joins the same transaction.
   */
  async settle(requestId: number, feeRate = 0.3): Promise<CallPermissionRequest> {
    return this.ds.transaction(async (m) => {
      const request = await m.findOne(CallPermissionRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Call permission request not found.');
      if (request.escrowStatus !== 'held') {
        throw new ConflictException('No held escrow to settle for this request.');
      }

      const { userEarnings } = this.splitEscrow(Number(request.escrowAmount), feeRate);

      const user = await m.findOne(User, {
        where: { id: request.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new NotFoundException('Target user not found.');

      user.walletBalance = round4(Number(user.walletBalance) + userEarnings);
      request.escrowStatus = 'released';
      request.escrowAmount = null;
      request.settledAt = new Date();

      await m.save(user);
      const saved = await m.save(request);

      await this.tx.log(
        request.userId,
        'CALL_EARN',
        userEarnings,
        `Pay-to-Contact earnings for request #${requestId}`,
        undefined,
        m,
      );
      return saved;
    });
  }

  /**
   * Return a held escrow in full to the business wallet (user rejected, or the
   * request expired). Atomic, write-locking the request and the business
   * wallet; CALL_REFUND joins the same transaction. The business user is taken
   * from the request's eager-loaded business relation.
   */
  async refund(requestId: number): Promise<CallPermissionRequest> {
    return this.ds.transaction(async (m) => {
      const request = await m.findOne(CallPermissionRequest, {
        where: { id: requestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Call permission request not found.');
      if (request.escrowStatus !== 'held') {
        throw new ConflictException('No held escrow to refund for this request.');
      }

      const businessUserId = request.business?.userId;
      if (!businessUserId) throw new NotFoundException('Business account not found.');

      const amount = round4(Number(request.escrowAmount));
      const business = await m.findOne(User, {
        where: { id: businessUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!business) throw new NotFoundException('Business account not found.');

      business.walletBalance = round4(Number(business.walletBalance) + amount);
      request.escrowStatus = 'refunded';
      request.escrowAmount = null;

      await m.save(business);
      const saved = await m.save(request);

      await this.tx.log(
        businessUserId,
        'CALL_REFUND',
        amount,
        `Pay-to-Contact refund for request #${requestId}`,
        undefined,
        m,
      );
      return saved;
    });
  }
}
