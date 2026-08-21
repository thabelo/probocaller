/**
 * What moved between two versions of someone's profile.
 *
 * Pure, so the history a person may one day ask us to explain is decided by a
 * table of cases rather than by whatever the save path happened to do.
 *
 * The awkward case, and the reason this is its own file: `updateMyProfile`
 * REPLACES `profile.data` wholesale, so a field the client stopped sending
 * looks exactly like one the person deliberately emptied. Both arrive as
 * absent. This treats both as CLEARED, which is the safer reading — recording
 * that something went away and being wrong is recoverable, silently dropping a
 * real erasure from the history is not.
 */
export type ChangeKind = 'added' | 'updated' | 'cleared';

export interface ProfileChange {
  fieldKey: string;
  /** Null when the field had no value before. */
  oldValue: string | null;
  /** Null when the field was emptied. */
  newValue: string | null;
  changeKind: ChangeKind;
}

/**
 * How a stored value is written down in the log.
 *
 * Everything becomes a string, because a profile field can hold a number, a
 * boolean, a code or a list, and a history that stored each in its own shape
 * would need the reader to know which. A multi-select is joined by comma and
 * SORTED, so re-picking the same interests in a different order is not a
 * change — the person did nothing.
 */
function write(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    const kept = value.filter((v) => v !== undefined && v !== null && v !== '');
    return kept.length ? [...kept].map(String).sort().join(', ') : null;
  }
  return String(value);
}

export function diffProfileData(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ProfileChange[] {
  const from = before ?? {};
  const to = after ?? {};

  // Sorted, so two saves of the same change produce identical rows and a
  // reader comparing them is not thrown by key order.
  const keys = [...new Set([...Object.keys(from), ...Object.keys(to)])].sort();

  const changes: ProfileChange[] = [];
  for (const fieldKey of keys) {
    const oldValue = write(from[fieldKey]);
    const newValue = write(to[fieldKey]);
    if (oldValue === newValue) continue;

    changes.push({
      fieldKey,
      oldValue,
      newValue,
      changeKind: oldValue === null ? 'added' : newValue === null ? 'cleared' : 'updated',
    });
  }
  return changes;
}
