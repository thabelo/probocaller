import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AddCreditDto } from './dto/add-credit.dto';
import { AddContactsDto } from './dto/add-contacts.dto';
import { UpdatePersonalInfoDto } from './dto/update-personal-info.dto';
import { AuthGuard } from '@nestjs/passport';
import { BusinessService } from '../business/business.service';
import { TransactionService } from '../transaction/transaction.service';
import { DataBrokerService } from '../data-broker/data-broker.service';
import { LookupService } from '../lookup/lookup.service';
import { ExternalLookupRateLimiter } from './external-lookup-rate-limiter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../config/setting.entity';
import { REFERRAL_RATE_KEY, parseCommissionRate } from '../referral/referral.service';

@ApiTags('users')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly businessService: BusinessService,
    private readonly transactionService: TransactionService,
    private readonly dataBrokerService: DataBrokerService,
    private readonly lookupService: LookupService,
    private readonly externalLookupLimiter: ExternalLookupRateLimiter,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
  ) {}

  // ── Admin-only: returns the full user list with PII. ──────────────────
  // Was previously open to any authenticated user, which leaked phone numbers
  // and names of every account on the platform.
  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all users (admin-only)' })
  async getAllUsers(@Request() req) {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.userService.findAllUsers();
  }

  // Rate-limit auth endpoints: 5 attempts per minute per IP.
  // Prevents brute-force and account-enumeration via login behaviour.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  async login(@Body() loginDto: LoginDto) {
    return this.userService.login(loginDto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @ApiOperation({ summary: 'Sign up user' })
  async signup(@Body() signupDto: SignupDto) {
    return this.userService.signup(signupDto);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user’s personal data (name, email, phone)' })
  async getMe(@Request() req) {
    return this.userService.getMe(req.user.userId);
  }

  @Put('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update the current user’s personal data (name, email)' })
  async updateMe(@Request() req, @Body() body: UpdatePersonalInfoDto) {
    return this.userService.updateMe(req.user.userId, body);
  }

  @Delete('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate (soft-delete) the current user account' })
  async deactivateMe(@Request() req) {
    const user = await this.userService.deactivate(req.user.userId);
    return { id: user.id, deactivatedAt: user.deactivatedAt };
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  async refresh(@Body() body: { refreshToken: string }) {
    return this.userService.refreshAccessToken(body.refreshToken);
  }

  @Post('add-multiple')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add multiple contacts' })
  async addMultipleContacts(@Body() body: AddContactsDto) {
    return this.userService.addMultipleContacts(body.users);
  }

  @Post('spam/add')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add phone to spam list' })
  async addToSpamList(@Request() req, @Body() body: { phoneNumber: string }) {
    return this.userService.addToSpamList(req.user.userId, body.phoneNumber);
  }

  @Post('spam/remove')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove phone from spam list' })
  async removeFromSpamList(@Request() req, @Body() body: { phoneNumber: string }) {
    return this.userService.removeFromSpamList(req.user.userId, body.phoneNumber);
  }

  @Get('spam/list')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get spam list' })
  async getSpamList(@Request() req) {
    return { spamList: await this.userService.getSpamList(req.user.userId) };
  }

  @Post('credit')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Add credits to business wallet (positive amount only)' })
  async addCredit(@Request() req, @Body() body: AddCreditDto) {
    return this.userService.addCredit(req.user.userId, body.amount);
  }

  /**
   * Badge a list of contacts as on/off ProboCaller in one round trip. The
   * send-money picker runs over the whole phonebook, so per-contact lookups are
   * not an option.
   */
  @UseGuards(AuthGuard('jwt'))
  @Post('check-registered')
  @ApiOperation({ summary: 'Which of these phone numbers are ProboCaller users' })
  checkRegistered(@Body() body: { phoneNumbers?: string[] }) {
    return this.userService.checkRegistered(body?.phoneNumbers ?? []);
  }

  @Get('referral-code')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own referral code, referred user count, and total referral earnings' })
  async getReferralCode(@Request() req) {
    return this.userService.getReferralCode(req.user.userId);
  }

  @Get('wallet')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get wallet balance' })
  async getWalletBalance(@Request() req) {
    return this.userService.getWalletBalance(req.user.userId);
  }

  @Get('notifications')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get notifications' })
  async getNotifications(@Request() req) {
    return this.userService.getNotifications(req.user.userId);
  }

  @Put('notifications/read/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark notification as read' })
  async markNotificationRead(@Request() req, @Param('id') notificationId: number) {
    return this.userService.markNotificationRead(req.user.userId, Number(notificationId));
  }

  @Get('transactions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get transaction history' })
  async getTransactions(@Request() req) {
    return this.transactionService.findByUser(req.user.userId);
  }

  @Put('report/:phoneNumber')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Report number as spam' })
  async reportSpam(@Param('phoneNumber') phoneNumber: string) {
    return this.userService.reportSpam(phoneNumber);
  }

  // Free, explicit business opt-in — called after the business onboarding.
  // Declared BEFORE the ':phoneNumber' catch-all so it isn't read as a lookup.
  @Post('business-opt-in')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable business mode for the signed-in user (free)' })
  async enableBusinessMode(@Request() req) {
    return this.userService.enableBusinessMode(req.user.userId);
  }

  // The mirror of the opt-in: hides the business surfaces without deleting any
  // business data. Declared BEFORE the ':phoneNumber' catch-all, same as above.
  @Post('business-opt-out')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Turn business mode back off (keeps all business data)' })
  async disableBusinessMode(@Request() req) {
    return this.userService.disableBusinessMode(req.user.userId);
  }

  // Live platform earning rate for the app's wallet/earnings UI. Declared BEFORE
  // the ':phoneNumber' catch-all so '/user/rate' isn't swallowed as a lookup.
  @Get('rate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the live platform per-second rate and revenue split' })
  async getRate() {
    const DEFAULT_RATE_PER_SECOND = 0.002;
    const DEFAULT_PLATFORM_CUT_RATE = 0.24;
    const rateSetting = await this.settingRepository.findOne({ where: { key: 'RATE_PER_SECOND' } });
    const cutSetting = await this.settingRepository.findOne({ where: { key: 'PLATFORM_CUT_RATE' } });
    const ratePerSecond = rateSetting ? parseFloat(rateSetting.value) || DEFAULT_RATE_PER_SECOND : DEFAULT_RATE_PER_SECOND;
    const platformCutRate = cutSetting ? parseFloat(cutSetting.value) || DEFAULT_PLATFORM_CUT_RATE : DEFAULT_PLATFORM_CUT_RATE;
    // Quoted to users as "earn N% of everything they make", so the app must be
    // able to read it rather than compile the figure into its copy.
    const referralSetting = await this.settingRepository.findOne({ where: { key: REFERRAL_RATE_KEY } });
    const referralCommissionRate = parseCommissionRate(referralSetting?.value);
    return { ratePerSecond, platformCutRate, userShare: 1 - platformCutRate, referralCommissionRate };
  }

  @Get(':phoneNumber')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find user by phone (caller-ID lookup, auth required)' })
  async findUser(@Param('phoneNumber') phoneNumber: string, @Request() req) {
    // Live platform rate — the same RATE_PER_SECOND setting billing uses — so
    // the ringing UI can show the caller's real per-second rate instead of a
    // stale client-side constant.
    const DEFAULT_RATE_PER_SECOND = 0.002;
    // These three depend only on the phone number, so they go out together.
    // Run one after another they stacked three round trips onto the ringing
    // overlay, which sits on "Looking up caller…" until this returns.
    const [rateSetting, user, callerIdentity] = await Promise.all([
      this.settingRepository.findOne({ where: { key: 'RATE_PER_SECOND' } }),
      this.userService.findOrCreatePlaceholder(phoneNumber),
      this.businessService.resolveCallerIdentity(phoneNumber),
    ]);
    const RATE_PER_SECOND = rateSetting ? parseFloat(rateSetting.value) || DEFAULT_RATE_PER_SECOND : DEFAULT_RATE_PER_SECOND;

    // Fall back to the user's own business profile when calling from an unregistered number
    const fallbackProfile = (!callerIdentity && user.isBusiness)
      ? await this.businessService.getProfileByUserId(user.id)
      : null;

    const effectivelyBusiness = user.isBusiness || !!callerIdentity;
    const resolvedProfile = callerIdentity?.businessProfile ?? fallbackProfile;

    // Whether the requesting user permits this caller — lets the incoming-call UI
    // auto-reject a disallowed business call before it rings. Personal callers
    // are always permitted (the business permission modes don't apply to them).
    const callerBusinessId = callerIdentity?.businessId ?? fallbackProfile?.id ?? null;
    const permittedForYou = !effectivelyBusiness
      ? true
      : await this.dataBrokerService.isBusinessCallerAllowed(req.user.userId, callerBusinessId);

    // Free-call whitelist: when the recipient granted this business a free-call
    // window, the business is NOT billed and the recipient earns nothing — the
    // incoming-call UI must say so instead of promising earnings. Keyed on the
    // RESOLVED business id: grants are stored per business, and a last-10
    // caller-ID lookup resolves to a placeholder user, never the owner.
    const freeCall = effectivelyBusiness
      ? await this.dataBrokerService.isFreeWhitelistedForBusiness(req.user.userId, callerBusinessId)
      : false;

    // A user is "registered" only after going through signup, which overwrites the
    // synthetic placeholder email/name. Numbers in a business directory also count.
    const isPlaceholderEmail = user.email === `${user.phoneNumber}@probo.local`;
    const isRegistered = (!isPlaceholderEmail && user.name !== 'Unknown') || !!callerIdentity;

    // Unknown to us — fall back to the external provider (Google Places) for a
    // public business name so the app shows something better than "Unknown". This
    // name is external data: flag it non-cacheable so the app shows it live but
    // never persists it (provider ToS). resolveExternalName honors suppression and
    // records the billable lookup; it fails soft (null) so it never blocks a ring.
    //
    // Two guards before we spend a billable lookup:
    //  1. Only for clients that advertise support (header) — older app builds can't
    //     honor cacheable:false, so they'd wrongly persist the external name.
    //  2. Per-user rate limit — an unknown looping caller can't rack up cost.
    const clientSupportsExternal = req.headers?.['x-supports-external-caller-name'] === '1';
    let name = resolvedProfile?.companyName || user.name;
    let externalName = false;
    if (
      !isRegistered &&
      clientSupportsExternal &&
      this.externalLookupLimiter.tryAcquire(String(req.user.userId))
    ) {
      const ext = await this.lookupService.resolveExternalName(phoneNumber).catch(() => null);
      if (ext) {
        name = ext;
        externalName = true;
      }
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      name,
      externalName,
      // External names must not be persisted by the client (provider ToS).
      cacheable: !externalName,
      isSpam: user.isSpam,
      isBusiness: effectivelyBusiness,
      isRegistered,
      // A free-whitelisted business needs no funds — the call bills nothing.
      // Otherwise check the wallet billing ACTUALLY debits: for a caller resolved
      // via a registered business number that's the business OWNER's wallet, not
      // the placeholder user auto-created for the raw number (always 0 — would
      // wrongly auto-reject every paid business ring).
      hasSufficientFunds: !effectivelyBusiness || freeCall || (
        (callerIdentity
          ? (await this.businessService.getOwnerWalletBalance(callerIdentity.businessId)) ?? Number(user.walletBalance)
          : Number(user.walletBalance)
        ) >= RATE_PER_SECOND
      ),
      permittedForYou,
      freeCall,
      // Only meaningful for business callers (the recipient earns per second).
      ratePerSecond: effectivelyBusiness ? RATE_PER_SECOND : null,
      ...(resolvedProfile && {
        businessProfile: resolvedProfile,
        numberPurpose: callerIdentity?.numberPurpose,
        numberPurposeLabel: callerIdentity?.numberPurposeLabel,
        numberLabel: callerIdentity?.numberLabel,
      }),
    };
  }
}
