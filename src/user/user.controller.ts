import { Controller, Post, Get, Put, Delete, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserService } from './user.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { AddCreditDto } from './dto/add-credit.dto';
import { AddContactsDto } from './dto/add-contacts.dto';
import { AuthGuard } from '@nestjs/passport';
import { BusinessService } from '../business/business.service';
import { TransactionService } from '../transaction/transaction.service';
import { DataBrokerService } from '../data-broker/data-broker.service';
import { LookupService } from '../lookup/lookup.service';

@ApiTags('users')
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly businessService: BusinessService,
    private readonly transactionService: TransactionService,
    private readonly dataBrokerService: DataBrokerService,
    private readonly lookupService: LookupService,
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

  @Get(':phoneNumber')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Find user by phone (caller-ID lookup, auth required)' })
  async findUser(@Param('phoneNumber') phoneNumber: string, @Request() req) {
    const RATE_PER_SECOND = 0.002;
    const user = await this.userService.findOrCreatePlaceholder(phoneNumber);
    const callerIdentity = await this.businessService.resolveCallerIdentity(phoneNumber);

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

    // A user is "registered" only after going through signup, which overwrites the
    // synthetic placeholder email/name. Numbers in a business directory also count.
    const isPlaceholderEmail = user.email === `${user.phoneNumber}@probo.local`;
    const isRegistered = (!isPlaceholderEmail && user.name !== 'Unknown') || !!callerIdentity;

    // Unknown to us — fall back to the external provider (Google Places) for a
    // public business name so the app shows something better than "Unknown". This
    // name is external data: flag it non-cacheable so the app shows it live but
    // never persists it (provider ToS). resolveExternalName honors suppression and
    // records the billable lookup; it fails soft (null) so it never blocks a ring.
    let name = resolvedProfile?.companyName || user.name;
    let externalName = false;
    if (!isRegistered) {
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
      hasSufficientFunds: !effectivelyBusiness || Number(user.walletBalance) >= RATE_PER_SECOND,
      permittedForYou,
      ...(resolvedProfile && {
        businessProfile: resolvedProfile,
        numberPurpose: callerIdentity?.numberPurpose,
        numberPurposeLabel: callerIdentity?.numberPurposeLabel,
        numberLabel: callerIdentity?.numberLabel,
      }),
    };
  }
}
