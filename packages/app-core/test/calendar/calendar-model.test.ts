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
      expect(item.label).toBe("needed by 30 Aug, Kiro's claim");
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
      "starts 24 Aug, Anselma's claim; needed by 30 Aug, Kiro's claim",
    );
    const marker = items.find((item) => item.kind === 'marker');
    if (marker === undefined || marker.kind !== 'marker') throw new Error('expected a marker');
    expect(marker.tooltip).toBe(`needed by 11 Aug, Kiro's claim. "GST filing"`);
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
    expect(item.label).toBe("Filed on: 30 Aug, Anselma's claim");
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
    expect(item.tooltip).toBe("Filed on: 30 Aug, Kiro's claim");
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
  /**
   * The NAME used to say "clamped to the row", and nothing here clamps: a
   * `CalendarBar` carries the full claimed `start`/`end` and the SAME object
   * appears in every row it touches. Clamping a bar to a row's edges is the
   * component's geometry (Task 9), and a reader grepping for its witness must
   * not stop here.
   */
  it('11.6 a start→due pair appears in every week row it crosses, carrying the full span', () => {
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
    // UNCLAMPED, said as an assertion: both rows carry the same untruncated span.
    for (const week of model.weeks.filter((row) => row.items.length > 0)) {
      const bar = week.items[0];
      if (bar === undefined || bar.kind !== 'bar') throw new Error('expected a bar in every occupied row');
      expect([bar.start, bar.end]).toEqual(['2026-08-20', '2026-08-25']);
    }
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

/**
 * 11.50 (NEW — Task 15 must carry this id into
 * test-cases/11-calendar-notifications.md).
 *
 * The review that asked for this block put it exactly right: the lie fixed at
 * one door was left standing at two others. `visible` is narrowed by the
 * filter and the lane BEFORE any item is built, so a month whose every claim
 * belongs to filtered-out work printed "No claimed dates fall in this month"
 * about a month full of claimed dates — the same sentence, the same lie, a
 * different door.
 *
 * ⚠ **REWRITTEN 2026-09-20, AND THE GATE IS THE HALF THAT SURVIVED.** The
 * sentence this block was built around — `CALENDAR_NARROWED_MONTH_COPY`, which
 * named "the filter, the LANE, or the legend" — was deleted on the owner's
 * ruling (*"delete the copy"*); no app could render it, and "lane" names a
 * control no screen shows. The reachable sentence now names the narrowing set
 * itself (case 16.45, 11.1), so the FILTER arm reaches `CALENDAR_EMPTY_MONTH_COPY`
 * rather than a sentence of its own.
 *
 * **What did NOT change is the exhaustivity gate**, and it is the reason this
 * block still exists: `CALENDAR_ALL_HIDDEN_COPY` says "EVERY claimed date in
 * this month belongs to a field you have hidden", which a filter makes false.
 * `narrowedOutOfGrid` still guards it, so the both-case below still asserts
 * `CALENDAR_ALL_HIDDEN_COPY` is NOT reached. Deleting the constant did not
 * require deleting the door, and this block is what says so.
 */
describe('11.50 the empty month names the narrowing, and only the legend may claim all of it', () => {
  const FILED_ON = [{ id: 'filed-on', name: 'Filed on' }];

  function augustPair(): TicketDatesInput[] {
    return [
      ticket({ fields: { title: claimField('First'), dueDate: claimField({ date: '2026-08-11' }) } }),
      ticket({ fields: { title: claimField('Second'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ];
  }

  it('a month emptied by a FILTER names the filter, and does not claim nobody claimed a date', () => {
    const model = buildCalendarModel(augustPair(), {
      ...AUG,
      userName,
      filter: { assigneeIds: ['user_nobody'] },
    });
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    // The property, not just the constant: the sentence a filtered viewer
    // reaches has to name the control that would bring the claims back.
    expect(model.emptyCopy).toContain('your filter');
    expect(model.emptyCopy).not.toBe(CALENDAR_ALL_HIDDEN_COPY);
  });

  it('a month emptied by a LANE reaches the same sentence — the door outlives the copy', () => {
    const model = buildCalendarModel(augustPair(), { ...AUG, userName, laneEpicId: 'no_such_epic' });
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  /**
   * The mirror image, and it is the same discipline the all-hidden sentence
   * already keeps: a filter that removed nothing FROM THIS GRID has not
   * emptied this month, and blaming it would be its own small lie.
   */
  it('a filter that removed nothing from THIS grid leaves the honest-empty sentence alone', () => {
    const model = buildCalendarModel(
      [
        ticket({ fields: { title: claimField('October'), dueDate: claimField({ date: '2026-10-02' }), office: claimField('TUR') } }),
        ticket({ fields: { title: claimField('Undated'), office: claimField('BLR') } }),
      ],
      { ...AUG, userName, filter: { fields: { office: 'BLR' } } },
    );
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
  });

  /**
   * The narrowing must be measured against THE GRID, not the calendar month: a
   * filtered-out claim on 6 Sep is a claim on a cell this month view renders,
   * and a `date.slice(0, 7) === monthKey` shortcut here would rebuild the very
   * off-by-a-week 11.51 exists to close — telling a viewer nothing was claimed
   * while their filter hides a marker from a rendered September cell.
   *
   * ⚠ **RE-AIMED 2026-09-20, AND THE RE-AIMING IS THE POINT.** While a
   * dedicated narrowed sentence existed, "EMPTY was reached" WAS the assertion
   * that discriminated. That sentence is deleted (owner ruling), so the filter
   * arm and an empty month now BOTH reach `CALENDAR_EMPTY_MONTH_COPY` and the
   * old expectation would have passed whatever the guard did — a check that
   * cannot fail. The discriminating outcome is now the one the guard still
   * buys: with a hidden field holding an in-grid claim, `CALENDAR_ALL_HIDDEN_COPY`
   * is the alternative, and the padding-cell claim is the only thing keeping
   * the model off it.
   */
  it('a claim filtered out of a PADDING cell counts as narrowed away, not as an empty month', () => {
    const model = buildCalendarModel(
      [
        // In-grid, hidden by the legend: this is what makes ALL_HIDDEN reachable.
        ticket(
          {
            fields: {
              title: claimField('Hidden but kept'),
              office: claimField('BLR'),
              'filed-on': claimField('2026-08-11'),
            },
          },
          [],
          FILED_ON,
        ),
        // Off-month but ON a rendered padding cell, and filtered out.
        ticket({ fields: { title: claimField('Padding cell'), office: claimField('TUR'), dueDate: claimField({ date: '2026-09-06' }) } }),
      ],
      { ...AUG, userName, filter: { fields: { office: 'BLR' } }, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    expect(model.emptyCopy).not.toBe(CALENDAR_ALL_HIDDEN_COPY);
  });

  /**
   * THE EXHAUSTIVITY GATE. `CALENDAR_ALL_HIDDEN_COPY` says "EVERY claimed date
   * in this month belongs to a field you have hidden"; with a filter also
   * removing an August claim that no hidden field owns, that sentence is
   * false. Reaching for it here would be a fourth instance of the very defect
   * this block exists to close — so the sentence that names the set of
   * narrowings instead of picking one carries the both-case. That sentence is
   * `CALENDAR_EMPTY_MONTH_COPY` since 2026-09-20; the GATE is unchanged.
   */
  it('a month narrowed by BOTH a filter and the legend does not claim the legend did all of it', () => {
    const model = buildCalendarModel(
      [
        ticket({
          fields: { title: claimField('Hidden but kept'), office: claimField('BLR'), 'filed-on': claimField('2026-08-11') },
        }, [], FILED_ON),
        ticket({ fields: { title: claimField('Filtered away'), office: claimField('TUR'), dueDate: claimField({ date: '2026-08-28' }) } }),
      ],
      { ...AUG, userName, filter: { fields: { office: 'BLR' } }, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    expect(model.emptyCopy).not.toBe(CALENDAR_ALL_HIDDEN_COPY);
    // and the switch is still on screen, so the legend half stays reversible
    expect(model.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 1 }]);
  });

  it('a filter that excludes nobody still lets the all-hidden sentence stand', () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Kept'), office: claimField('BLR'), 'filed-on': claimField('2026-08-11') } }, [], FILED_ON)],
      { ...AUG, userName, filter: { fields: { office: 'BLR' } }, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(model.emptyCopy).toBe(CALENDAR_ALL_HIDDEN_COPY);
  });
});

/**
 * 11.51 (NEW — Task 15 must carry this id into
 * test-cases/11-calendar-notifications.md).
 *
 * The grid the month view RENDERS is `2026-07-27 … 2026-09-06` — six days of
 * July and six of September are real cells with real markers in them. Every
 * bound in this file was previously witnessed only by a claim planted on
 * `2026-10-02`, twenty-six days past the edge, so nothing bit: restricting the
 * week filter to the calendar month, or moving any of the three grid bounds by
 * one day, left the whole suite green while a claimed date vanished from a
 * rendered cell.
 */
describe('11.51 the grid edges — the padding days are cells, and every bound is closed', () => {
  const EDGE_FIELD = [{ id: 'filed-on', name: 'Filed on' }];

  function rowsWith(model: CalendarModel, match: (item: CalendarItem) => boolean): string[] {
    return model.weeks.filter((week) => week.items.some(match)).map((week) => week.days[0]);
  }

  function renderedDates(model: CalendarModel): string[] {
    return allItems(model).flatMap((item) => (item.kind === 'bar' ? [item.start, item.end] : [item.date]));
  }

  it('the grid really does run 27 Jul … 6 Sep — the fixtures below cannot drift from the helper', () => {
    const model = buildCalendarModel([], { ...AUG, userName });
    expect(model.weeks).toHaveLength(6);
    const firstRow = model.weeks[0];
    const lastRow = model.weeks[model.weeks.length - 1];
    if (firstRow === undefined || lastRow === undefined) throw new Error('expected six grid rows');
    expect(firstRow.days[0]).toBe('2026-07-27');
    expect(lastRow.days[6]).toBe('2026-09-06');
  });

  it('a marker on either PADDING edge renders in its cell; one day further out renders nowhere', () => {
    const model = buildCalendarModel(
      [
        ticket({ fields: { title: claimField('First cell'), dueDate: claimField({ date: '2026-07-27' }) } }),
        ticket({ fields: { title: claimField('Last cell'), dueDate: claimField({ date: '2026-09-06' }) } }),
        ticket({ fields: { title: claimField('Day before the grid'), dueDate: claimField({ date: '2026-07-26' }) } }),
        ticket({ fields: { title: claimField('Day after the grid'), dueDate: claimField({ date: '2026-09-07' }) } }),
      ],
      { ...AUG, userName },
    );
    // Exactly the two edge days, and by value — a week filter narrowed to the
    // calendar month drops both while every other assertion in this file holds.
    expect(renderedDates(model).sort()).toEqual(['2026-07-27', '2026-09-06']);
    expect(rowsWith(model, (item) => item.kind === 'marker' && item.date === '2026-07-27')).toEqual([
      '2026-07-27',
    ]);
    expect(rowsWith(model, (item) => item.kind === 'marker' && item.date === '2026-09-06')).toEqual([
      '2026-08-31',
    ]);
  });

  it("a marker on an interior row's FIRST day belongs to that row, not the one before it", () => {
    const model = buildCalendarModel(
      [ticket({ fields: { title: claimField('Row opener'), dueDate: claimField({ date: '2026-08-17' }) } })],
      { ...AUG, userName },
    );
    expect(rowsWith(model, (item) => item.kind === 'marker')).toEqual(['2026-08-17']);
  });

  it('a bar touching a row by exactly one day still appears in it, at both ends of the row', () => {
    const endsOnRowStart = ticket({
      id: 't_ends',
      fields: { title: claimField('Ends on the row opener'), startDate: claimField({ date: '2026-08-10' }), dueDate: claimField({ date: '2026-08-17' }) },
    });
    const startsOnRowEnd = ticket({
      id: 't_starts',
      fields: { title: claimField('Starts on the row closer'), startDate: claimField({ date: '2026-08-23' }), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const model = buildCalendarModel([endsOnRowStart, startsOnRowEnd], { ...AUG, userName });
    // `end >= first` — one day of overlap with the 17–23 row is still overlap.
    expect(rowsWith(model, (item) => item.ticketId === 't_ends')).toEqual(['2026-08-10', '2026-08-17']);
    // `start <= last` — the mirror bound, on the same row.
    expect(rowsWith(model, (item) => item.ticketId === 't_starts')).toEqual(['2026-08-17', '2026-08-24']);
  });

  it('a bar that only overlaps the padding week renders there; one entirely off the grid renders nowhere', () => {
    const model = buildCalendarModel(
      [
        ticket({
          id: 't_july',
          fields: { title: claimField('Into the grid'), startDate: claimField({ date: '2026-07-24' }), dueDate: claimField({ date: '2026-07-28' }) },
        }),
        ticket({
          id: 't_before',
          fields: { title: claimField('Wholly before'), startDate: claimField({ date: '2026-07-20' }), dueDate: claimField({ date: '2026-07-24' }) },
        }),
        ticket({
          id: 't_after',
          fields: { title: claimField('Wholly after'), startDate: claimField({ date: '2026-09-07' }), dueDate: claimField({ date: '2026-09-10' }) },
        }),
      ],
      { ...AUG, userName },
    );
    expect(rowsWith(model, (item) => item.ticketId === 't_july')).toEqual(['2026-07-27']);
    expect(allItems(model).map((item) => item.ticketId)).toEqual(['t_july']);
  });

  /**
   * The LEGEND's bounds, which the model's own docblock states as an
   * invariant: "A switch always corresponds to something on screen, and
   * everything on screen has a switch." A tally bound moved by one day breaks
   * it in the direction nobody looks — the marker renders on the padding day
   * and the switch that hides it is missing from the legend.
   */
  it('the legend counts claims on BOTH padding edges, and nothing one day outside them', () => {
    const model = buildCalendarModel(
      [
        ticket({ fields: { title: claimField('On the first cell'), 'filed-on': claimField('2026-07-27') } }, [], EDGE_FIELD),
        ticket({ fields: { title: claimField('On the last cell'), 'filed-on': claimField('2026-09-06') } }, [], EDGE_FIELD),
        ticket({ fields: { title: claimField('One day before'), 'filed-on': claimField('2026-07-26') } }, [], EDGE_FIELD),
        ticket({ fields: { title: claimField('One day after'), 'filed-on': claimField('2026-09-07') } }, [], EDGE_FIELD),
      ],
      { ...AUG, userName },
    );
    expect(model.customDateFields).toEqual([{ fieldId: 'filed-on', fieldName: 'Filed on', count: 2 }]);
    expect(allItems(model)).toHaveLength(2);
  });

  it('an all-hidden month is still all-hidden when its only claim sits on a padding edge', () => {
    for (const day of ['2026-07-27', '2026-09-06']) {
      const model = buildCalendarModel(
        [ticket({ fields: { title: claimField(`Edge ${day}`), 'filed-on': claimField(day) } }, [], EDGE_FIELD)],
        { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] },
      );
      expect(model.hasItems).toBe(false);
      expect(model.emptyCopy, `hidden claim on ${day}`).toBe(CALENDAR_ALL_HIDDEN_COPY);
    }
  });

  it('a hidden claim ONE DAY outside the grid does not borrow the all-hidden sentence', () => {
    for (const day of ['2026-07-26', '2026-09-07']) {
      const model = buildCalendarModel(
        [ticket({ fields: { title: claimField(`Outside ${day}`), 'filed-on': claimField(day) } }, [], EDGE_FIELD)],
        { ...AUG, userName, hiddenCustomFieldIds: ['filed-on'] },
      );
      expect(model.emptyCopy, `hidden claim on ${day}`).toBe(CALENDAR_EMPTY_MONTH_COPY);
    }
  });
});

/**
 * 13.1034 / 13.1035 — THE OWNER'S RULING (2026-09-20): *"epics should never
 * show up in the board, timeline and calendar views. they can only be in the
 * list views"*, extended the same day to the Backlog — *"only in the list
 * view."* `hideEpicRows` is how a SHELL says which surface it is drawing; the
 * model cannot know it, and the List's own answer is the opposite one.
 */
describe('13.1034 hideEpicRows removes the epic\'s own claims, and only its own', () => {
  it("drops the rank-1 ticket's bar, keeps its child's, and draws both with the option absent", () => {
    const inputs = [
      ticket({
        id: 'epic_1',
        typeId: 'epic',
        fields: {
          title: claimField('The epic'),
          startDate: claimField({ date: '2026-08-03' }),
          dueDate: claimField({ date: '2026-08-07' }),
        },
      }),
      ticket({
        id: 'child_1',
        parentId: 'epic_1',
        fields: { title: claimField('A child'), dueDate: claimField({ date: '2026-08-20' }) },
      }),
    ];
    // THE CONTROL RUNS FIRST AND FROM THE SAME FIXTURE, because the arm below
    // and the arm above differ in ONE word: with the option absent the epic
    // draws, so what the second assertion measures is the OPTION and not the
    // fixture. (A control that could not have failed proves nothing.)
    expect(
      allItems(buildCalendarModel(inputs, { ...AUG, userName }))
        .map((item) => item.ticketId)
        .sort(),
    ).toEqual(['child_1', 'epic_1']);

    const hidden = buildCalendarModel(inputs, { ...AUG, userName, hideEpicRows: true });
    expect(allItems(hidden).map((item) => item.ticketId)).toEqual(['child_1']);
    // The child still draws — this is a cut of the EPIC's claims, not of its
    // subtree, and a model that took the children with it would have inverted
    // the ruling's own "the child still says which epic it belongs to".
    expect(hidden.hasItems).toBe(true);
  });

  /**
   * AND IT READS THE VIEW'S OWN PREDICATE, never a name or an id —
   * `epic-ancestor.ts`'s whole argument, and the reason the option sits beside
   * `isEpicType` rather than testing `typeId === 'epic'` for itself.
   */
  it('removes a RENAMED rank-1 type only when the shell says that type is the epic', () => {
    const inputs = [
      ticket({
        id: 'init_1',
        typeId: 'initiative',
        fields: { title: claimField('Initiative'), dueDate: claimField({ date: '2026-08-09' }) },
      }),
    ];
    // The built-in default cannot name it, so the claim survives — narrower
    // than the truth, which is the direction `isBuiltinEpicType` documents.
    expect(
      allItems(buildCalendarModel(inputs, { ...AUG, userName, hideEpicRows: true })).map(
        (item) => item.ticketId,
      ),
    ).toEqual(['init_1']);
    // The workspace's own rank-1 predicate names it, and it goes.
    expect(
      allItems(
        buildCalendarModel(inputs, {
          ...AUG,
          userName,
          hideEpicRows: true,
          isEpicType: (typeId) => typeId === 'initiative',
        }),
      ),
    ).toEqual([]);
  });
});

describe('13.1035 a hidden epic counts as a NARROWING, so the exhaustivity gate still fires', () => {
  const FILED_ON = [{ id: 'filed-on', name: 'Filed on' }];

  /**
   * The epic's claim is INSIDE this grid, so removing the epic has really taken
   * a claim off the month. `CALENDAR_ALL_HIDDEN_COPY` claims every claimed date
   * in the month belongs to a hidden field — false here, because one belonged
   * to an epic. Joining `visible` puts the removed epic into `excluded`, where
   * `narrowedOutOfGrid` sees it and gates that sentence off: the conservative
   * direction, and the same one a filter already takes.
   */
  it('a grid emptied only by hideEpicRows never reaches CALENDAR_ALL_HIDDEN_COPY', () => {
    const model = buildCalendarModel(
      [
        ticket({
          id: 'epic_1',
          typeId: 'epic',
          fields: { title: claimField('In-grid epic'), dueDate: claimField({ date: '2026-08-05' }) },
        }),
        // In-grid and hidden by the legend: this is what makes ALL_HIDDEN
        // reachable at all, exactly as case 11.50's padding-cell arm does it.
        ticket(
          {
            id: 'child_1',
            parentId: 'epic_1',
            fields: { title: claimField('Hidden but kept'), 'filed-on': claimField('2026-08-11') },
          },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName, hideEpicRows: true, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_EMPTY_MONTH_COPY);
    expect(model.emptyCopy).not.toBe(CALENDAR_ALL_HIDDEN_COPY);
  });

  /**
   * THE CONTROL, and the ONE term that differs from the arm above is the epic's
   * own date: moved to October, so nothing the option removed touches THIS
   * grid. Now the legend really IS the only cause of the emptiness, and the
   * exhaustive sentence becomes TRUE — which is what proves the arm above was
   * being held off by the epic rather than by the fixture being unable to reach
   * the sentence at all.
   */
  it('CONTROL — the SAME fixture with the epic\'s claim off this grid DOES reach it', () => {
    const model = buildCalendarModel(
      [
        ticket({
          id: 'epic_1',
          typeId: 'epic',
          fields: { title: claimField('Out-of-grid epic'), dueDate: claimField({ date: '2026-10-02' }) },
        }),
        ticket(
          {
            id: 'child_1',
            parentId: 'epic_1',
            fields: { title: claimField('Hidden but kept'), 'filed-on': claimField('2026-08-11') },
          },
          [],
          FILED_ON,
        ),
      ],
      { ...AUG, userName, hideEpicRows: true, hiddenCustomFieldIds: ['filed-on'] },
    );
    expect(model.hasItems).toBe(false);
    expect(model.emptyCopy).toBe(CALENDAR_ALL_HIDDEN_COPY);
  });
});
