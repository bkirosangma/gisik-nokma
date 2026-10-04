import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_NO_DATES_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import { dayNumberOf } from '../../src/timeline/timeline-days.js';
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
 * 11.52-11.62. Each describe below names its own; `docs/lanes/executor-state.md`
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

/** The injected today: a Sunday. The chart has no window, so it only places the today line. */
const TODAY = '2026-08-23';

function model(
  inputs: TicketDatesInput[],
  extra: Partial<Parameters<typeof buildTimelineModel>[1]> = {},
): TimelineModel {
  return buildTimelineModel(inputs, { today: TODAY, userName, ...extra });
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
    expect(m.sideList[0]!.note).toBe("needed by 28 Aug, Kiro's claim");
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
    expect(m.sideList[0]!.note).toBe("starts 24 Aug, Anselma's claim");
    expect(m.sideList[0]!.dueClaim).toBeNull();
  });

  it('an undated ticket is named as such — present as work, absent as geometry', () => {
    const m = model([ticket()]);
    expect(allRows(m)).toHaveLength(0);
    expect(m.sideList[0]!.reason).toBe('no-dates');
    expect(m.sideList[0]!.note).toBe(NO_DATES_NOTE);
    // 23.143: a list of ONLY undated tickets says so, instead of asking for a start AND a due date they may not need.
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_NO_DATES_COPY);
    expect(m.sideListCopy).not.toBe(TIMELINE_SIDE_LIST_COPY);
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
      'start 30 Aug is after needed-by 24 Aug. Both claims shown, no bar drawn',
    );
    // Both claims survive on the entry: the contradiction is displayed, not resolved.
    expect(m.sideList[0]!.startClaim?.date).toBe('2026-08-30');
    expect(m.sideList[0]!.dueClaim?.date).toBe('2026-08-24');
  });

  it('start EQUAL to due is a period of one day, not a contradiction', () => {
    const row = onlyRow(model([dated('2026-08-24', '2026-08-24', 'Same day')]));
    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-24')]);
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
   * "Add a start and a due date to place a ticket on the timeline" asks for
   * something the contradictory ticket already has.
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
    expect(TIMELINE_SIDE_LIST_COPY).toContain('Add a start and a due date');
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
      '2026-02-30 is not a day on the calendar. The claim is shown as recorded, and no bar is drawn',
    );
    // The bad day is printed VERBATIM — never a plausible neighbour like 2 Mar.
    expect(entry.note).not.toContain('Mar');
    // Neither claim is denied: calling this 'due-only' would erase the start claim.
    expect(entry.startClaim?.date).toBe('2026-02-30');
    expect(entry.dueClaim?.date).toBe('2026-09-04');
    expect(m.sideListCopy).toBe(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY);
  });

  /**
   * The SAME bad day at both ends is one bad day claimed twice, not two. The
   * fixture above cannot see this — it uses two DIFFERENT days — and the copy
   * used to print "2026-02-30 and 2026-02-30 are not days on the calendar",
   * inventing a second problem and getting the verb wrong about the first.
   */
  it('the same bad day at both ends is named ONCE, with the singular verb', () => {
    const m = model([
      ticket({
        fields: {
          title: claimField('One bad day, claimed twice'),
          startDate: claimField({ date: '2026-02-30' }),
          dueDate: claimField({ date: '2026-02-30' }),
        },
      }),
    ]);
    expect(m.sideList[0]!.note).toBe(
      '2026-02-30 is not a day on the calendar. The claim is shown as recorded, and no bar is drawn',
    );
    // Both claims still travel: deduping the SENTENCE never dedupes the data.
    expect(m.sideList[0]!.startClaim?.date).toBe('2026-02-30');
    expect(m.sideList[0]!.dueClaim?.date).toBe('2026-02-30');
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
      '2026-02-30 and 2027-04-31 are not days on the calendar. The claim is shown as recorded, and no bar is drawn',
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
    expect(entry.customClaims.map((item) => item.label)).toEqual(["Filed on: 26 Aug, Kiro's claim"]);
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
    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-28')]);
    expect(row.customClaims.map((item) => item.label)).toEqual([
      "Filed on: 2026-02-30, Kiro's claim",
    ]);
  });

  it('a real leap day is placed, not refused — the guard is about days, not about February', () => {
    const row = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')]));
    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2028-02-29'), dayNumberOf('2028-03-07')]);
  });
});

describe('29.093 a bar is its two claimed days, whatever they are', () => {
  it('29.093 the row carries the claimed days as day numbers (1970-01-05 is day 4): a one-day period is startDay === endDay; a real leap day is placed', () => {
    const one = onlyRow(model([dated('2026-08-24', '2026-08-24', 'Same day')]));
    expect([one.startDay, one.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-24')]);
    // The number itself, not only agreement with the helper: day 0 is 1970-01-01, so 1970-01-05 is day 4 and 2026-08-24 is 20689.
    expect(one.startDay).toBe(20689);
    const leap = onlyRow(model([dated('2028-02-29', '2028-03-07', 'Leap')]));
    expect([leap.startDay, leap.endDay]).toEqual([dayNumberOf('2028-02-29'), dayNumberOf('2028-03-07')]);
    expect(leap.endDay - leap.startDay).toBe(7);
    // control: a day that is not a day is refused by the guard, not turned into a bar: it is side-listed as unplaceable
    const bad = model([dated('2026-02-30', '2026-03-05', 'Bad day')]);
    expect(allRows(bad)).toHaveLength(0);
    expect(bad.sideList.map((entry) => entry.reason)).toEqual(['unplaceable-day']);
  });

  it('29.093 both claims and their two authors still make one row with the exact provenance sentence', () => {
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
    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-09-04')]);
    expect(row.provenance).toBe("starts 24 Aug, Anselma's claim; needed by 4 Sep, Kiro's claim");
    expect(row.startClaim.date).toBe('2026-08-24');
    expect(row.dueClaim.date).toBe('2026-09-04');
    expect(row.pending).toBe(false);
  });
});

describe('29.094 the chart has no window: a dated ticket is never elsewhere', () => {
  it('29.094 a ticket dated a year before, and one dated a year after, are both rows; none is side-listed; the extent spans them (firstDay / lastDay)', () => {
    const m = model([
      dated('2025-03-03', '2025-03-07', 'Long ago'),
      dated('2027-11-01', '2027-11-05', 'Far ahead'),
      dated('2026-08-24', '2026-08-28', 'Now'),
    ]);
    expect(allRows(m).map((r) => r.title).sort()).toEqual(['Far ahead', 'Long ago', 'Now']);
    expect(m.sideList).toHaveLength(0);
    expect(m.firstDay).toBe(dayNumberOf('2025-03-03'));
    expect(m.lastDay).toBe(dayNumberOf('2027-11-05'));
    // control: with nothing dated the extent is empty, not zero
    const none = model([]);
    expect([none.firstDay, none.lastDay]).toEqual([null, null]);
  });

  it('29.094 a custom date claim neither extends a row nor adds one', () => {
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
    const row = onlyRow(model([stretch]));
    expect(row.endDay).toBe(dayNumberOf('2026-08-28'));
    expect(row.customClaims).toHaveLength(1);
    expect(model([stretch]).lastDay).toBe(dayNumberOf('2026-08-28'));
  });
});

describe('29.096 todayDay is the day number of the injected today', () => {
  it('29.096 any calendar day is a number, however far from the rows; no today (or not a calendar day) is null', () => {
    expect(model([], { today: '2026-08-19' }).todayDay).toBe(dayNumberOf('2026-08-19'));
    expect(model([], { today: '2031-01-01' }).todayDay).toBe(dayNumberOf('2031-01-01'));
    expect(model([], { today: '2026-02-30' }).todayDay).toBeNull();
    expect(buildTimelineModel([], { userName }).todayDay).toBeNull();
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
    expect(row.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug, Anselma's claim"]);
    expect(row.customClaims[0]!.claim.fieldId).toBe('filed-on');
    // 24 Aug and 28 Aug are both in the 24-30 week: one column, untouched by
    // the 26 Aug claim.
    expect([row.startDay, row.endDay]).toEqual([dayNumberOf('2026-08-24'), dayNumberOf('2026-08-28')]);
    expect(row.provenance).toBe("starts 24 Aug, Kiro's claim; needed by 28 Aug, Kiro's claim");
  });

  it('a custom claim far away neither extends a bar nor makes a row', () => {
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
    expect(onlyRow(model([stretch])).endDay).toBe(dayNumberOf('2026-08-28'));
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
    expect(filed.customClaims.map((entry) => entry.label)).toEqual(["Filed on: 26 Aug, Kiro's claim"]);

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
    expect(m.sideList[0]!.note).toBe("starts 24 Aug, Kiro's claim");
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

/**
 * 11.61 (NEW — Task 15 must carry this id into
 * test-cases/11-calendar-notifications.md).
 *
 * MEASURED BEFORE THIS BLOCK EXISTED, at this anchor: `model([])`, a filter
 * matching nobody, an unmatched lane, and work that is fully dated but wholly
 * outside the window all `JSON.stringify`d to the SAME bytes. Distinct count:
 * ONE. The sibling `CalendarModel` — same package, same author — already had
 * `emptyCopy` and (then) three sentences for exactly this failure; the timeline had
 * no such field at all.
 *
 * The window miss is the case the component cannot reconstruct: Task 11's
 * props carry `tickets`, `filter` and `laneEpicId` and nothing about the
 * window.
 *
 * ⚠ **THE BLOCK IS NOW ABOUT TWO SENTENCES, NOT THREE** (2026-09-20): the
 * sentence for the narrowing case was deleted on the owner's ruling and its
 * arm falls through to `TIMELINE_EMPTY_COPY`. The guard it steered by is kept,
 * and the tests below are re-aimed at the outcomes the remaining two sentences
 * still distinguish. The distinct-count assertion records the collapse rather
 * than hiding it.
 */
describe('11.61 the empty timelines (one sentence since the window went: 29.095)', () => {
  function assigned(assigneeId: string, title: string, start?: string, due?: string): TicketDatesInput {
    const fields: Record<string, unknown> = { title: claimField(title) };
    if (start !== undefined) fields.startDate = claimField({ date: start });
    if (due !== undefined) fields.dueDate = claimField({ date: due });
    return ticket({ assigneeId, fields: fields as TicketDatesInput['state']['fields'] });
  }

  const inWindow = (): TicketDatesInput[] => [dated('2026-08-24', '2026-08-28', 'Here')];

  it('nothing loaded at all says nobody claimed a period — not that something is hidden', () => {
    const m = model([]);
    expect(m.groups).toEqual([]);
    expect(m.sideList).toEqual([]);
    expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
  });

  it('a FILTER that matched nobody no longer has a sentence of its own — this one names it instead', () => {
    const m = model(inWindow(), { filter: { assigneeIds: ['user_nobody'] } });
    expect(m.groups).toEqual([]);
    expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
    // The property the deleted sentence used to carry, now carried by this one.
    expect(m.emptyCopy).toContain('your filter');
  });

  it('an unmatched LANE reaches the same sentence — the door outlives the copy', () => {
    const m = model(inWindow(), { laneEpicId: 'no_such_epic' });
    expect(m.groups).toEqual([]);
    expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
  });

  /**
   * 29.095 THE COLLAPSE, MEASURED. With the window gone there is no "elsewhere
   * in time" screen: a workspace with nothing in it, a filter that matched
   * nobody and a lane that matched nothing are ONE model, and the one sentence
   * is true of all three ("No claimed dates are here to draw ... your filter").
   * Control: a model with a row on it is a different model.
   */
  it('29.095 the empties are ONE distinct model; a model with a row is another', () => {
    const serialised = [
      model([]),
      model(inWindow(), { filter: { assigneeIds: ['user_nobody'] } }),
      model(inWindow(), { laneEpicId: 'no_such_epic' }),
    ].map((m) => JSON.stringify(m));
    expect(new Set(serialised).size).toBe(1);
    expect(JSON.stringify(model(inWindow()))).not.toBe(serialised[0]);
    // The one sentence, EXACTLY (planner P20 class 2d: every other leg compares against the constant, so a reworded
    // constant would pass them all). "Off this chart", never "off these weeks": there are no weeks to be kept off.
    expect(model([]).emptyCopy).toBe(
      'No claimed dates are here to draw. Undated work is absent, not estimated. The timeline draws only the periods someone claimed. If a claim is here and not drawn, a narrowing kept it off this chart without dropping it: your filter, closed tickets being hidden, or an epic, which is drawn in the List and not here.',
    );
  });

  it('a timeline with anything on it has no empty sentence at all', () => {
    expect(model(inWindow()).emptyCopy).toBeNull();
    // A side-list entry is content too: the screen is not empty.
    expect(
      model([ticket({ fields: { title: claimField('Undated') } })]).emptyCopy,
    ).toBeNull();
  });

  /**
   * The wording is pinned against the case that would falsify a looser one: an
   * undated epic IS work, so a sentence saying "no work is here" would be
   * false. "No claimed dates are here to draw" is true of it and of `[]`.
   */
  it('a workspace holding only an undated epic reaches the honest-empty sentence', () => {
    const m = model([ticket({ id: 'epic_lonely', typeId: 'epic', fields: { title: claimField('Lonely lane') } })]);
    expect(m.groups).toEqual([]);
    expect(m.sideList).toEqual([]);
    expect(m.emptyCopy).toBe(TIMELINE_EMPTY_COPY);
  });
});

/**
 * 11.62 (NEW — Task 15 must carry this id into
 * test-cases/11-calendar-notifications.md).
 *
 * The undated-epic `continue` is the ONLY statement in the model that removes
 * a ticket from BOTH outputs on the grounds of what it IS rather than what it
 * claims, and it was witnessed on its TRUE branch only: widening the date test
 * to `||`, and dropping it entirely, both SURVIVED. Combined with 11.61's
 * missing `emptyCopy`, a vanished epic left nothing on screen explaining it.
 *
 * The behaviour below is the one chosen and now pinned: the guard fires only
 * when the epic has nothing to say. An epic that made a claim is treated like
 * any other ticket that made that claim.
 */
describe('11.62 the undated-epic skip fires only when the epic has nothing to say', () => {
  function epic(id: string, title: string, fields: Record<string, unknown> = {}): TicketDatesInput {
    return ticket({
      id,
      typeId: 'epic',
      fields: { title: claimField(title), ...fields } as TicketDatesInput['state']['fields'],
    });
  }

  function childOf(parentId: string, title: string): TicketDatesInput {
    return ticket({
      parentId,
      fields: {
        title: claimField(title),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
  }

  it('a HALF-dated epic is listed like any other half-dated ticket, and still heads its lane', () => {
    const m = model([epic('epic_half', 'Half dated', { startDate: claimField({ date: '2026-08-24' }) }), childOf('epic_half', 'Child')]);
    expect(m.sideList.map((entry) => [entry.ticketId, entry.reason])).toEqual([
      ['epic_half', 'start-only'],
    ]);
    expect(m.sideList[0]!.note).toBe("starts 24 Aug, Kiro's claim");
    // Being listed for a missing claim and naming a lane are different jobs.
    expect(m.groups.map((group) => [group.epicId, group.epicTitle])).toEqual([
      ['epic_half', 'Half dated'],
    ]);
    expect(m.groups[0]!.rows.map((row) => row.title)).toEqual(['Child']);
  });

  it('a FULLY dated epic gets a bar, inside its own lane', () => {
    const m = model([epic('epic_full', 'Fully dated', {
      startDate: claimField({ date: '2026-08-24' }),
      dueDate: claimField({ date: '2026-08-28' }),
    })]);
    expect(m.sideList).toEqual([]);
    expect(m.groups).toHaveLength(1);
    expect(m.groups[0]!.epicId).toBe('epic_full');
    expect(m.groups[0]!.rows.map((row) => row.ticketId)).toEqual(['epic_full']);
    expect([m.groups[0]!.rows[0]!.startDay, m.groups[0]!.rows[0]!.endDay]).toEqual([
      dayNumberOf('2026-08-24'),
      dayNumberOf('2026-08-28'),
    ]);
  });

  it('a TRULY undated epic is a lane and nothing else — neither a row nor missing work', () => {
    const m = model([epic('epic_bare', 'Bare lane'), childOf('epic_bare', 'Child')]);
    expect(m.sideList).toEqual([]);
    expect(m.groups.map((group) => [group.epicId, group.epicTitle])).toEqual([
      ['epic_bare', 'Bare lane'],
    ]);
    expect(m.groups[0]!.rows.map((row) => row.title)).toEqual(['Child']);
  });
});

/**
 * 13.1036 / 13.1037 — THE OWNER'S RULING (2026-09-20): *"epics should never
 * show up in the board, timeline and calendar views. they can only be in the
 * list views"*, extended the same day to the Backlog — *"only in the list
 * view."* The timeline's half is the one with two answers, and this pair is
 * written to keep them apart:
 *
 *   - the epic as a ROW — its own bar, its own side-list entry. GONE.
 *   - the epic as a LANE NAME — the heading above its children. STAYS.
 *
 * That is the shape the owner ruled for the Backlog's section headers in so
 * many words (*"Row only."*), and the lane survives HERE for a reason worth
 * stating: `byId` is built from the COMPLETE input set before `visible` narrows
 * it, so a lane reaches its name through `epicAncestorOf` on the CHILD, never
 * through the epic's own placement. Reaching the same outcome by dropping epics
 * from `inputs` would empty `byId`, move every child into "No epic" and delete
 * the heading — the drawn absence the ruling's own addendum forbids.
 */
describe('13.1036 hideEpicRows removes the epic\'s own bar and KEEPS the lane it names', () => {
  function epicBar(id: string, title: string, start: string, due: string): TicketDatesInput {
    return ticket({
      id,
      typeId: 'epic',
      fields: {
        title: claimField(title),
        startDate: claimField({ date: start }),
        dueDate: claimField({ date: due }),
      },
    });
  }

  function datedChild(id: string, parentId: string, title: string): TicketDatesInput {
    return ticket({
      id,
      parentId,
      fields: {
        title: claimField(title),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
  }

  it("drops the fully dated epic's row, and the child's lane is still titled with the epic", () => {
    const inputs = [
      epicBar('epic_1', 'The epic', '2026-08-17', '2026-08-21'),
      datedChild('child_1', 'epic_1', 'A child'),
    ];
    // CONTROL FIRST, same fixture, ONE word different: with the option absent
    // the epic draws its own bar — `epicAncestorOf` returns SELF for an epic,
    // so it lands in the lane it names.
    const drawn = model(inputs);
    expect(allRows(drawn).map((row) => row.ticketId).sort()).toEqual(['child_1', 'epic_1']);
    expect(drawn.groups).toHaveLength(1);
    expect(drawn.groups[0]!.epicTitle).toBe('The epic');

    const hidden = model(inputs, { hideEpicRows: true });
    expect(allRows(hidden).map((row) => row.ticketId)).toEqual(['child_1']);
    // THE HALF THAT STAYS — and the assertion is the TITLE, not merely that a
    // group exists: a lane falling back to `NO_EPIC_TITLE` would still be one
    // group, and would be the drawn absence this pair exists to forbid.
    expect(hidden.groups).toHaveLength(1);
    expect(hidden.groups[0]!.epicId).toBe('epic_1');
    expect(hidden.groups[0]!.epicTitle).toBe('The epic');
  });
});

describe('13.1037 hideEpicRows also takes a HALF-dated epic out of the side list', () => {
  it('a start-only epic is no longer listed as missing work, and its child still is', () => {
    const inputs = [
      ticket({
        id: 'epic_1',
        typeId: 'epic',
        fields: { title: claimField('The epic'), startDate: claimField({ date: '2026-08-18' }) },
      }),
      ticket({
        id: 'child_1',
        parentId: 'epic_1',
        fields: { title: claimField('A child'), dueDate: claimField({ date: '2026-08-20' }) },
      }),
    ];
    // CONTROL FIRST: a half-dated epic is listed like any other half-dated
    // ticket today (the `lane-heading` arm fires only for a TRULY undated
    // epic), so this arm is measuring the option and not an existing rule.
    const drawn = model(inputs);
    expect(drawn.sideList.map((entry) => entry.ticketId).sort()).toEqual(['child_1', 'epic_1']);

    const hidden = model(inputs, { hideEpicRows: true });
    // The side list is a list of WORK IN THIS VIEW, so an epic has no more
    // business in it than a bar does — the ruling names the view, not one of
    // its two outputs.
    expect(hidden.sideList.map((entry) => entry.ticketId)).toEqual(['child_1']);
    // And the truly-undated epic is STILL a lane even with the option on, which
    // is the one epic behaviour the option must not touch: it never drew a row
    // in the first place.
    const bare = model([ticket({ id: 'epic_bare', typeId: 'epic', fields: { title: claimField('Bare') } })], {
      hideEpicRows: true,
    });
    expect(bare.sideList).toEqual([]);
    expect(bare.groups).toEqual([]);
  });
});
