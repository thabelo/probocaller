/**
 * Statistical disclosure control for one survey question's answers.
 *
 * A business paid to hear how people answered. Respondents were promised that
 * a business never sees one person's answers on their own. Both are kept by
 * publishing a DISTRIBUTION and refusing to publish any slice of it small
 * enough to be a person — which is not the same as refusing to publish, and
 * the difference is most of this file.
 *
 * Three rules, applied in order:
 *
 *   1 PRIMARY        an option chosen by fewer than `minCell` people is held
 *                    back. Zero is never held back: it describes nobody.
 *   2 COMPLEMENTARY  because `answered` is published, a lone hidden cell is
 *                    plain subtraction. Keep hiding the smallest visible cell
 *                    until at least two are hidden AND they total at least
 *                    `minCell` between them — so subtraction yields a group,
 *                    not a person. Only for types where one respondent gives
 *                    exactly one answer.
 *   3 BAND OR HOLD   with fewer than two cells left to show, report quarters
 *                    instead of counts (needs `answered >= 4 * minCell`, so a
 *                    quarter is never smaller than a cell we would suppress),
 *                    or hold the question until more answers arrive.
 *
 * Pure and I/O-free on purpose: every rule above is a table row in the spec
 * beside it, and a rule that protects people should be testable without a
 * database.
 *
 * DELIBERATE CARVE-OUT, so nobody "fixes" it: `answered` is published exactly,
 * even below `minCell`, which makes the skip count on an optional question
 * derivable. Skipping is a participation behaviour, not an attribute — it
 * appears in no profile field, cannot be targeted on, and cannot be joined to
 * the leads API. These rules protect answer VALUES, which are joinable.
 */
export interface CellInput {
  value: string;
  label: string;
  count: number;
}

export interface ResultCell {
  value: string;
  label: string;
  count: number | null;
  percent: number | null;
  suppressed: boolean;
  band?: string;
}

export type DistributionState = 'shown' | 'partially_suppressed' | 'banded' | 'held';

export interface Distribution {
  cells: ResultCell[];
  state: DistributionState;
  heldReason?: string;
}

export interface SuppressOptions {
  minCell: number;
  answered: number;
  partitions: boolean;
}

/**
 * Which quarter a cell falls in. Only ever published when `answered` is at
 * least four times the minimum cell size, so every quarter spans at least
 * `minCell` people and no band can pin anyone.
 */
export function bandFor(count: number, answered: number): string {
  const ratio = answered > 0 ? count / answered : 0;
  if (ratio < 0.25) return 'under_a_quarter';
  if (ratio < 0.5) return 'quarter_to_half';
  if (ratio < 0.75) return 'half_to_three_quarters';
  return 'over_three_quarters';
}

const pct = (count: number, answered: number) =>
  answered > 0 ? Math.round((count / answered) * 1000) / 10 : 0;

export function suppressDistribution(
  cells: CellInput[],
  { minCell, answered, partitions }: SuppressOptions,
): Distribution {
  // Step 1 — PRIMARY. An option chosen by one to four people is those people,
  // not a statistic. A zero is never suppressed: a zero describes nobody, and
  // hiding it would stop a business telling "nobody chose this" — a real
  // finding it paid for — from "four people did".
  const hidden = new Set<number>();
  cells.forEach((c, i) => {
    if (c.count > 0 && c.count < minCell) hidden.add(i);
  });

  // Step 2 — COMPLEMENTARY. `answered` is published alongside the cells, so a
  // lone suppressed cell is recoverable by subtracting the visible ones: the
  // rule would hide a label and publish the number anyway. Suppress the
  // smallest still-visible non-zero cell until at least two cells are hidden.
  //
  // Only for types whose options PARTITION the respondents — one answer each.
  // A multi-select carries no such additive constraint, so there is nothing to
  // invert and nothing to defend against here.
  if (partitions && hidden.size > 0) {
    const candidates = () =>
      cells
        .map((c, i) => ({ i, count: c.count }))
        .filter(({ i, count }) => !hidden.has(i) && count > 0)
        .sort((a, b) => a.count - b.count);

    // Two hidden cells are not enough on their own. 30 answered with 14 + 14
    // shown and two hidden means the pair totals 2, so each is exactly 1 — the
    // count condition was met and two individuals were still pinned. The
    // MASS behind the suppression has to clear the minimum too, so that what
    // subtraction yields is a group rather than a person.
    const mass = () => [...hidden].reduce((sum, i) => sum + cells[i].count, 0);

    while (hidden.size < 2 || mass() < minCell) {
      const next = candidates()[0];
      if (!next) break;
      hidden.add(next.i);
    }
  }

  // Step 3 — BAND. With fewer than two cells left to show, the question cannot
  // be reported exactly, and reporting nothing is its own failure: a business
  // paid for these answers. Bands say something true and useful about a
  // near-unanimous result without pinning the few who differed.
  //
  // EVERY cell is banded, never some banded and some exact — an exact count
  // sitting beside a band would narrow the band by subtraction, which is the
  // whole attack this step exists to prevent.
  const visible = cells.filter((_, i) => !hidden.has(i)).length;
  if (partitions && hidden.size > 0 && visible < 2) {
    // Below four times the minimum, a quarter is itself smaller than a cell we
    // would refuse to show, so a band would leak what the counts were hidden
    // for. Hold the question instead — it opens up on its own as answers come
    // in, which is why nothing here says "unavailable".
    if (answered < 4 * minCell) {
      return { state: 'held', cells: [], heldReason: 'too_few_in_one_group' };
    }
    return {
      state: 'banded',
      cells: cells.map((c) => ({
        value: c.value,
        label: c.label,
        count: null,
        percent: null,
        suppressed: true,
        band: bandFor(c.count, answered),
      })),
    };
  }

  const out = cells.map((c, i) =>
    hidden.has(i)
      ? { value: c.value, label: c.label, count: null, percent: null, suppressed: true, band: '<5' }
      : { value: c.value, label: c.label, count: c.count, percent: pct(c.count, answered), suppressed: false },
  );

  return { cells: out, state: hidden.size ? 'partially_suppressed' : 'shown' };
}
