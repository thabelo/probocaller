import { Controller, Post, Body, Req, Res, UnauthorizedException, ForbiddenException, NotFoundException, HttpCode, Logger, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Response } from 'express';
import { User } from '../user/user.entity';
import { Business } from '../business/business.entity';
import { phoneNumberVariants, toE164 } from './phone-variants';

const ACCESS_COOKIE = 'accessToken';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SEVEN_DAYS_MS,
  };
}

/**
 * Cookie-based login for ANY existing user (business owners + admins), used by
 * the web app so non-admins can reach their self-service dashboard and manage
 * their own API keys. Mirrors AdminAuthController's cookie scheme (same
 * HttpOnly `accessToken` cookie the JwtStrategy reads) but without the
 * admin-role gate. Does NOT auto-create users; deactivated accounts are refused.
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Impersonation');

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Login (any user) — sets an HttpOnly session cookie' })
  async login(@Body() body: { phoneNumber: string }, @Res({ passthrough: true }) res: Response) {
    const phoneNumber = body?.phoneNumber?.trim();
    // Match the account whether it was stored national (0XX…) or international
    // (+27XX…) — the mobile app and admin panel send different formats.
    const variants = phoneNumberVariants(phoneNumber);
    const user = variants.length
      ? await this.userRepo.findOne({ where: { phoneNumber: In(variants) } })
      : null;
    if (!user) throw new UnauthorizedException('No account found for that number');
    if (user.deactivatedAt) throw new UnauthorizedException('Account deactivated');
    const token = this.jwt.sign({ sub: user.id, phoneNumber: user.phoneNumber });
    res.cookie(ACCESS_COOKIE, token, cookieOptions());
    return { user: { id: user.id, phoneNumber: toE164(user.phoneNumber), name: user.name, role: user.role, isBusiness: !!user.isBusiness } };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Logout — clears the session cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, cookieOptions());
    return { ok: true };
  }

  /**
   * Admin "view as business": an admin swaps their session for the owner of the
   * chosen business. The minted token carries `imp` (the admin's id) so the
   * session is clearly an impersonation and can be exited. Admin-only + audited.
   */
  @Post('impersonate')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Admin: view as a business (impersonate its owner)' })
  async impersonate(@Req() req: any, @Body() body: { businessId: number }, @Res({ passthrough: true }) res: Response) {
    const caller = await this.userRepo.findOne({ where: { id: req.user.userId } });
    if (!caller || caller.role !== 'admin') throw new ForbiddenException('Admin access required');

    const business = await this.businessRepo.findOne({ where: { id: body?.businessId } });
    if (!business) throw new NotFoundException('Business not found');
    const owner = await this.userRepo.findOne({ where: { id: business.userId } });
    if (!owner) throw new NotFoundException('Business has no owner account');

    const token = this.jwt.sign({ sub: owner.id, phoneNumber: owner.phoneNumber, imp: caller.id });
    res.cookie(ACCESS_COOKIE, token, cookieOptions());
    this.logger.warn(`admin ${caller.id} now viewing as business ${business.id} (owner ${owner.id})`);
    return {
      user: { id: owner.id, phoneNumber: toE164(owner.phoneNumber), name: owner.name, role: owner.role, isBusiness: !!owner.isBusiness },
      viewingAs: { businessId: business.id, companyName: business.companyName },
    };
  }

  @Post('impersonate/exit')
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Exit a view-as session, restoring the admin' })
  async exitImpersonation(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const adminId = req.user?.impersonatorId;
    if (!adminId) throw new ForbiddenException('Not an impersonation session');
    const admin = await this.userRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new UnauthorizedException('Impersonating admin no longer exists');
    const token = this.jwt.sign({ sub: admin.id, phoneNumber: admin.phoneNumber });
    res.cookie(ACCESS_COOKIE, token, cookieOptions());
    this.logger.warn(`admin ${admin.id} exited view-as`);
    return { user: { id: admin.id, phoneNumber: toE164(admin.phoneNumber), name: admin.name, role: admin.role, isBusiness: !!admin.isBusiness } };
  }
}
