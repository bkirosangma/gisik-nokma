import { describe, expect, it } from 'vitest';
import {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
  TIMELINE_SIDE_LIST_COPY,
  barProvenance,
  claimTooltip,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
} from '../../src/claims/claim-labels.js';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string): string => names[id] ?? id;

describe("11.5 attributed labels (spec §7's exact shape — planted defect: the label is exact)", () => {
  it('formats the claimed day', () => {
    expect(formatClaimDate('2026-08-30')).toBe('30 Aug');
    expect(formatClaimDate('2026-01-05')).toBe('5 Jan');
  });

  /**
   * The month name comes from the domain's ONE instant renderer, so a day
   * that renderer refuses comes back VERBATIM rather than as a plausible
   * label. `2026-02-30` matches IST_DAY_REGEX and is not a day; the earlier
   * shape of this function (a local month table plus `Number(month) - 1`)
   * rendered `2026-13-01` as "1 undefined" and `2026-02-30` as "30 Feb" —
   * two dates nobody claimed.
   */
  it('11.5 a day that is not a day renders VERBATIM — never a plausible label', () => {
    expect(formatClaimDate('2026-02-30')).toBe('2026-02-30');
    expect(formatClaimDate('2026-13-01')).toBe('2026-13-01');
    expect(formatClaimDate('not a day')).toBe('not a day');
  });

  it("a due claim renders as the spec's example, verbatim", () => {
    expect(dueClaimLabel({ date: '2026-08-30', actorId: 'user_kiro' }, userName)).toBe(
      "needed by 30 Aug — Kiro's claim",
    );
  });

  it('a start claim is attributed the same way', () => {
    expect(startClaimLabel({ date: '2026-09-01', actorId: 'user_anselma' }, userName)).toBe(
      "starts 1 Sep — Anselma's claim",
    );
  });

  /** A name the roster does not hold falls back to the raw id — attributed, never blank. */
  it('11.5 an unknown actor is named by id, never anonymised', () => {
    expect(dueClaimLabel({ date: '2026-08-30', actorId: 'user_ghost' }, userName)).toBe(
      "needed by 30 Aug — user_ghost's claim",
    );
  });

  it("the tooltip carries the claim's note, quoted — never paraphrased", () => {
    expect(
      claimTooltip("needed by 30 Aug — Kiro's claim", {
        date: '2026-08-30',
        actorId: 'user_kiro',
        note: 'GST filing',
      }),
    ).toBe(`needed by 30 Aug — Kiro's claim · "GST filing"`);
  });

  it('a claim with no note gets no invented one', () => {
    expect(claimTooltip("needed by 30 Aug — Kiro's claim", { date: '2026-08-30', actorId: 'user_kiro' })).toBe(
      "needed by 30 Aug — Kiro's claim",
    );
  });

  it("11.36 a custom date claim wears the FIELD'S OWN NAME — never a generic word", () => {
    expect(
      customClaimLabel(
        {
          fieldId: 'filed-on',
          fieldName: 'Filed on',
          date: '2026-08-30',
          actorId: 'user_kiro',
          clientTime: '2026-08-19T10:00:00.000Z',
          serverTime: '2026-08-19T10:00:01.000Z',
          pending: false,
        },
        userName,
      ),
    ).toBe("Filed on: 30 Aug — Kiro's claim");
  });

  it('bar provenance names both claims and both authors', () => {
    expect(
      barProvenance(
        { date: '2026-08-24', actorId: 'user_anselma' },
        { date: '2026-08-30', actorId: 'user_kiro' },
        userName,
      ),
    ).toBe("starts 24 Aug — Anselma's claim · needed by 30 Aug — Kiro's claim");
  });

  it('11.4 a start-after-due contradiction is shown, not resolved', () => {
    expect(
      contradictionCopy({ date: '2026-08-30', actorId: 'user_kiro' }, { date: '2026-08-24', actorId: 'user_kiro' }),
    ).toBe('start 30 Aug is after needed-by 24 Aug — both claims shown, no bar drawn');
  });

  it('11.1 the empty month says why it is empty', () => {
    expect(CALENDAR_EMPTY_MONTH_COPY).toBe(
      'No claimed dates fall in this month. Undated work is absent, not estimated — the calendar draws only what someone claimed.',
    );
  });

  /**
   * 11.49 (NEW — see the report; Task 15 must carry it into
   * test-cases/11-calendar-notifications.md). "Nobody claimed a date here" and
   * "you switched these off" are two different facts and one of them is the
   * viewer's own doing. One copy for both would be the calendar telling a
   * viewer their own claims do not exist.
   */
  it('11.49 the all-hidden month is a DIFFERENT sentence from the empty one', () => {
    expect(CALENDAR_ALL_HIDDEN_COPY).toBe(
      'Every claimed date in this month belongs to a field you have hidden. Nothing was dropped — switch a field back on in the legend to see its claims again.',
    );
    expect(CALENDAR_ALL_HIDDEN_COPY).not.toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  it('the timeline side list says what a bar would require', () => {
    expect(TIMELINE_SIDE_LIST_COPY).toBe(
      'No bar is invented: work appears here until it carries both a claimed start and a claimed needed-by.',
    );
  });
});
