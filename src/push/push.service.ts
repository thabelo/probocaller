import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken, DevicePlatform } from './device-token.entity';
import { PushProvider } from './push.provider';

export interface PushPayload {
  title: string;
  body: string;
  /** Routing payload the app reads on tap (kind, target, id…). */
  data?: Record<string, string>;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
    private readonly provider: PushProvider,
  ) {}

  /**
   * Register (or re-register) a device for a user.
   *
   * Idempotent by token: the app re-registers on every start and after every
   * token refresh, so inserting a row each time would fan a single push out
   * into hundreds of sends. A token already held by ANOTHER user is reassigned
   * rather than duplicated — the token identifies a handset, and pushes must
   * follow the account that registered it last.
   */
  async registerDevice(userId: number, token: string, platform: DevicePlatform = 'android') {
    const value = (token ?? '').trim();
    if (!value) throw new BadRequestException('A device token is required');

    const existing = await this.tokenRepo.findOne({ where: { token: value } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      return this.tokenRepo.save(existing);
    }
    return this.tokenRepo.save(this.tokenRepo.create({ userId, token: value, platform }));
  }

  /** Drop a device registration — a signed-out device must stop receiving pushes. */
  async unregisterDevice(userId: number, token: string) {
    return this.tokenRepo.delete({ userId, token: (token ?? '').trim() });
  }

  /**
   * Push to every device a user has registered.
   *
   * Never throws. Push is a side effect of things like "you got paid", and a
   * dead token or a provider outage must not fail the money path that triggered
   * it — failures are counted and returned instead.
   *
   * Tokens the provider reports as PERMANENTLY invalid are pruned; otherwise
   * every future send wastes a call and the failure count never recovers.
   */
  async sendToUser(userId: number, payload: PushPayload): Promise<{ sent: number; failed: number }> {
    const devices = await this.tokenRepo.find({ where: { userId } });
    let sent = 0;
    let failed = 0;

    for (const device of devices) {
      try {
        const result = await this.provider.send({
          token: device.token,
          title: payload.title,
          body: payload.body,
          data: payload.data,
        });
        if (result?.delivered) sent += 1;
        else failed += 1;
        if (result?.invalidToken) {
          await this.tokenRepo.delete({ token: device.token });
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(`push to device ${device.token.slice(0, 12)}… failed: ${error}`);
      }
    }

    return { sent, failed };
  }
}
