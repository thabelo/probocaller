import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { JwtService } from '@nestjs/jwt';
import { TransactionService } from '../transaction/transaction.service';
import { ReportService } from '../report/report.service';

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

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private readonly transactionService: TransactionService,
    private readonly reportService: ReportService,
  ) {}

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
      walletBalance: Number(user.walletBalance),
      role: user.role,
    };
  }

  private makeReferralCode(id: number): string {
    return `PROBO-${id}`;
  }

  private async resolveReferrer(referralCode?: string): Promise<number | null> {
    if (!referralCode) return null;
    const referrer = await this.userRepository.findOne({ where: { referralCode } });
    return referrer ? referrer.id : null;
  }

  async login(loginDto: LoginDto) {
    const { phoneNumber, referralCode } = loginDto;
    let user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) {
      const referredBy = await this.resolveReferrer(referralCode);
      user = this.userRepository.create({
        phoneNumber,
        email: `${phoneNumber}@probo.local`,
        name: phoneNumber,
        ...(referredBy && { referredBy }),
      });
      await this.userRepository.save(user);
      user.referralCode = this.makeReferralCode(user.id);
      await this.userRepository.save(user);
    }
    const tokens = this.issueTokens(user);
    return { ...tokens, user: this.userResponse(user) };
  }

  async signup(signupDto: SignupDto) {
    const { phoneNumber, email, name, referralCode } = signupDto;
    let user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (user) {
      user.email = email;
      user.name = name;
      if (!user.referralCode) {
        user.referralCode = this.makeReferralCode(user.id);
      }
      await this.userRepository.save(user);
    } else {
      const referredBy = await this.resolveReferrer(referralCode);
      user = this.userRepository.create({
        phoneNumber, email, name,
        ...(referredBy && { referredBy }),
      });
      await this.userRepository.save(user);
      user.referralCode = this.makeReferralCode(user.id);
      await this.userRepository.save(user);
    }
    const tokens = this.issueTokens(user);
    return { ...tokens, user: this.userResponse(user) };
  }

  async getReferralCode(userId: number): Promise<{ referralCode: string; referredCount: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.referralCode) {
      user.referralCode = this.makeReferralCode(user.id);
      await this.userRepository.save(user);
    }
    const referredCount = await this.userRepository.count({ where: { referredBy: userId } });
    return { referralCode: user.referralCode, referredCount };
  }

  async findUserByPhone(phoneNumber: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findOrCreatePlaceholder(phoneNumber: string): Promise<User> {
    let user = await this.userRepository.findOne({ where: { phoneNumber } });
    if (user) return user;
    user = this.userRepository.create({
      phoneNumber,
      email: `${phoneNumber}@probo.local`,
      name: 'Unknown',
    });
    return this.userRepository.save(user);
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
    user.walletBalance = parseFloat((Number(user.walletBalance) + amount).toFixed(4));
    await this.userRepository.save(user);
    await this.transactionService.log(userId, 'CREDIT_ADDED', amount, `Wallet top-up of $${amount.toFixed(2)}`);
    return user;
  }

  async getWalletBalance(userId: number): Promise<{ balance: number }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { balance: Number(user.walletBalance) };
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
}
