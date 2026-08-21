import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProfileHistoryService } from './profile-history.service';
import { ProfileChangeLog } from './profile-change-log.entity';
import { ProfileField } from './profile-field.entity';
import { resolveRange } from './profile-history.service';

/**
 * Reading a profile's history back.
 *
 * The log stores raw keys and codes because that is what the profile stores.
 * Nobody can read "income_range: 5k_10k to gt_40k" and see a pay rise, so the
 * whole job here is resolving those into the words the admin field editor
 * already defines.
 */
describe('ProfileHistoryService', () => {
  let service: ProfileHistoryService;
  let changeRepo: any;
  let fieldRepo: any;
  let query: jest.Mock;

  const FIELDS = [
    { key: 'income_range', label: 'Monthly Income Range', options: [
      { value: '5k_10k', label: 'R5,000 – R10,000' },
      { value: 'gt_40k', label: 'Over R40,000' },
    ] },
    { key: 'household_size', label: 'Household Size', type: 'number', options: [] },
    { key: 'has_medical_aid', label: 'Has Medical Aid', type: 'boolean', options: [] },
  ];

  const ROWS = [
    { id: 2, userId: 7, actorUserId: 7, fieldKey: 'income_range', oldValue: '5k_10k', newValue: 'gt_40k', changeKind: 'updated', changedAt: new Date('2026-03-02') },
    { id: 1, userId: 7, actorUserId: 7, fieldKey: 'household_size', oldValue: '2', newValue: '3', changeKind: 'updated', changedAt: new Date('2026-03-01') },
  ];

  beforeEach(async () => {
    changeRepo = { find: jest.fn().mockResolvedValue(ROWS), count: jest.fn().mockResolvedValue(2) };
    fieldRepo = { find: jest.fn().mockResolvedValue(FIELDS) };
    query = jest.fn().mockResolvedValue([
      { userId: 7, changes: 12, lastChangedAt: new Date('2026-03-02'), phoneNumber: '+27820000001', name: 'Thabo' },
      { userId: 9, changes: 5, lastChangedAt: new Date('2026-03-01'), phoneNumber: '+27820000002', name: null },
    ]);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileHistoryService,
        { provide: getRepositoryToken(ProfileChangeLog), useValue: changeRepo },
        { provide: getRepositoryToken(ProfileField), useValue: fieldRepo },
        { provide: DataSource, useValue: { query } },
      ],
    }).compile();
    service = mod.get(ProfileHistoryService);
  });

  describe('one person’s history', () => {
    it('reads newest first', async () => {
      const { changes } = await service.forUser(7);
      expect(changes.map((c: any) => c.fieldKey)).toEqual(['income_range', 'household_size']);
      expect(changeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { changedAt: 'DESC', id: 'DESC' } }),
      );
    });

    /** "income_range: 5k_10k → gt_40k" is not a sentence anybody can read. */
    it('resolves the field and its values into words', async () => {
      const { changes } = await service.forUser(7);
      expect(changes[0]).toMatchObject({
        fieldLabel: 'Monthly Income Range',
        oldLabel: 'R5,000 – R10,000',
        newLabel: 'Over R40,000',
      });
    });

    it('falls back to the raw value for a field with no options', async () => {
      const { changes } = await service.forUser(7);
      expect(changes[1]).toMatchObject({
        fieldLabel: 'Household Size', oldLabel: '2', newLabel: '3',
      });
    });

    it('says nothing rather than inventing a label for an empty side', async () => {
      changeRepo.find.mockResolvedValue([
        { ...ROWS[0], oldValue: null, changeKind: 'added' },
      ]);
      const { changes } = await service.forUser(7);
      expect(changes[0].oldLabel).toBeNull();
    });

    /** A field an admin deleted since must not break the history it appears in. */
    /**
     * A boolean field carries no options, so it fell through to the raw stored
     * value and a history read "Has Medical Aid: true". Nobody writes that.
     */
    it('reads a yes/no field as yes and no', async () => {
      changeRepo.find.mockResolvedValue([
        { ...ROWS[0], fieldKey: 'has_medical_aid', oldValue: 'false', newValue: 'true' },
      ]);
      const { changes } = await service.forUser(7);
      expect(changes[0]).toMatchObject({ oldLabel: 'No', newLabel: 'Yes' });
    });

    it('leaves a number alone, which already reads fine', async () => {
      const { changes } = await service.forUser(7);
      expect(changes[1]).toMatchObject({ oldLabel: '2', newLabel: '3' });
    });

    it('survives a field that no longer exists', async () => {
      changeRepo.find.mockResolvedValue([{ ...ROWS[0], fieldKey: 'retired_field' }]);
      const { changes } = await service.forUser(7);
      expect(changes[0].fieldLabel).toBe('retired_field');
    });

    it('scopes strictly to the user asked for', async () => {
      await service.forUser(7);
      expect(changeRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 7 } }),
      );
    });
  });

  describe('who has been most active', () => {
    it('ranks users by how many changes they made in the range', async () => {
      const from = new Date('2026-03-01');
      const to = new Date('2026-03-31');
      const { users } = await service.topMovers({ from, to });

      expect(users[0]).toMatchObject({ userId: 7, changes: 12 });
      expect(query.mock.calls[0][1]).toEqual(expect.arrayContaining([from, to]));
    });

    it('counts only changes inside the range', async () => {
      await service.topMovers({ from: new Date('2026-03-01'), to: new Date('2026-03-31') });
      const [sql] = query.mock.calls[0];
      expect(sql).toMatch(/"changedAt" >= \$1/);
      expect(sql).toMatch(/"changedAt" < \$2/);
    });

    it('names the person, so an admin is not looking at a list of ids', async () => {
      const { users } = await service.topMovers({ from: new Date(), to: new Date() });
      expect(users[0]).toHaveProperty('phoneNumber');
    });

    it('caps how many it returns', async () => {
      await service.topMovers({ from: new Date(), to: new Date(), limit: 5 });
      expect(query.mock.calls[0][1]).toContain(5);
    });

    it('refuses a range that runs backwards rather than returning nothing', async () => {
      await expect(
        service.topMovers({ from: new Date('2026-03-31'), to: new Date('2026-03-01') }),
      ).rejects.toThrow(/range/i);
    });
  });
});

/**
 * "By day, week, month, or a custom range" — rolling windows back from now,
 * because an admin asking "who changed something this week" means the last
 * seven days, not "since Monday", and the difference shows up every Monday
 * morning when the report suddenly looks empty.
 */
describe('resolveRange', () => {
  const now = new Date('2026-03-15T12:00:00Z');
  const days = (n: number) => n * 24 * 60 * 60 * 1000;

  it('reads a day as the last twenty-four hours', () => {
    const { from, to } = resolveRange({ period: 'day' }, now);
    expect(to).toEqual(now);
    expect(now.getTime() - from.getTime()).toBe(days(1));
  });

  it('reads a week as the last seven days', () => {
    const { from } = resolveRange({ period: 'week' }, now);
    expect(now.getTime() - from.getTime()).toBe(days(7));
  });

  it('reads a month as the last thirty days', () => {
    const { from } = resolveRange({ period: 'month' }, now);
    expect(now.getTime() - from.getTime()).toBe(days(30));
  });

  it('starts a custom range exactly where it was asked to', () => {
    const { from } = resolveRange(
      { period: 'custom', from: '2026-01-01', to: '2026-02-01' }, now,
    );
    expect(from.toISOString()).toBe(new Date('2026-01-01').toISOString());
  });

  /** A precise timestamp is already precise; only a bare date is widened. */
  it('leaves an explicit end timestamp alone', () => {
    const { to } = resolveRange(
      { period: 'custom', from: '2026-01-01', to: '2026-02-01T09:30:00.000Z' }, now,
    );
    expect(to.toISOString()).toBe('2026-02-01T09:30:00.000Z');
  });

  /**
   * A custom end date means the WHOLE of that day. Taking it literally puts
   * the boundary at midnight and silently drops everything that happened
   * during the last day the admin asked for.
   */
  it('includes the whole of a custom end date', () => {
    const { to } = resolveRange({ period: 'custom', from: '2026-01-01', to: '2026-01-31' }, now);
    expect(to.toISOString()).toBe(new Date('2026-02-01T00:00:00.000Z').toISOString());
  });

  it('defaults to a week when no period is given', () => {
    const { from } = resolveRange({}, now);
    expect(now.getTime() - from.getTime()).toBe(days(7));
  });

  it('refuses a custom range missing an end', () => {
    expect(() => resolveRange({ period: 'custom', from: '2026-01-01' }, now))
      .toThrow(/from and to/i);
  });

  it('refuses an unparseable date rather than silently reporting on now', () => {
    expect(() => resolveRange({ period: 'custom', from: 'yesterday', to: 'today' }, now))
      .toThrow(/date/i);
  });
});
