import { Controller, Post, Body, Res, ForbiddenException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { Response } from 'express';
import { User } from '../user/user.entity';
import { phoneNumberVariants } from '../auth/phone-variants';
import { assertPasswordlessLoginAllowed } from '../common/auth/passwordless-login';
import { resolveAppConfig } from '../common/config/app-config';

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
 * Cookie-based admin auth. The admin panel logs in here; the JWT is delivered as
 * an HttpOnly cookie (never exposed to JS) and read back by the JwtStrategy's
 * cookie extractor. The mobile app keeps using bearer tokens via /user/login.
 *
 * Self-contained (signs its own token, reads the user repo directly) so it does
 * not pull in UserModule — which avoids a second UserService/JwtService instance.
 * Admin login does NOT auto-create users: only an existing admin can log in.
 */
@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin login — sets an HttpOnly session cookie' })
  async login(@Body() body: { phoneNumber: string }, @Res({ passthrough: true }) res: Response) {
    assertPasswordlessLoginAllowed(resolveAppConfig().environment);
    const phoneNumber = body?.phoneNumber?.trim();
    // Match the admin regardless of how the number was stored (national "0…" vs
    // international "+27…"), the same way /user/login resolves accounts (F4).
    const variants = phoneNumber ? phoneNumberVariants(phoneNumber) : [];
    const user = variants.length
      ? await this.userRepo.findOne({ where: { phoneNumber: In(variants) } })
      : null;
    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    const token = this.jwt.sign({ sub: user.id, phoneNumber: user.phoneNumber });
    res.cookie(ACCESS_COOKIE, token, cookieOptions());
    return { user: { id: user.id, phoneNumber: user.phoneNumber, name: user.name, role: user.role } };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Admin logout — clears the session cookie' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, cookieOptions());
    return { ok: true };
  }
}
