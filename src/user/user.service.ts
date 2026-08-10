import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from './user.entity';
import { isRegisteredAccount } from './registered-account';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import { TransactionService } from '../transaction/transaction.service';
import { InviteService } from '../invite/invite.service';
import { TransferService } from '../transfer/transfer.service';
import { ReportService } from '../report/report.service';
import { phoneNumberVariants, toE164 } from '../auth/phone-variants';
import { normalisePhoneNumber } from '../common/phone';

/** Parse any SA phone number into its canonical parts. */
function parsePhone(raw: string): { phone: string; country: string; code: string; phoneLocal: string } {
  const digits = raw.replace(/[^\d]/g, '');
  let e164: string;
  let local: string;
  if (digits.startsWith('27') && digits.length === 11) {
    e164 = `+${digits}`;
    local = `0${digits.slice(2)}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    e164 = `+27${digits.slice(1)}`;
    local = digits;
  } else {
    e164 = raw.startsWith('+') ? raw : `+${digits}`;
    local = digits;
  }
  return { phone: e164, country: 'za', code: '27', phoneLocal: local };
}

/** One request must not be able to ask about a whole phonebook. */
const CHECK_REGISTERED_MAX = 1000;

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private readonly transactionService: TransactionService,
    private readonly reportService: ReportService,
    private readonly inviteService: InviteService,
    private readonly transferService: TransferService,
  ) {}

  /**
   * Close the loop on whoever invited this number, so the admin view can show
   * conversions rather than only sends. Never allowed to break a signup — an
   * invite is bookkeeping, and a new account matters more than its provenance.
   */
  /**
   * Money sent to this number before the account existed is held rather than
   * credited to a placeholder. Signup is when it can finally land. Never allowed
   * to break a signup — a failed sweep leaves the hold in place to retry.
   */
  private async claimHeldMoney(userId: number, canonical: string): Promise<void> {
    try {
      await this.transferService.claimPendingFor(userId, canonical);
    } catch {
      /* non-fatal — the hold stays pending */
    }
  }

  private async markInviteAccepted(canonical: string): Promise<void> {
    try {
      await this.inviteService.markAccepted(canonical);
    } catch {
      /* non-fatal */
    }
  }

  private issueTokens(user: User) {
    const payload = { sub: user.id, phoneNumber: user.phoneNumber };
    // Stay-logged-in defaults — overridable via env.
    // Access token: long enough that users rarely see an interactive re-auth,
    //               short enough that revocation has meaningful blast-radius.
    // Refresh token: months — silent renewal as long as the device is used.
    const accessExpires  = (process.env.JWT_ACCESS_EXPIRES  || '7d')  as any;
    const refreshExpires = (process.env.JWT_REFRESH_EXPIRES || '90d') as any;
    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpires });
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
    const refreshToken = this.jwtService.sign(
      { sub: user.id, type: 'refresh' },
      { secret: refreshSecret, expiresIn: refreshExpires },
    );
    return { accessToken, refreshToken };
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') throw new UnauthorizedException('Not a refresh token');
    const user = await this.userRepository.findOne({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('User not found');
    const tokens = this.issueTokens(user);
    return { ...tokens, user: this.userResponse(user) };
  }

  private userResponse(user: User) {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      name: user.name,
      isBusiness: user.isBusiness,
      // Gates every business surface on the clients. Opt-in and free.
      businessOptIn: !!user.businessOptIn,
      walletBalance: Number(user.walletBalance),
      role: user.role,
    };
  }

  /**
   * Turn on business mode for a normal account. Free and idempotent: it only
   * unlocks the business surfaces (and the onboarding that precedes them) —
   * registering an actual company stays a separate, later step.
   */
  async enableBusinessMode(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.businessOptIn) {
      user.businessOptIn = true;
      await this.userRepository.save(user);
    }
    return { businessOptIn: true };
  }

  /**
   * Turn business mode back off. The mirror of enableBusinessMode and equally
   * free: it only hides the business surfaces. Nothing is deleted — the
   * registered company, its wallet, API keys and leads all stay exactly as they
   * were, so opting back in restores the account rather than rebuilding it.
   */
  async disableBusinessMode(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.businessOptIn) {
      user.businessOptIn = false;
      await this.userRepository.save(user);
    }
    return { businessOptIn: false };
  }

  /**
   * One opaque referral-code candidate: PROBO-{8 chars} from a Crockford-ish
   * alphabet (no I/O/1/0 ambiguity), ~40 bits of entropy. The old enumerable
   * PROBO-{id} let anyone pass PROBO-1 to mint money for a stranger now that a
   * real-money bonus exists; opaque codes cannot be guessed.
   *
   * Indices come from crypto.randomInt, which rejection-samples internally.
   * The old `randomBytes(8)[i] % 30` was modulo-biased — 256 is not a multiple
   * of the 30-char alphabet, so the first 16 symbols were over-represented.
   */
  private generateReferralCodeCandidate(): string {
    const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 8; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    return `PROBO-${s}`;
  }

  /**
   * Allocate a unique referral code to a user and persist it. The existing
   * UNIQUE(referralCode) constraint is the hard backstop; the retry loop handles
   * the astronomically rare collision gracefully instead of 500-ing.
   */
  private async assignReferralCode(user: User): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = this.generateReferralCodeCandidate();
      const clash = await this.userRepository.count({ where: { referralCode: candidate } });
      if (clash === 0) {
        user.referralCode = candidate;
        await this.userRepository.save(user);
        return candidate;
      }
    }
    throw new Error('Could not allocate a unique referral code');
  }

  private async resolveReferrer(referralCode?: string): Promise<number | null> {
    if (!referralCode) return null;
    const referrer = await this.userRepository.findOne({ where: { referralCode } });
    return referrer ? referrer.id : null;
  }

  async login(loginDto: LoginDto) {
    const { phoneNumber, referralCode } = loginDto;
    // Resolve the account by every equivalent phone format so "0XXXXXXXXX",
    // "27XXXXXXXXX" and "+27XXXXXXXXX" all map to ONE account instead of minting
    // duplicates (F1). New accounts are stored in canonical E.164 form.
    const variants = phoneNumberVariants(phoneNumber);
    let user = variants.length
      ? await this.userRepository.findOne({ where: { phoneNumber: In(variants) } })
      : null;
    const isNewUser = !user;
    if (!user) {
      const canonical = toE164(phoneNumber);
      // Record who referred this account (drives the lifetime 3% commission paid
      // via ReferralService whenever this user later EARNS). No signup credit.
      const referredBy = await this.resolveReferrer(referralCode);
      user = this.userRepository.create({
        phoneNumber: canonical,
        email: `${canonical}@probo.local`,
        name: canonical,
        ...(referredBy && { referredBy }),
      });
      // Use the RETURNED entity rather than relying on save() mutating the
      // argument in place — that is an implementation detail, and the id is
      // needed immediately below.
      user = await this.userRepository.save(user);
      await this.assignReferralCode(user);
      await this.markInviteAccepted(canonical);
      await this.claimHeldMoney(user.id, canonical);
    }
    const tokens = this.issueTokens(user);
    // The name/email above are placeholders. `isNewUser` is the only signal the
    // client has to send this account through the profile step and replace them
    // with something real — without it every account keeps its phone number as
    // its display name for good.
    return { ...tokens, isNewUser, user: this.userResponse(user) };
  }

  async signup(signupDto: SignupDto) {
    const { phoneNumber, email, name, referralCode } = signupDto;
    // Same canonical resolution as login so signup never forks a duplicate (F1).
    const variants = phoneNumberVariants(phoneNumber);
    let user = variants.length
      ? await this.userRepository.findOne({ where: { phoneNumber: In(variants) } })
      : null;
    if (user) {
      user.email = email;
      user.name = name;
      await this.userRepository.save(user);
      if (!user.referralCode) {
        await this.assignReferralCode(user);
      }
    } else {
      const canonical = toE164(phoneNumber);
      // Record who referred this account (drives the lifetime 3% commission paid
      // via ReferralService whenever this user later EARNS). No signup credit.
      const referredBy = await this.resolveReferrer(referralCode);
      user = this.userRepository.create({
        phoneNumber: canonical, email, name,
        ...(referredBy && { referredBy }),
      });
      // Use the RETURNED entity rather than relying on save() mutating the
      // argument in place — that is an implementation detail, and the id is
      // needed immediately below.
      user = await this.userRepository.save(user);
      await this.assignReferralCode(user);
      await this.markInviteAccepted(canonical);
      await this.claimHeldMoney(user.id, canonical);
    }
    const tokens = this.issueTokens(user);
    return { ...tokens, user: this.userResponse(user) };
  }

  async getReferralCode(userId: number): Promise<{ referralCode: string; referredCount: number; referralEarnings: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.referralCode) {
      await this.assignReferralCode(user);
    }
    const referredCount = await this.userRepository.count({ where: { referredBy: userId } });
    // Lifetime earned referral commission (real wallet money from the ongoing
    // 3% on invitees' earnings) — see ReferralService for the credit path.
    const referralEarnings = await this.transactionService.sumByUserAndType(userId, 'REFERRAL_COMMISSION');
    return { referralCode: user.referralCode, referredCount, referralEarnings };
  }

  async findUserByPhone(phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findOrCreatePlaceholder(phoneNumber: string): Promise<User> {
    // Match however the number was stored. An exact-string match made a user
    // registered as "+27821234567" invisible to a lookup for "27821234567" or
    // "0821234567" — and minted a fresh placeholder instead, quietly dropping
    // their business status, spam flag and wallet balance. The incoming-call
    // gate reads exactly those fields, so a low-funds business call rang
    // through with no voice note. Same variant list login already matches on.
    const variants = phoneNumberVariants(phoneNumber);
    const canonical = normalisePhoneNumber(phoneNumber);
    // One round trip for every stored form — this sits on the incoming-call hot
    // path, where the overlay reads "Looking up caller…" until it returns.
    const matches = variants.length > 1
      ? await this.userRepository.find({ where: { phoneNumber: In(variants) } })
      : await this.userRepository.find({ where: { phoneNumber } });
    // Years of exact-match lookups left duplicate placeholder rows beside the
    // real account, so the canonical E.164 row wins when several match.
    const user = matches.find((u) => u.phoneNumber === canonical) ?? matches[0];
    if (user) return user;
    const placeholder = this.userRepository.create({
      phoneNumber,
      email: `${phoneNumber}@probo.local`,
      name: 'Unknown',
    });
    return this.userRepository.save(placeholder);
  }

  /**
   * Imports contacts from a user's address book.
   *
   * SECURITY: this method MUST only ever read `phoneNumber` and `name` from the
   * caller-supplied object. Historically it accepted `Partial<User>` and called
   * `repo.create(userData)` straight through — which let any authenticated user
   * mass-assign `role`, `walletBalance`, `isBusiness`, etc., minting funded
   * admin accounts for arbitrary numbers (finding H1). The DTO at the
   * controller boundary now strips extra fields via class-validator's
   * `forbidNonWhitelisted`, and the explicit destructure below is a defence in
   * depth so a refactor that drops the DTO doesn't quietly reopen the hole.
   */
  async addMultipleContacts(
    contacts: Array<{ phoneNumber: string; name?: string }>,
  ): Promise<User[]> {
    const savedUsers: User[] = [];
    for (const raw of contacts ?? []) {
      const phoneNumber = typeof raw?.phoneNumber === 'string' ? raw.phoneNumber.trim() : '';
      const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 120) : undefined;
      if (!phoneNumber) {
        throw new BadRequestException('Each contact requires a non-empty phoneNumber.');
      }

      let user = await this.userRepository.findOne({ where: { phoneNumber } });
      if (user) {
        // Only the display name may be updated through this endpoint. Spam flag
        // changes go through the dedicated /user/spam/* endpoints, which are
        // gated and audited; merging isSpam here would let any caller flip
        // someone's number to "reported" without a real report.
        if (name) user.name = name;
        await this.userRepository.save(user);
      } else {
        user = this.userRepository.create({ phoneNumber, name });
        await this.userRepository.save(user);
      }
      savedUsers.push(user);
    }
    return savedUsers;
  }

  async reportSpam(phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) throw new NotFoundException('User not found');
    user.isSpam = true;
    await this.userRepository.save(user);
    return user;
  }

  async findAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }

  async addToSpamList(userId: number, phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const spamList = user.spamList || [];
    if (!spamList.includes(phoneNumber)) {
      spamList.push(phoneNumber);
      user.spamList = spamList;
      await this.userRepository.save(user);
    }
    return user;
  }

  async removeFromSpamList(userId: number, phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.spamList = (user.spamList || []).filter((num) => num !== phoneNumber);
    await this.userRepository.save(user);
    return user;
  }

  async getSpamList(userId: number): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user.spamList || [];
  }

  async addCredit(userId: number, amount: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.isBusiness) throw new BadRequestException('Only business accounts can add call credits');
    // Real money: only finite, positive, sane amounts may credit a wallet —
    // NaN/Infinity pass naive checks and corrupt the balance permanently.
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0 || amt > 1_000_000) {
      throw new BadRequestException('Amount must be a positive number within the per-transaction limit');
    }
    user.walletBalance = parseFloat((Number(user.walletBalance) + amt).toFixed(4));
    await this.userRepository.save(user);
    await this.transactionService.log(userId, 'CREDIT_ADDED', amount, `Wallet top-up of R${amount.toFixed(2)}`);
    return user;
  }

  async getWalletBalance(userId: number): Promise<{ balance: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { balance: Number(user.walletBalance) };
  }

  /**
   * Which of these numbers belong to ProboCaller users.
   *
   * Answered in ONE query: the send-money contact picker badges every contact,
   * and a per-contact lookup would be hundreds of round trips on a real
   * phonebook. Numbers are echoed back exactly as asked so the client can match
   * rows without re-normalising, while matching itself goes through the same
   * variant list login uses — a contact saved as "082…" must still match an
   * account stored as "+27…", or the badge lies.
   */
  async checkRegistered(
    phoneNumbers: string[],
  ): Promise<{ phoneNumber: string; registered: boolean; name?: string }[]> {
    const asked = (phoneNumbers ?? []).slice(0, CHECK_REGISTERED_MAX);

    // Map every stored variant back to the number the caller asked about.
    const variantToAsked = new Map<string, string>();
    for (const raw of asked) {
      // phoneNumberVariants echoes back whatever it is given, so "abc" would
      // otherwise become a query term. Require something phone-shaped first.
      if (String(raw ?? '').replace(/\D/g, '').length < 7) continue;
      for (const v of phoneNumberVariants(String(raw))) {
        variantToAsked.set(v, raw);
      }
    }
    if (variantToAsked.size === 0) {
      return asked.map((phoneNumber) => ({ phoneNumber, registered: false }));
    }

    const found = (
      await this.userRepository.find({
        where: { phoneNumber: In([...variantToAsked.keys()]) },
      })
      // Phonebook rows are not members. Badging one as a member skips the SMS
      // and pays a wallet nobody has logged into.
    ).filter(isRegisteredAccount);

    const hit = new Map<string, User>();
    for (const u of found) {
      const key = variantToAsked.get(u.phoneNumber);
      if (key !== undefined) hit.set(key, u);
    }

    return asked.map((phoneNumber) => {
      const u = hit.get(phoneNumber);
      return u
        ? { phoneNumber, registered: true, name: u.name }
        : { phoneNumber, registered: false };
    });
  }

  async getNotifications(userId: number): Promise<{ notifications: any[] }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { notifications: user.notifications || [] };
  }

  async markNotificationRead(userId: number, notificationId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const notifications = user.notifications || [];
    const n = notifications.find((n) => n.id === notificationId);
    if (n) {
      n.read = true;
      user.notifications = notifications;
      await this.userRepository.save(user);
    }
    return user;
  }

  // Soft-delete: marks the user with a deactivation timestamp. Subsequent
  // JWT validations reject the principal (see JwtStrategy.validate). Idempotent
  // — re-calling on an already-deactivated user preserves the original timestamp.
  async deactivate(userId: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.deactivatedAt) {
      user.deactivatedAt = new Date();
      await this.userRepository.save(user);
    }
    return user;
  }

  // The safe personal-data projection returned to the account owner. Deliberately
  // excludes wallet/role/spam and other privileged columns.
  private personalView(user: User) {
    return { id: user.id, name: user.name, email: user.email, phoneNumber: user.phoneNumber };
  }

  async getMe(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.personalView(user);
  }

  // Self-service edit of personal data. Only name + email are assignable — the
  // phone number is the verified login identity and privileged columns (role,
  // walletBalance, …) are never mass-assigned from the request body.
  async updateMe(userId: number, dto: { name?: string; email?: string }) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (dto.name !== undefined) user.name = dto.name;
    if (dto.email !== undefined) user.email = dto.email;
    await this.userRepository.save(user);
    return this.personalView(user);
  }
}
