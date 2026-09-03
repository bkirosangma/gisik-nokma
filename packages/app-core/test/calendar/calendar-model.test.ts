import { describe, expect, it } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import { buildCalendarModel, type CalendarItem, type CalendarModel } from '../../src/calendar/calendar-model.js';

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string): string => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

/**
 * The SINGLE site that knows the landed `TicketState` shape. `kind: 'ticket'`
 * and `workflowVersion` are required fields the plan's builder predates; the
 * plan's own comment says to extend this builder rather than cast around them,
 * and an `as TicketState` that hid them would let the model compile against a
 * ticket the reducer never produces.
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

function allItems(model: CalendarModel): CalendarItem[] {
  return model.weeks.flatMap((week) => week.items);
}

function onlyItem(model: CalendarModel): CalendarItem {
  const items = allItems(model);
  expect(items).toHaveLength(1);
  return items[0]!;
}

const AUG = { year: 2026, month: 8 };

describe('11.1 the undated ticket is ABSENT (planted defect — invariant 4)', () => {
  it('a board of undated tickets renders an empty month that says why', () => {
    const model = buildCalendarModel([ticket(), ticket(), ticket()], { ...AUG, userName });
    expect(allItems(model)).toHaveLength(0);
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });
});

describe('11.2 the invented date is IMPOSSIBLE (planted defect — invariant 4)', () => {
  it('every rendered date exists verbatim among the planted claims', () => {
    const inputs = [
      ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-30' }) } }),
      ticket({ fields: { title: claimField('Start only'), startDate: claimField({ date: '2026-08-12' }) } }),
      ticket({
        fields: {
          title: claimField('Both'),
          startDate: claimField({ date: '2026-08-24', note: 'after the bank account opens' }, 'user_anselma'),
          dueDate: claimField({ date: '2026-08-30' }),
        },
      }),
      ticket(), // undated — must contribute nothing
    ];
    const planted = new Set(['2026-08-30', '2026-08-12', '2026-08-24']);
    const model = buildCalendarModel(inputs, { ...AUG, userName });
    const rendered = allItems(model).flatMap((item) =>
      item.kind === 'bar' ? [item.start, item.end] : [item.date],
    );
    expect(rendered.length).toBeGreaterThan(0);
    for (const date of rendered) expect(planted.has(date)).toBe(true);
  });

  it('11.3 a single-claim ticket is a marker, never a bar', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-30' }) } })],
      { ...AUG, userName },
    );
    expect(onlyItem(model).kind).toBe('marker');
  });

  it('11.2 a malformed built-in day claim puts nothing on the grid — absence beats a half-parsed day', () => {
    const model = buildCalendarModel(
      [
        ticket({ fields: { title: claimField('Slashes'), dueDate: claimField({ date: '30/08/2026' }) } }),
        ticket({ fields: { title: claimField('Bare string'), dueDate: claimField('2026-08-30') } }),
        ticket({ fields: { title: claimField('No date key'), dueDate: claimField({ note: 'GST' }) } }),
      ],
      { ...AUG, userName },
    );
    expect(allItems(model)).toHaveLength(0);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  it('11.4 start after due yields two attributed markers and NO bar — the contradiction is shown, not resolved', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('Contradictory'),
            startDate: claimField({ date: '2026-08-30' }),
            dueDate: claimField({ date: '2026-08-24' }, 'user_anselma'),
          },
        }),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.every((item) => item.kind === 'marker')).toBe(true);
    const markers = new Set(items.map((item) => (item.kind === 'marker' ? item.marker : '')));
    expect(markers).toEqual(new Set(['start', 'due']));
  });

  /**
   * The equal-day pair is the boundary between "a bar" and "two markers", and
   * `<` in place of `<=` moves it silently: a ticket claimed to start and be
   * needed on the same day would render as a contradiction nobody claimed.
   */
  it('11.6 a same-day start and due IS a bar — a one-day span, not a contradiction', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('One day'),
            startDate: claimField({ date: '2026-08-25' }),
            dueDate: claimField({ date: '2026-08-25' }),
          },
        }),
      ],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    expect(item.kind).toBe('bar');
    if (item.kind !== 'bar') throw new Error('expected a bar');
    expect(item.start).toBe('2026-08-25');
    expect(item.end).toBe('2026-08-25');
  });
});

describe('11.5 the attributed label is EXACT (planted defect — spec §7)', () => {
  it("a due marker carries the spec's example label, verbatim", () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('DLT'), dueDate: claimField({ date: '2026-08-30' }, 'user_kiro') } })],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    expect(item.kind).toBe('marker');
    if (item.kind === 'marker') {
      expect(item.label).toBe("needed by 30 Aug — Kiro's claim");
    }
  });

  it("11.5 a claim's note reaches the tooltip quoted, and a bar names both authors", () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('Both'),
            startDate: claimField({ date: '2026-08-24', note: 'after the bank account opens' }, 'user_anselma'),
            dueDate: claimField({ date: '2026-08-30' }),
          },
        }),
        ticket({
          fields: {
            title: claimField('Noted due'),
            dueDate: claimField({ date: '2026-08-11', note: 'GST filing' }, 'user_kiro'),
          },
        }),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    const bar = items.find((item) => item.kind === 'bar');
    if (bar === undefined || bar.kind !== 'bar') throw new Error('expected a bar');
    expect(bar.provenance).toBe(
      "starts 24 Aug — Anselma's claim · needed by 30 Aug — Kiro's claim",
    );
    const marker = items.find((item) => item.kind === 'marker');
    if (marker === undefined || marker.kind !== 'marker') throw new Error('expected a marker');
    expect(marker.tooltip).toBe(`needed by 11 Aug — Kiro's claim · "GST filing"`);
  });
});

describe('11.36–11.39 custom date-kind fields are claims like any other (owner sign-off 2026-08-20)', () => {
  const FILED_ON = [{ id: 'filed-on', name: 'Filed on' }];
  const INSPECTION = [{ id: 'inspection', name: 'Inspection date' }];

  it('11.36 PLANTED DEFECT: a custom date claim renders with its OWN field name and its OWN author', () => {
    const model = buildCalendarModel(
      [
        ticket(
          { fields: { title: claimField('GST return'), 'filed-on': claimField('2026-08-30', 'user_anselma') } },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    expect(item.kind).toBe('marker');
    if (item.kind !== 'marker') throw new Error('expected a marker');
    // The generic-word defect: labelling this "needed by …" or "date 30 Aug"
    // loses the only thing that says what the day MEANS.
    expect(item.label).toBe("Filed on: 30 Aug — Anselma's claim");
    expect(item.marker).toBe('custom');
    expect(item.fieldId).toBe('filed-on');
    expect(item.fieldName).toBe('Filed on');
    expect(item.claim.actorId).toBe('user_anselma');
    expect(item.date).toBe('2026-08-30');
    // and the roster the legend reads names it too
    expect(model.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 1 }]);
  });

  it('11.37 PLANTED DEFECT: an UNCLAIMED custom date field puts nothing on the calendar', () => {
    // The field is defined on the type; nobody filled it in. A defect that
    // emitted a placeholder marker (or borrowed the due date for it) shows up
    // here as an item where there must be none.
    const model = buildCalendarModel([ticket({ fields: { title: claimField('Never filed') } }, [], FILED_ON)], {
      ...AUG,
      userName,
    });
    expect(allItems(model)).toHaveLength(0);
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    expect(model.customDateFields).toEqual([]); // an unclaimed field earns no legend entry either
  });

  it('11.37 a malformed stored custom value is skipped, never half-parsed onto a day', () => {
    const model = buildCalendarModel(
      [
        ticket(
          { fields: { title: claimField('Garbled'), 'filed-on': claimField('30/08/2026') } },
          [],
          FILED_ON,
        ),
        ticket({ fields: { title: claimField('Object-shaped'), inspection: claimField({ date: '2026-08-12' }) } }, [], INSPECTION),
      ],
      { ...AUG, userName },
    );
    expect(allItems(model)).toHaveLength(0);
    expect(model.customDateFields).toEqual([]);
  });

  it('11.38 NO span is invented between a custom date and a built-in day claim', () => {
    const model = buildCalendarModel(
      [
        ticket(
          {
            fields: {
              title: claimField('Inspection then due'),
              inspection: claimField('2026-08-12'),
              dueDate: claimField({ date: '2026-08-30' }),
            },
          },
          [],
          INSPECTION,
        ),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.every((item) => item.kind === 'marker')).toBe(true);
    expect(items).toHaveLength(2); // two markers, never one bar spanning 12→30 Aug
  });

  it('11.38 a bar STILL requires the start+due pair, and custom claims ride alongside it as markers', () => {
    const model = buildCalendarModel(
      [
        ticket(
          {
            fields: {
              title: claimField('Fully dated'),
              startDate: claimField({ date: '2026-08-24' }),
              dueDate: claimField({ date: '2026-08-28' }),
              'filed-on': claimField('2026-08-26'),
            },
          },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName },
    );
    const items = allItems(model);
    expect(items.filter((item) => item.kind === 'bar')).toHaveLength(1);
    expect(items.filter((item) => item.kind === 'marker' && item.marker === 'custom')).toHaveLength(1);
  });

  it('11.38 a custom field id that shadows a built-in cannot put one claim on the grid twice', () => {
    // `ticketTypeDefSchema` already refuses this id upstream ("shadows a
    // built-in field"); this proves the view-model does not depend on that
    // refusal — the two readers accept disjoint value SHAPES.
    const model = buildCalendarModel(
      [
        ticket(
          { fields: { title: claimField('Shadowed'), dueDate: claimField({ date: '2026-08-30' }) } },
          [],
          [{ id: 'dueDate', name: 'Due date' }],
        ),
      ],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.marker).toBe('due');
    expect(model.customDateFields).toEqual([]);
  });

  it('11.39 the legend switch hides a field without erasing its own switch — arrangement, not data', () => {
    const inputs = [
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], FILED_ON),
      ticket({ fields: { title: claimField('Two'), 'filed-on': claimField('2026-08-18') } }, [], FILED_ON),
    ];
    const shown = buildCalendarModel(inputs, { ...AUG, userName });
    expect(allItems(shown)).toHaveLength(2);
    expect(shown.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 2 }]);

    const hidden = buildCalendarModel(inputs, { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] });
    expect(allItems(hidden)).toHaveLength(0);
    // the tally is computed before hiding, so the switch is still there to flip back
    expect(hidden.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 2 }]);
  });

  /**
   * 11.49 (NEW — Task 15 must carry this id into
   * test-cases/11-calendar-notifications.md). The plan's model reached for the
   * empty-month copy here, which tells a viewer "no claimed dates fall in this
   * month" about claims they hid themselves one switch ago.
   */
  it('11.49 an all-hidden month says the field is HIDDEN, not that nothing was claimed', () => {
    const inputs = [
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], FILED_ON),
    ];
    const hidden = buildCalendarModel(inputs, { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] });
    expect(hidden.hasItems).toBe(false);
    expect(hidden.emptyCopy).toBe(CALENDAR_ALL_HIDDEN_COPY);
    expect(hidden.emptyCopy).not.toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  it('11.49 hiding a field that claimed nothing IN THIS GRID leaves the honest empty copy alone', () => {
    const bare = buildCalendarModel([ticket()], { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] });
    expect(bare.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    // The hidden field IS claimed — in October. This month is empty because
    // nobody claimed a date in it, and saying "you hid these" would be the
    // mirror image of the lie the other sentence exists to prevent.
    const elsewhere = buildCalendarModel(
      [ticket({ fields: { title: claimField('October'), 'filed-on': claimField('2026-10-02') } }, [], FILED_ON)],
      { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(elsewhere.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  it('11.36 a custom claim carries NO note, so its tooltip is exactly its label', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('GST'), 'filed-on': claimField('2026-08-30') } }, [], FILED_ON)],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.tooltip).toBe(item.label);
    expect(item.tooltip).toBe("Filed on: 30 Aug — Kiro's claim");
    expect(item.tooltip).not.toContain('"');
  });

  it('11.8 a pending custom claim stays visibly in transit', () => {
    const model = buildCalendarModel(
      [
        ticket(
          { fields: { title: claimField('In flight'), 'filed-on': claimField('2026-08-11') } },
          ['filed-on'],
          FILED_ON,
        ),
      ],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.claim.pending).toBe(true);
  });
});

describe('11.6–11.8 bars, weeks, filters, pending', () => {
  it('11.6 a start→due pair renders one bar per week row it crosses, clamped to the row', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: {
            title: claimField('Spans two weeks'),
            startDate: claimField({ date: '2026-08-20' }),
            dueDate: claimField({ date: '2026-08-25' }),
          },
        }),
      ],
      { ...AUG, userName },
    );
    // 20 Aug (Thu) sits in the 17–23 row; 25 Aug (Tue) in the 24–30 row.
    const rows = model.weeks.filter((week) => week.items.length > 0).map((week) => week.days[0]);
    expect(rows).toEqual(['2026-08-17', '2026-08-24']);
  });

  it('11.6 a claim outside the rendered grid appears nowhere — and is not clamped into it', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('October'), dueDate: claimField({ date: '2026-10-02' }) } })],
      { ...AUG, userName },
    );
    expect(allItems(model)).toHaveLength(0);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  it('11.7 the lane and assignee filters narrow what renders; filtering is arrangement, not data', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('The epic') } });
    const inLane = ticket({
      parentId: 'epic1',
      assigneeId: 'user_anselma',
      fields: { title: claimField('In lane'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const outOfLane = ticket({
      fields: { title: claimField('Out of lane'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const laneModel = buildCalendarModel([epic, inLane, outOfLane], { ...AUG, userName, laneEpicId: 'epic1' });
    expect(allItems(laneModel)).toHaveLength(1);
    const assigneeModel = buildCalendarModel([epic, inLane, outOfLane], {
      ...AUG,
      userName,
      filter: { assigneeIds: ['user_anselma'] },
    });
    expect(allItems(assigneeModel)).toHaveLength(1);
  });

  it("11.7 a lane keyed on a workspace's OWN rank-1 type needs the shell's predicate — and takes it", () => {
    const initiative = ticket({ id: 'init1', typeId: 'initiative', fields: { title: claimField('The initiative') } });
    const child = ticket({
      parentId: 'init1',
      fields: { title: claimField('Under it'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const withDefault = buildCalendarModel([initiative, child], { ...AUG, userName, laneEpicId: 'init1' });
    expect(allItems(withDefault)).toHaveLength(0); // narrower than the truth, by construction
    const withRoster = buildCalendarModel([initiative, child], {
      ...AUG,
      userName,
      laneEpicId: 'init1',
      isEpicType: (typeId) => typeId === 'initiative',
    });
    expect(allItems(withRoster)).toHaveLength(1);
  });

  it('11.7 a due-bound filter matches the server: inclusive, and undated work is excluded', () => {
    const inputs = [
      ticket({ fields: { title: claimField('On the bound'), dueDate: claimField({ date: '2026-08-20' }) } }),
      ticket({ fields: { title: claimField('After it'), dueDate: claimField({ date: '2026-08-28' }) } }),
      ticket({ fields: { title: claimField('Undated') } }),
    ];
    const model = buildCalendarModel(inputs, { ...AUG, userName, filter: { dueBefore: '2026-08-20' } });
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.date).toBe('2026-08-20');
  });

  it('11.7 a field-clause filter narrows on the claimed value', () => {
    const inputs = [
      ticket({ fields: { title: claimField('Bengaluru'), office: claimField('BLR'), dueDate: claimField({ date: '2026-08-14' }) } }),
      ticket({ fields: { title: claimField('Tura'), office: claimField('TUR'), dueDate: claimField({ date: '2026-08-14' }) } }),
    ];
    const model = buildCalendarModel(inputs, { ...AUG, userName, filter: { fields: { office: 'BLR' } } });
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.title).toBe('Bengaluru');
  });

  /**
   * The order is part of the answer: the same claims must land in the same
   * sequence on every render, or a re-fetch reshuffles a viewer's month for no
   * reason they can see. Bars first, then by day, then by ticket, then by
   * WHICH claim — the last tie-break is what keeps two claims of one ticket on
   * one day from swapping.
   */
  it('11.6 the row order is total and stable — bars first, then day, ticket, claim', () => {
    const contradictory = ticket({
      id: 't_a',
      fields: {
        title: claimField('Contradictory'),
        startDate: claimField({ date: '2026-08-19' }),
        dueDate: claimField({ date: '2026-08-18' }),
      },
    });
    const spanning = ticket({
      id: 't_b',
      fields: {
        title: claimField('Spanning'),
        startDate: claimField({ date: '2026-08-18' }),
        dueDate: claimField({ date: '2026-08-20' }),
      },
    });
    const custom = ticket(
      { id: 't_a', fields: { title: claimField('Custom too'), 'filed-on': claimField('2026-08-19') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const model = buildCalendarModel([contradictory, spanning, custom], { ...AUG, userName });
    const week = model.weeks.find((row) => row.days[0] === '2026-08-17');
    if (week === undefined) throw new Error('expected the 17–23 Aug row');
    expect(
      week.items.map((item) =>
        item.kind === 'bar' ? `bar:${item.ticketId}` : `${item.marker}:${item.ticketId}:${item.date}`,
      ),
    ).toEqual([
      'bar:t_b',
      'due:t_a:2026-08-18',
      'custom:t_a:2026-08-19',
      'start:t_a:2026-08-19',
    ]);
  });

  it('11.6 two tickets claiming the same day are ordered by ticket id, not by arrival', () => {
    const later = ticket({ id: 't_zulu', fields: { title: claimField('Zulu'), dueDate: claimField({ date: '2026-08-19' }) } });
    const earlier = ticket({ id: 't_alpha', fields: { title: claimField('Alpha'), dueDate: claimField({ date: '2026-08-19' }) } });
    const model = buildCalendarModel([later, earlier], { ...AUG, userName });
    expect(allItems(model).map((item) => item.ticketId)).toEqual(['t_alpha', 't_zulu']);
  });

  it('11.39 the legend is sorted by field NAME and bounded by the GRID, not by the roster', () => {
    const FIELDS = [
      { id: 'zeta', name: 'Zeta check' }, // declared first, sorts second
      { id: 'alpha', name: 'Alpha check' },
      { id: 'elsewhere', name: 'Elsewhere' },
    ];
    const model = buildCalendarModel(
      [
        ticket(
          {
            fields: {
              title: claimField('Three custom claims'),
              zeta: claimField('2026-08-11'),
              alpha: claimField('2026-08-12'),
              // outside the rendered grid entirely ('2026-07-27' … '2026-09-06')
              elsewhere: claimField('2026-10-02'),
            },
          },
          [],
          FIELDS,
        ),
      ],
      { ...AUG, userName },
    );
    expect(model.customDateFields).toEqual([
      { fieldId: 'alpha', fieldName: 'Alpha check', count: 1 },
      { fieldId: 'zeta', fieldName: 'Zeta check', count: 1 },
    ]);
    expect(allItems(model)).toHaveLength(2); // the October claim is nowhere on this grid
  });

  it('11.8 a pending claim stays visibly in transit through the model', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Pending'), dueDate: claimField({ date: '2026-08-28' }) } }, ['dueDate'])],
      { ...AUG, userName },
    );
    const item = onlyItem(model);
    if (item.kind !== 'marker') throw new Error('expected a marker');
    expect(item.claim.pending).toBe(true);
  });
});
