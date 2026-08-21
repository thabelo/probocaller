import { getMetadataArgsStorage } from 'typeorm';
import { ProfileChangeLog } from './profile-change-log.entity';

const columns = () =>
  getMetadataArgsStorage().columns.filter((c) => c.target === ProfileChangeLog)
    .map((c) => c.propertyName);

describe('ProfileChangeLog', () => {
  it('is its own table', () => {
    expect(getMetadataArgsStorage().tables.find((t) => t.target === ProfileChangeLog)?.name)
      .toBe('profile_change_logs');
  });

  it('records whose profile, which field, and what it moved between', () => {
    expect(columns()).toEqual(
      expect.arrayContaining(['userId', 'fieldKey', 'oldValue', 'newValue', 'changeKind', 'changedAt']),
    );
  });

  /**
   * A user can edit their own profile and an admin can edit it for them. A
   * history that cannot tell those apart cannot answer the only question
   * anybody ever asks of it — "who changed this?"
   */
  it('records who made the change, separately from whose profile it is', () => {
    expect(columns()).toContain('actorUserId');
  });
});
