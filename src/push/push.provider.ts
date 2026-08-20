import { Injectable, Logger } from '@nestjs/common';

export interface PushMessage {
  token: string;
  title: string;
  body: string;
  /** Routing payload the app reads on tap (kind, target, id…). */
  data?: Record<string, string>;
}

export interface PushResult {
  delivered: boolean;
  /**
   * Set only when the transport reports the token is PERMANENTLY dead (app
   * uninstalled, token revoked). PushService prunes those registrations; a
   * transient outage must never set this.
   */
  invalidToken?: boolean;
}

/**
 * Pluggable push transport. Same seam as TranscriptionProvider: the delivery
 * pipeline (registration, fan-out, pruning) is complete and tested, and the
 * concrete FCM transport drops in behind this interface once the Firebase
 * project and service-account credentials exist.
 */
export abstract class PushProvider {
  abstract send(message: PushMessage): Promise<PushResult>;
}

@Injectable()
export class NoopPushProvider extends PushProvider {
  private readonly logger = new Logger(NoopPushProvider.name);

  /**
   * No transport configured. Reports the push as NOT delivered rather than
   * pretending — a "delivered" here would make the send path look healthy while
   * no user ever receives a notification.
   *
   * Never sets invalidToken: a missing transport is a configuration gap, not a
   * dead handset, and pruning here would wipe every device registration.
   */
  async send(message: PushMessage): Promise<PushResult> {
    this.logger.debug(
      `push not sent (no provider configured): "${message.title}" -> ${message.token.slice(0, 12)}…`,
    );
    return { delivered: false };
  }
}
