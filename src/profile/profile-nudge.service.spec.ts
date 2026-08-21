import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProfileNudgeService } from './profile-nudge.service';
import { UserProfile } from './user-profile.entity';
import { User } from '../user/user.entity';
import { PushService } from '../push/push.service';
import { SettingsReaderService } from '../config/settings-reader.service';

/**
 * Asking people whether anything has changed.
 *
 * A stale profile is matched to fewer surveys and worse offers, so asking is
 * in their interest too — but only while it stays a question. Everything here
 * is about not becoming nagging.
 */
describe('ProfileNudgeService', () => {
  let service: ProfileNudgeService;
  let profileRepo: any;
  let userRepo: any;
  let push: any;
  let query: jest.Mock;

  const STALE = (over: Record<string, any> = {}) => ({
    userId: 7,
    lastChangedAt: new Date('2025-01-01'),
    lastAskedAt: null,
    filledFields: 6,
    ...over,
  });

  const build = async (rows = [STALE()], settings: Record<string, number> = {}) => {
    query = jest.fn().mockResolvedValue(rows);
    profileRepo = { save: jest.fn(async (p: any) => p), findOne: jest.fn() };
    userRepo = {
      find: jest.fn(async () => [{ id: 7, notifications: [] }]),
      save: jest.fn(async (u: any) => u),
    };
    push = { sendToUser: jest.fn().mockResolvedValue({ sent: 1, failed: 0 }) };

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileNudgeService,
        { provide: getRepositoryToken(UserProfile), useValue: profileRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: PushService, useValue: push },
        {
          provide: SettingsReaderService,
          useValue: { getNumber: jest.fn(async (k: string) => {
            if (k in settings) return settings[k];
            throw new Error(`unset: ${k}`);
          }) },
        },
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = mod.get(ProfileNudgeService);
    return service;
  };

  it('asks a stale profile whether anything has changed', async () => {
    await build();
    const asked = await service.sweep(new Date('2026-06-01'));

    expect(asked).toBe(1);
    expect(push.sendToUser).toHaveBeenCalledWith(7, expect.objectContaining({
      data: expect.objectContaining({ kind: 'profile-stale' }),
    }));
  });

  /** The reason, in the person's terms — not "your data is stale". */
  it('says why it is worth their while', async () => {
    await build();
    await service.sweep(new Date('2026-06-01'));
    const [, payload] = push.sendToUser.mock.calls[0];
    expect(`${payload.title} ${payload.body}`).toMatch(/survey|offer|match/i);
  });

  it('leaves a notification in the tray as well as sending a push', async () => {
    await build();
    await service.sweep(new Date('2026-06-01'));
    const [saved] = userRepo.save.mock.calls[0];
    expect(saved.notifications.at(-1)).toMatchObject({ kind: 'profile-stale' });
  });

  /** The cooldown only works if we write down that we asked. */
  it('records that it asked, so the cooldown can hold', async () => {
    await build();
    await service.sweep(new Date('2026-06-01'));
    expect(profileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, stalePromptedAt: new Date('2026-06-01') }),
    );
  });

  it('asks nobody when nobody is stale', async () => {
    await build([STALE({ lastChangedAt: new Date('2026-05-30') })]);
    expect(await service.sweep(new Date('2026-06-01'))).toBe(0);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('never asks an empty profile whether anything CHANGED', async () => {
    await build([STALE({ filledFields: 0, lastChangedAt: null })]);
    expect(await service.sweep(new Date('2026-06-01'))).toBe(0);
  });

  it('caps how many it asks in one run', async () => {
    const many = Array.from({ length: 50 }, (_, i) => STALE({ userId: i + 1 }));
    await build(many, { PROFILE_NUDGE_BATCH: 5 });
    expect(await service.sweep(new Date('2026-06-01'))).toBe(5);
  });

  /**
   * One person's push failing must not stop everyone else being asked, and
   * must not leave the sweep half-done for the rest of the day.
   */
  it('carries on when one person cannot be reached', async () => {
    await build([STALE({ userId: 1 }), STALE({ userId: 2 })]);
    push.sendToUser.mockRejectedValueOnce(new Error('no device'));
    expect(await service.sweep(new Date('2026-06-01'))).toBe(2);
  });

  /**
   * COLD START. The change log begins empty, so on the first deploy every
   * profile ever filled in looks like it has never been touched — and the
   * whole user base would be messaged over the following weeks for no reason
   * at all. The profile's own lastUpdated is what we knew before the log
   * existed, so it stands in until there is a real change to read.
   */
  it('does not treat a profile as ancient just because the log is new', async () => {
    await build([STALE({ lastChangedAt: null, filledFields: 6 })]);
    await service.sweep(new Date('2026-06-01'));
    // The query must offer lastUpdated as the fallback, not leave it null.
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(/coalesce\(\s*max\(c\."changedAt"\)\s*,\s*p\."lastUpdated"/i);
  });

  it('can be switched off entirely', async () => {
    await build([STALE()], { PROFILE_STALE_AFTER_DAYS: 0 });
    expect(await service.sweep(new Date('2026-06-01'))).toBe(0);
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('does not run its timer in tests', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  /**
   * The report shows who is most ACTIVE. The opposite list is the actionable
   * one: who has gone quiet, how long for, and whether we have already asked.
   * That is the population the sweep is working through, and without this an
   * admin cannot see it at all.
   */
  describe('listing who has gone quiet', () => {
    it('names the people whose profile has gone stale', async () => {
      await build([STALE({ userId: 7 })]);
      const { users } = await service.listStale(new Date('2026-06-01'));

      expect(users[0]).toMatchObject({ userId: 7, daysSinceChange: expect.any(Number) });
    });

    it('says how long each has been quiet', async () => {
      // 91, not 90: exactly the threshold is deliberately NOT yet stale, so a
      // fixture on the boundary tests the boundary rather than the count.
      await build([STALE({ userId: 7, lastChangedAt: new Date('2026-03-02') })]);
      const { users } = await service.listStale(new Date('2026-06-01'));
      expect(users[0].daysSinceChange).toBe(91);
    });

    /** An admin looking at the list needs to know it is already being handled. */
    it('says whether we have already asked, and when', async () => {
      const asked = new Date('2026-05-20');
      await build([STALE({ userId: 7, lastAskedAt: asked })]);
      const { users } = await service.listStale(new Date('2026-06-01'));
      expect(users[0].lastAskedAt).toEqual(asked);
    });

    /**
     * The LIST is not the sweep. Somebody inside the cooldown is still stale
     * and an admin should see them — hiding them would make the list disagree
     * with itself the day after a sweep ran.
     */
    it('includes somebody who is stale but inside the cooldown', async () => {
      await build([STALE({ userId: 7, lastAskedAt: new Date('2026-05-30') })]);
      const { users } = await service.listStale(new Date('2026-06-01'));
      expect(users.map((u: any) => u.userId)).toEqual([7]);
    });

    it('reports the rule it applied, so the number is explicable', async () => {
      await build([STALE()]);
      const out = await service.listStale(new Date('2026-06-01'));
      expect(out.staleAfterDays).toBe(90);
    });

    it('puts the longest-neglected first', async () => {
      await build([
        STALE({ userId: 1, lastChangedAt: new Date('2026-01-01') }),
        STALE({ userId: 2, lastChangedAt: new Date('2024-01-01') }),
      ]);
      const { users } = await service.listStale(new Date('2026-06-01'));
      expect(users.map((u: any) => u.userId)).toEqual([2, 1]);
    });

    it('never lists an empty profile as stale', async () => {
      await build([STALE({ filledFields: 0 })]);
      const { users } = await service.listStale(new Date('2026-06-01'));
      expect(users).toEqual([]);
    });
  });
});
