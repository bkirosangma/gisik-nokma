import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import {
  NO_DATES_NOTE,
  NO_DAY_CLAIMS_NOTE,
  buildTimelineModel,
  type TimelineModel,
  type TimelineRow,
} from '../../src/timeline/timeline-model.js';

/**
 * Ids invented here that Task 15 must carry into
 * `test-cases/11-calendar-notifications.md` (which does not exist yet):
 * 11.52-11.60. Each describe below names its own; `docs/lanes/executor-state.md`
 * carries the same list for a relaunched executor.
 */

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string): string => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

/**
 * The landed `TicketState` shape, spelled once. `kind` and `workflowVersion`
 * are required fields the plan's builder predates, and an `as TicketState`
 * hiding them would let the model compile against a ticket the reducer never
 * produces — the same note `calendar-model.test.ts` carries.
 */
function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
    kind: 'ticket',
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    workflowVersion: 1,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
  };
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

/**
 * Sunday. The window therefore opens on the Monday BEFORE the anchor —
 * 17 Aug — and eight columns reach the Sunday 11 Oct. Both of those days are
 * fixtures below, and so is the day either side of each.
 */
const ANCHOR = '2026-08-23';
const WINDOW_START = '2026-08-17';
const WINDOW_END = '2026-10-11';
const LAST_WEEK = 7;

function model(
  inputs: TicketDatesInput[],
  extra: Partial<Parameters<typeof buildTimelineModel>[1]> = {},
): TimelineModel {
  return buildTimelineModel(inputs, { anchor: ANCHOR, userName, ...extra });
}

function allRows(m: TimelineModel): TimelineRow[] {
  return m.groups.flatMap((group) => group.rows);
}

function onlyRow(m: TimelineModel): TimelineRow {
  const rows = allRows(m);
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

function dated(start: string, due: string, title = 'Dated'): TicketDatesInput {
  return ticket({
    fields: {
      title: claimField(title),
      startDate: claimField({ date: start }),
      dueDate: claimField({ date: due }),
    },
  });
}

describe('11.52 bars require BOTH claims (planted defects — invariant 4)', () => {
  it('a due-only ticket is a side-list entry with its attributed claim, never a bar', () => {
    const m = model([
      ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList).toHaveLength(1);
    expect(m.sideList[0]!.reason).toBe('due-only');
    expect(m.sideList[0]!.note).toBe("needed by 28 Aug — Kiro's claim");
    expect(m.sideList[0]!.startClaim).toBeNull();
    expect(m.sideList[0]!.dueClaim?.date).toBe('2026-08-28');
  });

  it('a start-only ticket sits beside it', () => {
    const m = model([
      ticket({
        fields: { title: claimField('Start only'), startDate: claimField({ date: '2026-08-24' }, 'user_anselma') },
      }),
    ]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0]!.reason).toBe('start-only');
    expect(m.sideList[0]!.note).toBe("starts 24 Aug — Anselma's claim");
    expect(m.sideList[0]!.dueClaim).toBeNull();
  });

  it('an undated ticket is named as such — present as work, absent as geometry', () => {
    const m = model([ticket()]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0]!.reason).toBe('no-dates');
    expect(m.sideList[0]!.note).toBe(NO_DATES_NOTE);
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_COPY);
  });

  it('start after due is shown as the contradiction it is — no bar, both claims named', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Contradictory'),
          startDate: claimField({ date: '2026-08-30' }),
          dueDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
        },
      }),
    ]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0]!.reason).toBe('start-after-due');
    expect(m.sideList[0]!.note).toBe(
      'start 30 Aug is after needed-by 24 Aug — both claims shown, no bar drawn',
    );
    // Both claims survive on the entry: the contradiction is displayed, not resolved.
    expect(m.sideList[0]!.startClaim?.date).toBe('2026-08-30');
    expect(m.sideList[0]!.dueClaim?.date).toBe('2026-08-24');
  });

  it('start EQUAL to due is a period of one day, not a contradiction', () => {
    const row = onlyRow(model([dated('2026-08-24', '2026-08-24', 'Same day')]));
    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
  });
});

describe('11.53 the side-list heading is true of every entry under it', () => {
  it('missing-claim entries only — the plain heading, whose leaving condition they all fail', () => {
    const m = model([
      ticket(),
      ticket({ fields: { title: claimField('D'), dueDate: claimField({ date: '2026-08-28' }) } }),
      ticket({ fields: { title: claimField('S'), startDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(m.sideList.map((entry) => entry.reason)).toEqual(['no-dates', 'due-only', 'start-only']);
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_COPY);
  });

  /**
   * THE fixture the plan has no version of: two DIFFERENT reasons in one list.
   * Every side-list case in the plan text holds a single reason, so none of
   * them can see a heading that is true of one entry and false of the next.
   * "until it carries both a claimed start and a claimed needed-by" states a
   * leaving condition the contradictory ticket already satisfies.
   */
  it('a contradiction in the list retires the plain heading — it carries both and is still here', () => {
    const m = model([
      ticket(),
      ticket({
        fields: {
          title: claimField('Contradictory'),
          startDate: claimField({ date: '2026-08-30' }),
          dueDate: claimField({ date: '2026-08-24' }),
        },
      }),
    ]);
    expect(m.sideList.map((entry) => entry.reason)).toEqual(['no-dates', 'start-after-due']);
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY);
    // Named literally: the plain heading's claim is FALSE of the second entry.
    expect(TIMELINE_SIDE_LIST_COPY).toContain('until it carries both');
  });

  it('an empty side list keeps the plain heading', () => {
    expect(model([dated('2026-08-24', '2026-08-28')]).sideListCopy).toBe(TIMELINE_SIDE_LIST_COPY);
    expect(model([]).sideList).toEqual([]);
  });
});

describe('11.54 a claimed day that is not a day is named, and blanks nothing', () => {
  /**
   * `IST_DAY_REGEX` is a shape check and `dueDateValueSchema` adds nothing to
   * it, so `2026-02-30` is a storable claim. It is also the first thing the
   * timeline converts to a number — `dateMs` THROWS on it.
   */
  it('one unstorable-in-reality day does not take the whole timeline down with it', () => {
    const good = dated('2026-08-24', '2026-08-28', 'Real work');
    const bad = ticket({
      fields: {
        title: claimField('Filed on the thirtieth of February'),
        startDate: claimField({ date: '2026-02-30' }),
        dueDate: claimField({ date: '2026-09-04' }),
      },
    });
    const m = model([good, bad]);
    // The other ticket still renders — this is the whole point.
    expect(allRows(m).map((row) => row.ticketId)).toEqual([good.state.id]);
    const entry = m.sideList.find((item) => item.ticketId === bad.state.id)!;
    expect(entry.reason).toBe('unplaceable-day');
    expect(entry.note).toBe(
      '2026-02-30 is not a day on the calendar — the claim is shown as recorded, and no bar is drawn',
    );
    // The bad day is printed VERBATIM — never a plausible neighbour like 2 Mar.
    expect(entry.note).not.toContain('Mar');
    // Neither claim is denied: calling this 'due-only' would erase the start claim.
    expect(entry.startClaim?.date).toBe('2026-02-30');
    expect(entry.dueClaim?.date).toBe('2026-09-04');
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY);
  });

  it('both ends unplaceable are both named', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Two bad days'),
          startDate: claimField({ date: '2026-02-30' }),
          dueDate: claimField({ date: '2027-04-31' }),
        },
      }),
    ]);
    expect(m.sideList[0]!.note).toBe(
      '2026-02-30 and 2027-04-31 are not days on the calendar — the claim is shown as recorded, and no bar is drawn',
    );
  });

  it('an unplaceable day with the other end MISSING keeps the missing end null', () => {
    const m = model([
      ticket(
        {
          fields: {
            title: claimField('One bad end, one absent'),
            startDate: claimField({ date: '2026-02-30' }),
            'filed-on': claimField('2026-08-26'),
          },
        },
        [],
        [{ id: 'filed-on', name: 'Filed on' }],
      ),
    ]);
    const entry = m.sideList[0]!;
    expect(entry.reason).toBe('unplaceable-day');
    expect(entry.startClaim?.date).toBe('2026-02-30');
    expect(entry.dueClaim).toBeNull();
    // The claims that ride along ride along here too.
    expect(entry.customClaims.map((item) => item.label)).toEqual(["Filed on: 26 Aug — Kiro's claim"]);
  });

  /**
   * `customDateClaimsOf` regex-checks and nothing more, so a custom field can
   * carry `2026-02-30` too. It is safe only because NOTHING does arithmetic on
   * a custom claim — which is the "custom dates are never geometry" invariant
   * restated as a crash that does not happen. Witnessed rather than assumed.
   */
  it('an unplaceable CUSTOM day never reaches the arithmetic — it is not geometry', () => {
    const row = onlyRow(
      model([
        ticket(
          {
            fields: {
              title: claimField('Filed on a day that is not one'),
              startDate: claimField({ date: '2026-08-24' }),
              dueDate: claimField({ date: '2026-08-28' }),
              'filed-on': claimField('2026-02-30'),
            },
          },
          [],
          [{ id: 'filed-on', name: 'Filed on' }],
        ),
      ]),
    );
    // The bar is untouched, and the bad day is printed verbatim beside it.
    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
    expect(row.customClaims.map((item) => item.label)).toEqual([
      "Filed on: 2026-02-30 — Kiro's claim",
    ]);
  });

  it('a real leap day is placed, not refused — the guard is about days, not about February', () => {
    const row = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')], { anchor: '2028-02-29' }));
    expect(row.bar).toEqual({ fromWeek: 0, toWeek: 1, clippedStart: false, clippedEnd: false });
  });
});

describe('11.55 the window, at both of its ends and one day either side', () => {
  it('is 8 Monday-start weeks with W-labels', () => {
    const m = model([]);
    expect(m.weeks).toHaveLength(8);
    expect(m.weeks[0]).toEqual({ start: WINDOW_START, label: 'W 17 Aug' });
    expect(m.weeks[1]!.start).toBe('2026-08-24');
    expect(m.weeks[LAST_WEEK]).toEqual({ start: '2026-10-05', label: 'W 5 Oct' });
  });

  it('an anchor already ON a Monday opens that same week, not the one before', () => {
    const m = model([], { anchor: '2026-08-17' });
    expect(m.weeks[0]!.start).toBe('2026-08-17');
  });

  it('the week boundary is Sunday|Monday, pinned on both days', () => {
    // 23 Aug is the anchor Sunday: still week 0. 24 Aug is week 1.
    expect(onlyRow(model([dated('2026-08-23', '2026-08-23')])).bar.fromWeek).toBe(0);
    expect(onlyRow(model([dated('2026-08-24', '2026-08-24')])).bar.fromWeek).toBe(1);
  });

  it('a start ON the window start is not clipped; one day earlier is', () => {
    const on = onlyRow(model([dated(WINDOW_START, '2026-08-28')]));
    expect(on.bar.clippedStart).toBe(false);
    expect(on.bar.fromWeek).toBe(0);
    const before = onlyRow(model([dated('2026-08-16', '2026-08-28')]));
    expect(before.bar.clippedStart).toBe(true);
    expect(before.bar.fromWeek).toBe(0);
  });

  it('a due ON the window end is not clipped; one day later is', () => {
    const on = onlyRow(model([dated('2026-09-28', WINDOW_END)]));
    expect(on.bar.clippedEnd).toBe(false);
    expect(on.bar.toWeek).toBe(LAST_WEEK);
    const after = onlyRow(model([dated('2026-09-28', '2026-10-12')]));
    expect(after.bar.clippedEnd).toBe(true);
    expect(after.bar.toWeek).toBe(LAST_WEEK);
  });

  it('membership at the near edge: due ON the window start is in, one day earlier is nowhere', () => {
    const inside = model([dated('2026-08-01', WINDOW_START, 'Ends on day one')]);
    expect(onlyRow(inside).bar).toEqual({
      fromWeek: 0,
      toWeek: 0,
      clippedStart: true,
      clippedEnd: false,
    });
    const outside = model([dated('2026-08-01', '2026-08-16', 'Ended the day before')]);
    expect(allRows(outside)).toHaveLength(0);
    // Absent, not side-listed: it carries both claims, it is simply elsewhere.
    expect(outside.sideList).toHaveLength(0);
  });

  it('membership at the far edge: start ON the window end is in, one day later is nowhere', () => {
    const inside = model([dated(WINDOW_END, '2026-11-20', 'Starts on the last day')]);
    expect(onlyRow(inside).bar).toEqual({
      fromWeek: LAST_WEEK,
      toWeek: LAST_WEEK,
      clippedStart: false,
      clippedEnd: true,
    });
    const outside = model([dated('2026-10-12', '2026-11-20', 'Next quarter')]);
    expect(allRows(outside)).toHaveLength(0);
    expect(outside.sideList).toHaveLength(0);
  });

  it('a bar spanning the whole window is clipped at both ends and covers every column', () => {
    const row = onlyRow(model([dated('2026-01-01', '2026-12-31', 'All year')]));
    expect(row.bar).toEqual({ fromWeek: 0, toWeek: LAST_WEEK, clippedStart: true, clippedEnd: true });
  });

  it('every bar ends no earlier than it starts — a backwards bar is invented geometry', () => {
    const rows = allRows(
      model([
        dated(WINDOW_START, WINDOW_END, 'a'),
        dated('2026-08-16', '2026-10-12', 'b'),
        dated('2026-08-24', '2026-08-24', 'c'),
        dated(WINDOW_END, '2026-11-20', 'd'),
      ]),
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.bar.toWeek).toBeGreaterThanOrEqual(row.bar.fromWeek);
      expect(row.bar.fromWeek).toBeGreaterThanOrEqual(0);
      expect(row.bar.toWeek).toBeLessThanOrEqual(LAST_WEEK);
    }
  });

  it('weeksCount is honoured, and its last column is where clipping lands', () => {
    const m = model([dated('2026-08-24', '2026-12-01')], { weeksCount: 2 });
    expect(m.weeks.map((week) => week.start)).toEqual(['2026-08-17', '2026-08-24']);
    expect(onlyRow(m).bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: true });
  });

  /**
   * The MESSAGE, not just the type. Deleting the `weeksCount` guard still
   * throws — the empty `weeks` array trips the `lastWeek === undefined`
   * fallback one line later — so `toThrow(RangeError)` alone passes against
   * a model with no guard at all. Measured: that is exactly what the first
   * draft of this assertion did.
   */
  it('a window with no columns is refused loudly, by the guard that names the count', () => {
    expect(() => model([], { weeksCount: 0 })).toThrow(
      /a timeline needs at least one week column: 0/,
    );
    expect(() => model([], { weeksCount: -3 })).toThrow(
      /a timeline needs at least one week column: -3/,
    );
    // A fractional count would otherwise build a fractional number of columns.
    expect(() => model([], { weeksCount: 2.5 })).toThrow(
      /a timeline needs at least one week column: 2.5/,
    );
  });
});

describe('11.56 bars carry exact week indices and their two authors', () => {
  it('a both-claims ticket becomes one bar with exact week indices and provenance', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('Real work'),
          startDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
          dueDate: claimField({ date: '2026-09-04' }),
        },
      }),
    ]);
    const row = onlyRow(m);
    // weeks: 17 Aug = 0, 24 Aug = 1, 31 Aug = 2
    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 2, clippedStart: false, clippedEnd: false });
    expect(row.provenance).toBe("starts 24 Aug — Anselma's claim · needed by 4 Sep — Kiro's claim");
    expect(row.startClaim.date).toBe('2026-08-24');
    expect(row.dueClaim.date).toBe('2026-09-04');
    expect(row.pending).toBe(false);
  });

  it('a bar reaching outside the window is clipped and says so', () => {
    const row = onlyRow(model([dated('2026-08-01', '2026-08-26', 'Long haul')]));
    expect(row.bar.fromWeek).toBe(0);
    expect(row.bar.toWeek).toBe(1);
    expect(row.bar.clippedStart).toBe(true);
    expect(row.bar.clippedEnd).toBe(false);
  });

  it('a fully-dated ticket wholly outside the window appears nowhere', () => {
    const m = model([dated('2026-11-02', '2026-11-20', 'Next quarter')]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList).toHaveLength(0);
  });
});

describe('11.57 grouping by epic ancestor is arrangement, never data', () => {
  it('groups rows under their epic ancestor; epicless work lands in "No epic", last', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const inEpic = ticket({
      parentId: 'epic1',
      fields: {
        title: claimField('DLT'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const loose = dated('2026-08-24', '2026-08-28', 'Loose');
    const m = model([epic, inEpic, loose]);
    expect(m.groups.map((group) => group.epicTitle)).toEqual(['Registrations', 'No epic']);
    expect(m.groups[0]!.epicId).toBe('epic1');
    expect(m.groups[0]!.rows[0]!.ticketId).toBe(inEpic.state.id);
    expect(m.groups[1]!.epicId).toBeNull();
    expect(m.groups[1]!.rows[0]!.ticketId).toBe(loose.state.id);
    // The undated epic is a lane, not missing work.
    expect(m.sideList).toHaveLength(0);
  });

  it('an UNTITLED epic is not relabelled "No epic" — it has one', () => {
    const epic = ticket({ id: 'epic2', typeId: 'epic', fields: { title: claimField(42) } });
    const child = ticket({
      parentId: 'epic2',
      fields: {
        title: claimField('Child'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const m = model([epic, child, dated('2026-08-24', '2026-08-28', 'Loose')]);
    expect(m.groups.map((group) => group.epicId)).toEqual(['epic2', null]);
    expect(m.groups[0]!.epicTitle).toBe('epic2');
    expect(m.groups[0]!.epicTitle).not.toBe('No epic');
  });

  /**
   * The server groups by RANK, not by type id: a workspace whose rank-1 type
   * is "Initiative" has epics the built-in id test cannot see. Both the
   * grouping AND the undated-epic skip must ask the same question.
   */
  it('a caller-supplied epic predicate governs grouping AND the undated-epic skip', () => {
    const initiative = ticket({
      id: 'init1',
      typeId: 'initiative',
      fields: { title: claimField('Initiative') },
    });
    const child = ticket({
      parentId: 'init1',
      fields: {
        title: claimField('Under it'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const isEpicType = (typeId: string): boolean => typeId === 'initiative';
    const m = model([initiative, child], { isEpicType });
    expect(m.groups.map((group) => group.epicId)).toEqual(['init1']);
    // The undated initiative is a lane, NOT a ticket missing its dates.
    expect(m.sideList).toHaveLength(0);

    // Without the predicate the same board calls it undated work.
    const dflt = model([initiative, child]);
    expect(dflt.groups.map((group) => group.epicId)).toEqual([null]);
    expect(dflt.sideList.map((entry) => entry.ticketId)).toEqual(['init1']);
  });

  it('the lane filter narrows to one epic and uses the same predicate', () => {
    const epic = ticket({ id: 'epic3', typeId: 'epic', fields: { title: claimField('Kept') } });
    const kept = ticket({
      parentId: 'epic3',
      fields: {
        title: claimField('Kept child'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const m = model([epic, kept, dated('2026-08-24', '2026-08-28', 'Elsewhere')], {
      laneEpicId: 'epic3',
    });
    expect(allRows(m).map((row) => row.ticketId)).toEqual([kept.state.id]);
    expect(m.sideList).toHaveLength(0);
  });

  /**
   * The lane filter must ask the SAME question as the grouping. A lane test
   * built on the built-in `epic` type cannot see this: dropping the injected
   * predicate there changes nothing, because the default already answers yes.
   * (Measured — that is what the first draft of the lane test did, and the
   * mutation survived it.)
   */
  it('the lane filter uses the injected predicate, not the built-in id', () => {
    const initiative = ticket({
      id: 'init2',
      typeId: 'initiative',
      fields: { title: claimField('Lane') },
    });
    const inside = ticket({
      parentId: 'init2',
      fields: {
        title: claimField('Inside the lane'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const outside = dated('2026-08-24', '2026-08-28', 'Outside the lane');
    const m = model([initiative, inside, outside], {
      laneEpicId: 'init2',
      isEpicType: (typeId: string) => typeId === 'initiative',
    });
    expect(allRows(m).map((row) => row.ticketId)).toEqual([inside.state.id]);

    // Without the predicate the lane resolves to nobody and the view empties.
    const blind = model([initiative, inside, outside], { laneEpicId: 'init2' });
    expect(allRows(blind)).toHaveLength(0);
  });

  it('rows inside a group are ordered by claimed start, then by id', () => {
    const later = dated('2026-09-07', '2026-09-11', 'Later');
    const earlier = dated('2026-08-24', '2026-08-28', 'Earlier');
    const m = model([later, earlier]);
    expect(allRows(m).map((row) => row.title)).toEqual(['Earlier', 'Later']);
  });

  /**
   * The comparator arms the date test cannot reach. With two rows on the SAME
   * claimed start, the first comparison returns nothing and the id tie-break
   * is the only thing deciding — measured: replacing that chain with
   * `return 0` survived the test above.
   */
  it('rows sharing a claimed start fall back to id order, not to input order', () => {
    const second = ticket({
      id: 'row-b',
      fields: {
        title: claimField('B'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const first = ticket({
      id: 'row-a',
      fields: {
        title: claimField('A'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-09-04' }),
      },
    });
    // Input order is deliberately the reverse of the answer.
    const rows = allRows(model([second, first]));
    expect(rows.map((row) => row.ticketId)).toEqual(['row-a', 'row-b']);
  });

  /**
   * Two epics, so the title comparison actually runs. Every other grouping
   * fixture holds ONE non-null epic, where the null-last arm decides
   * everything and reversing the title comparison changes nothing.
   */
  it('epic groups are ordered by title, with "No epic" still last', () => {
    const beta = ticket({ id: 'e-beta', typeId: 'epic', fields: { title: claimField('Beta') } });
    const alpha = ticket({ id: 'e-alpha', typeId: 'epic', fields: { title: claimField('Alpha') } });
    const underBeta = ticket({
      parentId: 'e-beta',
      fields: {
        title: claimField('In Beta'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const underAlpha = ticket({
      parentId: 'e-alpha',
      fields: {
        title: claimField('In Alpha'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    // Input order is Beta first; the answer must not be.
    const m = model([beta, underBeta, alpha, underAlpha, dated('2026-08-24', '2026-08-28', 'Loose')]);
    expect(m.groups.map((group) => group.epicTitle)).toEqual(['Alpha', 'Beta', 'No epic']);
  });

  it('two epics sharing a title are still ordered the same way twice', () => {
    const younger = ticket({ id: 'e-2', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const older = ticket({ id: 'e-1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const inYounger = ticket({
      parentId: 'e-2',
      fields: {
        title: claimField('In the second'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const inOlder = ticket({
      parentId: 'e-1',
      fields: {
        title: claimField('In the first'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const m = model([younger, inYounger, older, inOlder]);
    expect(m.groups.map((group) => group.epicTitle)).toEqual(['Registrations', 'Registrations']);
    // Titles cannot separate them; ids must, and in id order rather than input order.
    expect(m.groups.map((group) => group.epicId)).toEqual(['e-1', 'e-2']);
  });
});

describe('11.58 custom date claims ride along and change no geometry (owner sign-off 2026-08-20)', () => {
  it('custom date claims ride the row and change NO geometry', () => {
    const withCustom = ticket(
      {
        fields: {
          title: claimField('Fully dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
          'filed-on': claimField('2026-08-26', 'user_anselma'),
        },
      },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const row = onlyRow(model([withCustom]));
    expect(row.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug — Anselma's claim"]);
    expect(row.customClaims[0]!.claim.fieldId).toBe('filed-on');
    // 24 Aug and 28 Aug are both in the 24-30 week: one column, untouched by
    // the 26 Aug claim.
    expect(row.bar).toEqual({ fromWeek: 1, toWeek: 1, clippedStart: false, clippedEnd: false });
    expect(row.provenance).toBe("starts 24 Aug — Kiro's claim · needed by 28 Aug — Kiro's claim");
  });

  it('a custom claim far outside the window neither extends a bar nor rescues a window miss', () => {
    const stretch = ticket(
      {
        fields: {
          title: claimField('Stretchy'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
          'filed-on': claimField('2026-12-25'),
        },
      },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    expect(onlyRow(model([stretch])).bar.toWeek).toBe(1);

    const gone = ticket(
      {
        fields: {
          title: claimField('Elsewhere'),
          startDate: claimField({ date: '2026-11-02' }),
          dueDate: claimField({ date: '2026-11-20' }),
          'filed-on': claimField('2026-08-26'),
        },
      },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const m = model([gone]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList).toHaveLength(0);
  });

  it('a custom date claim does NOT rescue a ticket from the side list — but the note stops lying', () => {
    const onlyCustom = ticket(
      { fields: { title: claimField('Filed, not scheduled'), 'filed-on': claimField('2026-08-26') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const bare = ticket({ fields: { title: claimField('Nothing claimed') } });
    const m = model([onlyCustom, bare]);
    // No pair, no bar — membership logic unchanged.
    expect(allRows(m)).toHaveLength(0);

    const filed = m.sideList.find((entry) => entry.ticketId === onlyCustom.state.id)!;
    expect(filed.reason).toBe('no-dates');
    // NOT "no claimed dates" — it has one.
    expect(filed.note).toBe(NO_DAY_CLAIMS_NOTE);
    expect(filed.note).not.toBe(NO_DATES_NOTE);
    expect(filed.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug — Kiro's claim"]);

    const nothing = m.sideList.find((entry) => entry.ticketId === bare.state.id)!;
    expect(nothing.note).toBe(NO_DATES_NOTE);
    expect(nothing.customClaims).toEqual([]);
  });

  it('a start-only ticket with a custom claim keeps the start-only note AND carries the claim', () => {
    const m = model([
      ticket(
        {
          fields: {
            title: claimField('Started, filed'),
            startDate: claimField({ date: '2026-08-24' }),
            'filed-on': claimField('2026-08-26'),
          },
        },
        [],
        [{ id: 'filed-on', name: 'Filed on' }],
      ),
    ]);
    expect(m.sideList[0]!.reason).toBe('start-only');
    expect(m.sideList[0]!.note).toBe("starts 24 Aug — Kiro's claim");
    expect(m.sideList[0]!.customClaims).toHaveLength(1);
  });
});

describe('11.59 filters narrow rows and side list alike', () => {
  it('filters narrow both sides; pending claims stay visibly in transit', () => {
    const mine = ticket(
      {
        assigneeId: 'user_anselma',
        fields: {
          title: claimField('Mine'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      },
      ['dueDate'],
    );
    const other = ticket({
      fields: { title: claimField('Other'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const m = model([mine, other], { filter: { assigneeIds: ['user_anselma'] } });
    expect(allRows(m)).toHaveLength(1);
    expect(onlyRow(m).pending).toBe(true);
    // 'Other' is filtered out BEFORE the side list.
    expect(m.sideList).toHaveLength(0);
  });

  it('a filtered-out epic still names the lane of the child that survived', () => {
    const epic = ticket({
      id: 'epic4',
      typeId: 'epic',
      assigneeId: 'user_kiro',
      fields: { title: claimField('Still named') },
    });
    const child = ticket({
      parentId: 'epic4',
      assigneeId: 'user_anselma',
      fields: {
        title: claimField('Survivor'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const m = model([epic, child], { filter: { assigneeIds: ['user_anselma'] } });
    expect(m.groups.map((group) => group.epicTitle)).toEqual(['Still named']);
  });
});
