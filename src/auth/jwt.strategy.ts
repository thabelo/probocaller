import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';

/**
 * Reads JWT_SECRET freshly each construction (rather than at module load) so the
 * value is always consistent with the current environment — and so tests can
 * exercise missing/empty cases. The historical fallback to a literal string
 * `'probocaller-secret-key'` has been removed; with that fallback in place, any
 * future code path that bypassed the `requireEnv` in `app.module.ts` would have
 * silently used a publicly-known secret, letting an attacker mint admin JWTs.
 */
function readJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET is missing or empty. Refusing to start the JWT strategy with an insecure default. ' +
      'Set JWT_SECRET in the environment (≥32 chars, generate with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))").',
    );
  }
  return secret;
}

/**
 * Pull the JWT from an HttpOnly `accessToken` cookie. Used by the admin panel,
 * which holds its token in a cookie rather than JS-readable storage. Parses the
 * raw Cookie header directly so no cookie-parser middleware is required.
 */
export function cookieAccessTokenExtractor(req: any): string | null {
  const header = req?.headers?.cookie;
  if (!header || typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === 'accessToken') return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieAccessTokenExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: readJwtSecret(),
    });
  }

  async validate(payload: any) {
    if (!payload.sub) throw new UnauthorizedException();
    // Cheap projected lookup — id + deactivatedAt only. Blocks a leaked or
    // long-lived token from a soft-deleted account from continuing to auth.
    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'deactivatedAt'],
    });
    if (!user) throw new UnauthorizedException();
    if (user.deactivatedAt) throw new UnauthorizedException('Account deactivated');
    // `imp` is set only on admin "view as business" sessions — carry it so the
    // session knows who to restore on exit and can render the view-as banner.
    return { userId: payload.sub, phoneNumber: payload.phoneNumber, impersonatorId: payload.imp ?? null };
  }
}
