import { suppressDistribution } from './survey-results.suppression';

const cell = (value: string, count: number) => ({ value, label: value, count });

describe('suppressDistribution', () => {
  it('shows every cell when each is at or above the minimum', () => {
    const { cells, state } = suppressDistribution(
      [cell('yes', 14), cell('no', 6)],
      { minCell: 5, answered: 20, partitions: true },
    );
    expect(state).toBe('shown');
    expect(cells).toEqual([
      { value: 'yes', label: 'yes', count: 14, percent: 70, suppressed: false },
      { value: 'no', label: 'no', count: 6, percent: 30, suppressed: false },
    ]);
  });

  it('hides a cell of one to four and reports it as under five', () => {
    const { cells, state } = suppressDistribution(
      [cell('Sandton', 12), cell('Randburg', 10), cell('Soweto', 4), cell('Midrand', 4)],
      { minCell: 5, answered: 30, partitions: true },
    );
    expect(state).toBe('partially_suppressed');
    expect(cells[2]).toEqual({
      value: 'Soweto', label: 'Soweto', count: null, percent: null,
      suppressed: true, band: '<5',
    });
    expect(cells[3].suppressed).toBe(true);
    expect(cells[0].count).toBe(12);
    expect(cells[1].count).toBe(10);
  });

  it('shows a zero cell, because a zero describes nobody', () => {
    const { cells } = suppressDistribution(
      [cell('Sandton', 12), cell('Randburg', 10), cell('Soweto', 8), cell('Midrand', 0)],
      { minCell: 5, answered: 30, partitions: true },
    );
    expect(cells[3]).toEqual({
      value: 'Midrand', label: 'Midrand', count: 0, percent: 0, suppressed: false,
    });
  });

  /**
   * `answered` is published, so a lone suppressed cell is just subtraction:
   * 30 answered, 12 + 10 + 4 shown, one hidden — the hidden cell is 4, and the
   * whole rule has bought nothing.
   */
  it('never leaves a single suppressed cell recoverable by subtraction', () => {
    const { cells } = suppressDistribution(
      [cell('Sandton', 12), cell('Randburg', 10), cell('Soweto', 6), cell('Midrand', 2)],
      { minCell: 5, answered: 30, partitions: true },
    );
    expect(cells.filter((c) => c.suppressed).length).toBeGreaterThanOrEqual(2);
    expect(cells.find((c) => c.value === 'Midrand')!.suppressed).toBe(true);
    expect(cells.find((c) => c.value === 'Soweto')!.suppressed).toBe(true);
  });

  /**
   * Two hidden cells are not enough on their own. 30 answered, 14 + 14 shown,
   * two hidden — the pair must total 2, so each is exactly 1. The count of
   * suppressed cells was satisfied and two individuals were still pinned; the
   * SUPPRESSED MASS has to clear the minimum as well.
   */
  it.each([
    [[14, 14, 1, 1], 30],
    [[9, 9, 1, 1], 20],
    [[11, 5, 4], 20],
  ])('never leaves a suppressed cell recoverable by subtraction (%j)', (counts, answered) => {
    const { cells, state } = suppressDistribution(
      (counts as number[]).map((n, i) => cell(`opt${i}`, n)),
      { minCell: 5, answered: answered as number, partitions: true },
    );
    if (state === 'banded' || state === 'held') return; // no exact counts published at all
    const suppressed = cells.filter((c) => c.suppressed);
    const shownTotal = cells.filter((c) => !c.suppressed).reduce((s, c) => s + (c.count ?? 0), 0);
    expect(suppressed.length).toBeGreaterThanOrEqual(2);
    expect((answered as number) - shownTotal).toBeGreaterThanOrEqual(5);
  });

  /**
   * 18 yes / 2 no is the modal shape of real satisfaction data, and every
   * exact-count rule collapses it to nothing: the 2 goes for being under five,
   * the 18 follows it as the complement, and the business that paid for 20
   * answers gets an empty card. Bands are the honest middle — true, useful,
   * and pinning nobody, because at 20 answers each quarter spans at least five
   * people.
   */
  it('shows a near-unanimous question in broad strokes rather than not at all', () => {
    const { cells, state } = suppressDistribution(
      [cell('yes', 18), cell('no', 2)],
      { minCell: 5, answered: 20, partitions: true },
    );
    expect(state).toBe('banded');
    expect(cells[0]).toEqual({
      value: 'yes', label: 'yes', count: null, percent: null,
      suppressed: true, band: 'over_three_quarters',
    });
    expect(cells[1].band).toBe('under_a_quarter');
  });

  it('never mixes an exact count with a banded one on the same question', () => {
    const { cells } = suppressDistribution(
      [cell('yes', 18), cell('no', 2)],
      { minCell: 5, answered: 20, partitions: true },
    );
    expect(cells.every((c) => c.count === null && c.percent === null)).toBe(true);
  });

  it('holds a question outright when there are too few answers to band', () => {
    const { cells, state, heldReason } = suppressDistribution(
      [cell('yes', 9), cell('no', 1)],
      { minCell: 5, answered: 10, partitions: true },
    );
    expect(state).toBe('held');
    expect(cells).toEqual([]);
    expect(heldReason).toBe('too_few_in_one_group');
  });

  it('never labels which suppressions were forced', () => {
    const { cells } = suppressDistribution(
      [cell('a', 12), cell('b', 10), cell('c', 6), cell('d', 2)],
      { minCell: 5, answered: 30, partitions: true },
    );
    // A cell hidden for being under five is a handful of people; one hidden to
    // cover it is at least five. Saying which is which hands back the very
    // distinction the complementary rule spends a cell to blur.
    for (const c of cells.filter((x) => x.suppressed)) {
      expect(Object.keys(c).sort()).toEqual(['band', 'count', 'label', 'percent', 'suppressed', 'value']);
      expect(c.band).toBe('<5');
    }
  });

  describe('a multi-select does not partition its respondents', () => {
    const multi = () => suppressDistribution(
      [cell('Big supermarket', 18), cell('Corner shop', 3), cell('Online', 11)],
      { minCell: 5, answered: 25, partitions: false },
    );

    it('does not apply complementary suppression to a multi-select', () => {
      const { cells } = multi();
      expect(cells.filter((c) => c.suppressed).map((c) => c.value)).toEqual(['Corner shop']);
    });

    it('never collapses a multi-select into bands', () => {
      const { cells, state } = suppressDistribution(
        [cell('only', 2)],
        { minCell: 5, answered: 25, partitions: false },
      );
      expect(state).toBe('partially_suppressed');
      expect(cells).toHaveLength(1);
    });
  });
});
