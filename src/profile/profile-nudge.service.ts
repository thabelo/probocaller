import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { UserProfile } from './user-profile.entity';
import { User } from '../user/user.entity';
import { PushService } from '../push/push.service';
import { SettingsReaderService } from '../config/settings-reader.service';
import { ProfileActivity, staleUsers } from './profile-staleness';

/** Once a day. A nudge nobody sees twice does not need to run more often. */
const SWEEP_MS = 24 * 60 * 60 * 1000;

const DEFAULTS = {
  PROFILE_STALE_AFTER_DAYS: 90,
  PROFILE_NUDGE_COOLDOWN_DAYS: 30,
  PROFILE_NUDGE_BATCH: 200,
};

/**
 * Ask people whose profile has gone quiet whether anything has changed.
 *
 * The reason is theirs, not ours: a profile that has not moved in months is
 * matched to fewer surveys and worse offers, and the person has no way of
 * knowing that. Saying so plainly is the difference between a useful prompt
 * and marketing.
 *
 * Three things keep it a nudge rather than nagging, and none of them are
 * optional:
 *   - a COOLDOWN, so somebody who ignores it is not asked again next week;
 *   - a BATCH cap, so a backlog is worked through gradually instead of
 *     messaging the entire user base the first time this ships;
 *   - and it asks nothing of anyone. Nobody is gated, charged or downgraded
 *     for leaving a profile alone.
 *
 * It deliberately does NOT ask an empty profile whether anything has changed.
 * Somebody who never filled one in has not gone stale, they never started, and
 * that needs different words — an onboarding problem, not this one.
 */
@Injectable()
export class ProfileNudgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProfileNudgeService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly push: PushService,
    private readonly settingsReader: SettingsReaderService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    // Don't spin a timer in tests; unit tests call sweep directly.
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.sweep().catch((error) =>
        this.logger.error('Scheduled profile-staleness sweep failed', error as Error),
      );
    }, SWEEP_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async setting(key: keyof typeof DEFAULTS): Promise<number> {
    try {
      const value = await this.settingsReader.getNumber(key);
      return Number.isFinite(value) && value >= 0 ? value : DEFAULTS[key];
    } catch {
      return DEFAULTS[key];
    }
  }

  /** Ask everyone due. Returns how many were asked. */
  async sweep(now: Date = new Date()): Promise<number> {
    const [staleAfterDays, cooldownDays, batch] = await Promise.all([
      this.setting('PROFILE_STALE_AFTER_DAYS'),
      this.setting('PROFILE_NUDGE_COOLDOWN_DAYS'),
      this.setting('PROFILE_NUDGE_BATCH'),
    ]);
    if (!staleAfterDays) return 0;

    const due = staleUsers(await this.activity(), { staleAfterDays, cooldownDays }, now)
      .slice(0, batch);
    if (!due.length) return 0;

    const users = await this.userRepo.find({ where: { id: In(due.map((d) => d.userId)) } });
    const byId = new Map(users.map((u) => [u.id, u]));

    for (const person of due) {
      // One unreachable handset must not stop everybody else being asked, or
      // the sweep is half-done until tomorrow.
      await this.ask(byId.get(person.userId), person.userId, now).catch((error) =>
        this.logger.warn(`Could not ask user ${person.userId}: ${(error as Error).message}`),
      );
    }

    this.logger.log(`Asked ${due.length} people whether their profile had changed`);
    return due.length;
  }

  /**
   * Who has gone quiet, for an admin to look at.
   *
   * The report elsewhere ranks who is most ACTIVE; this is the opposite list
   * and the more actionable one — it is the population the sweep is working
   * through, and without it an admin can see the nudge going out but not who
   * it is going to.
   *
   * NOT the sweep. Somebody inside the cooldown is still stale and still
   * appears here; hiding them would make the list disagree with itself the day
   * after a sweep ran. The cooldown decides who gets ASKED, not who IS stale.
   */
  async listStale(now: Date = new Date()) {
    const staleAfterDays = await this.setting('PROFILE_STALE_AFTER_DAYS');
    const activity = await this.activity();

    // cooldown 0: the list is everybody stale, not everybody due a message.
    const stale = staleUsers(activity, { staleAfterDays, cooldownDays: 0 }, now);
    const askedByUser = new Map(activity.map((a) => [a.userId, a.lastAskedAt]));

    const users = await this.userRepo.find({ where: { id: In(stale.map((s) => s.userId)) } });
    const byId = new Map(users.map((u) => [u.id, u]));

    return {
      staleAfterDays,
      users: stale.map((person) => ({
        userId: person.userId,
        daysSinceChange: person.daysSinceChange,
        lastAskedAt: askedByUser.get(person.userId) ?? null,
        phoneNumber: byId.get(person.userId)?.phoneNumber ?? null,
        name: byId.get(person.userId)?.name ?? null,
      })),
    };
  }

  private async ask(user: User | undefined, userId: number, now: Date): Promise<void> {
    const title = 'Anything changed?';
    const body =
      'If your details have moved on — a new job, a bigger household, a different income — '
      + 'update your profile so the surveys and offers you see actually fit.';

    await this.push
      .sendToUser(userId, { title, body, data: { kind: 'profile-stale' } })
      .catch(() => undefined);

    // The tray row is what actually reaches a handset today: push has no live
    // transport yet and the app polls this list.
    if (user) {
      const notifications = user.notifications || [];
      notifications.push({
        id: now.getTime(),
        message: `${title} ${body}`,
        timestamp: now,
        read: false,
        kind: 'profile-stale',
      } as any);
      user.notifications = notifications;
      await this.userRepo.save(user).catch(() => undefined);
    }

    // Stamped even if the push failed. Retrying a broken handset every day is
    // how a nudge turns into nagging for everyone whose device is quiet.
    await this.profileRepo.save({ userId, stalePromptedAt: now } as any);
  }

  /**
   * Last change, last ask, and how much is filled in — for everybody at once.
   *
   * One grouped query rather than a per-user round trip: this runs across the
   * whole user base, and the version that loads each profile in turn gets
   * slower exactly as the platform grows.
   */
  private activity(): Promise<ProfileActivity[]> {
    return this.dataSource.query(
      `SELECT p."userId"                                   AS "userId",
              -- COLD START: the change log begins empty, so without a
              -- fallback every profile ever filled in looks untouched
              -- forever and the whole user base gets messaged for no
              -- reason. lastUpdated is what we knew before the log existed.
              COALESCE(MAX(c."changedAt"), p."lastUpdated")  AS "lastChangedAt",
              p."stalePromptedAt"                          AS "lastAskedAt",
              (SELECT COUNT(*) FROM jsonb_each(
                 CASE WHEN jsonb_typeof(p."data"::jsonb) = 'object'
                      THEN p."data"::jsonb ELSE '{}'::jsonb END))::int AS "filledFields"
         FROM user_profiles p
         LEFT JOIN profile_change_logs c ON c."userId" = p."userId"
        GROUP BY p."userId", p."stalePromptedAt", p."data", p."lastUpdated"`,
    );
  }
}
