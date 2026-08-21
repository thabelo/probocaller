import { diffProfileData } from './profile-diff';

/**
 * What changed between two versions of a profile.
 *
 * `updateMyProfile` REPLACES `profile.data` wholesale, so a field the client
 * simply stopped sending is indistinguishable from one the person cleared —
 * both arrive as absent. That is the single most important thing this function
 * has to get right, because "cleared" and "never mentioned" mean very
 * different things in a history somebody may be asked to explain.
 */
describe('diffProfileData', () => {
  it('sees nothing when nothing moved', () => {
    expect(diffProfileData({ province: 'gp' }, { province: 'gp' })).toEqual([]);
  });

  it('records a field being answered for the first time', () => {
    expect(diffProfileData({}, { household_size: 2 })).toEqual([
      { fieldKey: 'household_size', oldValue: null, newValue: '2', changeKind: 'added' },
    ]);
  });

  /** The example that started this: the family grows by one. */
  it('records a value moving', () => {
    expect(diffProfileData({ household_size: 2 }, { household_size: 3 })).toEqual([
      { fieldKey: 'household_size', oldValue: '2', newValue: '3', changeKind: 'updated' },
    ]);
  });

  it('records a field being emptied', () => {
    expect(diffProfileData({ income_range: 'gt_40k' }, { income_range: '' })).toEqual([
      { fieldKey: 'income_range', oldValue: 'gt_40k', newValue: null, changeKind: 'cleared' },
    ]);
  });

  it('treats a field that disappeared entirely as cleared', () => {
    expect(diffProfileData({ province: 'gp' }, {})).toEqual([
      { fieldKey: 'province', oldValue: 'gp', newValue: null, changeKind: 'cleared' },
    ]);
  });

  it('reports several changes in one save', () => {
    const changes = diffProfileData(
      { household_size: 2, income_range: 'lt_5k', province: 'gp' },
      { household_size: 3, income_range: 'gt_40k', province: 'gp' },
    );
    expect(changes.map((c) => c.fieldKey).sort()).toEqual(['household_size', 'income_range']);
  });

  it('does not mistake a number for the string of it', () => {
    expect(diffProfileData({ household_size: 3 }, { household_size: '3' })).toEqual([]);
  });

  it('does not mistake a boolean for its label', () => {
    expect(diffProfileData({ homeowner: true }, { homeowner: true })).toEqual([]);
    expect(diffProfileData({ homeowner: true }, { homeowner: false })).toEqual([
      { fieldKey: 'homeowner', oldValue: 'true', newValue: 'false', changeKind: 'updated' },
    ]);
  });

  /** Interests is multi-select; reordering the same picks is not a change. */
  it('ignores a reordered multi-select', () => {
    expect(diffProfileData(
      { interests: ['health', 'telecoms'] },
      { interests: ['telecoms', 'health'] },
    )).toEqual([]);
  });

  it('records a multi-select gaining a value', () => {
    const [change] = diffProfileData({ interests: ['health'] }, { interests: ['health', 'motoring'] });
    expect(change).toMatchObject({ fieldKey: 'interests', changeKind: 'updated' });
    expect(change.newValue).toContain('motoring');
  });

  it('treats an emptied multi-select as cleared', () => {
    expect(diffProfileData({ interests: ['health'] }, { interests: [] })).toEqual([
      { fieldKey: 'interests', oldValue: 'health', newValue: null, changeKind: 'cleared' },
    ]);
  });

  it('survives a missing or malformed side', () => {
    expect(diffProfileData(null as any, null as any)).toEqual([]);
    expect(diffProfileData(undefined as any, { province: 'gp' })).toEqual([
      { fieldKey: 'province', oldValue: null, newValue: 'gp', changeKind: 'added' },
    ]);
  });

  it('lists changes in a stable order, so two saves are comparable', () => {
    const changes = diffProfileData({}, { province: 'gp', age_range: '25_34', household_size: 1 });
    expect(changes.map((c) => c.fieldKey)).toEqual(['age_range', 'household_size', 'province']);
  });
});
