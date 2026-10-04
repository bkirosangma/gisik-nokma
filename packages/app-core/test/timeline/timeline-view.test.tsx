import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { KEY_GAP_PX } from '@gisik-nokma/viewport';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
  barProvenance,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  startClaimLabel,
  unplaceableDayCopy,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import type { IsEpicType } from '../../src/hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../../src/view-types.js';
import { NO_DATES_NOTE, NO_DAY_CLAIMS_NOTE } from '../../src/timeline/timeline-model.js';
import { dayNumberOf, isoDayOf } from '../../src/timeline/timeline-days.js';
import { TimelineView } from '../../src/timeline/timeline-view.js';

/**
 * 11.73–11.81 and 29.097–29.105 — `TimelineView`, one continuous day axis over
 * the model (11.74, 11.79 and 11.82 retired with the week columns in Workflow
 * and Timeline graphs Part 1 T9).
 *
 * THE EXPECTED STRINGS ARE NEVER HAND-TYPED. Every label, note and empty
 * sentence is composed by importing the function or constant the model uses,
 * because this suite's question is not "what does a claim label say" — that is
 * pinned one layer down, at `claim-labels.test.ts` 11.5 "the label is EXACT"
 * — but "did the component pass the model's string through unaltered". A
 * hand-typed copy here would be a second spelling of the product's words, free
 * to drift from the one the model prints, and a typo in it would look like a
 * component defect.
 *
 * EVERY CONDITIONAL AFFORDANCE IS ASSERTED IN BOTH DIRECTIONS — a goal, and
 * the first version of this file claimed it as a fact while three affordances
 * were witnessed in one direction only. The recorded failure class on this
 * branch is a thing asserted present-when-expected and never absent-when-not,
 * so nothing detects OVER-firing: a `data-pending` hard-coded to `'true'`, an
 * aside rendered over an empty list, a clipped marker on a bar that fits (the
 * marker went with the window in Part 1 T9).
 * Those three were covered from the start. These were not, and each is now
 * pinned at the site named beside it:
 *
 * - the side entry's custom-claim list, whose twin on the ROW was witnessed
 *   both ways while the identical conditional here was not (11.80);
 * - the title column's own text, reached by every other assertion through
 *   some OTHER element, so emptying it left the whole suite green (11.79,
 *   retired with the title column in Part 1 T9);
 * - `laneEpicId`, forwarded to the model and passed by no test at all (11.81).
 *
 * A conditional is only witnessed here when a MIXED fixture renders both
 * branches at once and the whole shape is compared: a single-branch render
 * proves the branch, never that the probe can see the other one.
 *
 * The fixture is `calendar-view.test.tsx`'s, copied rather than re-invented,
 * and specifically NOT the plan's: the plan's builder omits `kind: 'ticket'`
 * and `workflowVersion` behind an `as TicketState`, which would let this suite
 * compile against a ticket the reducer never produces.
 */

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string): string => names[id] ?? id;

const CLIENT_TIME = '2026-08-19T10:00:00.000Z';
const SERVER_TIME = '2026-08-19T10:00:01.000Z';

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: CLIENT_TIME, serverTime: SERVER_TIME };
}

let counter = 0;

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
 * A Sunday: the today line's day (29.101) and the day the scroller opens on.
 * There is no window and no first column (Part 1 T9), so no fixture date can
 * fall off the chart.
 */
const TODAY = '2026-08-23';
/** The state word the description leads with for the fixture's `active` state (TG-14: status is never colour alone). */
const IN_PROGRESS = 'In progress; ';

/**
 * `packages/app-core/test/timeline` -> four levels up. Deliberately NOT
 * `new URL('../../../..', import.meta.url)`: Vite statically rewrites that
 * exact pattern into a dev-server asset URL, so under Vitest the base arrives
 * as `http://localhost:3000/@fs/<root>` and `fileURLToPath` throws. Converting
 * `import.meta.url` on its own and resolving afterwards reads the same
 * directory with no rewrite. (The same trap is documented at
 * `packages/ui/test/helpers/colour-scan.ts`.)
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');


function renderTimeline(
  tickets: TicketDatesInput[],
  extra: {
    onOpenTicket?: (ticketId: string) => void;
    today?: string;
    filter?: FilterSpec;
    laneEpicId?: string | null;
    isEpicType?: IsEpicType;
  } = {},
) {
  const onOpenTicket = extra.onOpenTicket ?? vi.fn();
  const view = render(
    <TimelineView
      tickets={tickets}
      today={extra.today ?? TODAY}
      userName={userName}
      onOpenTicket={onOpenTicket}
      {...(extra.filter === undefined ? {} : { filter: extra.filter })}
      {...(extra.laneEpicId === undefined ? {} : { laneEpicId: extra.laneEpicId })}
      {...(extra.isEpicType === undefined ? {} : { isEpicType: extra.isEpicType })}
    />,
  );
  return { onOpenTicket, ...view };
}

function customLabel(fieldName: string, date: string, actorId = 'user_kiro'): string {
  return customClaimLabel(
    { fieldId: 'ignored', fieldName, date, actorId, clientTime: CLIENT_TIME, serverTime: SERVER_TIME, pending: false },
    userName,
  );
}

function sideList() {
  return screen.getByRole('complementary', { name: 'Undated or partially dated' });
}

describe('11.73 a bar is drawn only from a claimed pair, and the rest is beside the grid — never in both places', () => {
  it('the dated ticket gets the bar and is absent from the side list; the due-only one is the mirror image', () => {
    const dated = ticket({
      fields: {
        title: claimField('Dated'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const dueOnly = ticket({
      fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const { onOpenTicket, container } = renderTimeline([dated, dueOnly]);

    const bar = screen.getByRole('button', { name: 'Dated' });
    expect(bar).toHaveAttribute(
      'title',
      IN_PROGRESS + barProvenance(
        { date: '2026-08-24', actorId: 'user_kiro' },
        { date: '2026-08-28', actorId: 'user_kiro' },
        userName,
      ),
    );
    fireEvent.click(bar);
    expect(onOpenTicket).toHaveBeenCalledWith(dated.state.id);

    const side = sideList();
    expect(within(side).getByRole('button', { name: 'Due only' })).toBeInTheDocument();
    expect(
      within(side).getByText(dueClaimLabel({ date: '2026-08-28', actorId: 'user_kiro' }, userName)),
    ).toBeInTheDocument();

    // THE PARTITION, in both directions: a bar-bearing ticket has no side
    // entry, and a side-listed ticket has no row. Neither half is detectable
    // from the other's assertion.
    expect(within(side).queryByText('Dated')).toBeNull();
    expect(container.querySelector(`[data-ticket-id="${dueOnly.state.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-ticket-id="${dated.state.id}"]`)).not.toBeNull();
  });

  it('a side-list entry opens its own ticket, not the first one on screen', () => {
    const dated = ticket({
      fields: {
        title: claimField('Dated'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const dueOnly = ticket({
      fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const { onOpenTicket } = renderTimeline([dated, dueOnly]);
    fireEvent.click(within(sideList()).getByRole('button', { name: 'Due only' }));
    expect(onOpenTicket).toHaveBeenCalledWith(dueOnly.state.id);
    expect(onOpenTicket).not.toHaveBeenCalledWith(dated.state.id);
  });
});

describe('29.099 there are no pages: no Earlier / Later, a Today button, a zoom switch and a two-row axis', () => {
  it('29.099 the toolbar is Today and a Day | Week | Month switch with Week marked; Earlier and Later are gone (control: Today is there)', async () => {
    renderTimeline([]);
    expect(screen.getByRole('button', { name: 'Today' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Earlier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull();
    const zoom = screen.getByRole('radiogroup', { name: 'Timeline zoom' }); // 29.087: VP-10 asks for a radio group
    expect(within(zoom).getAllByRole('radio').map((t) => t.textContent)).toEqual(['Day', 'Week', 'Month']);
    expect(within(zoom).getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'true');
    expect(within(zoom).getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'false');
    // The mark follows the zoom, not a constant: choosing Day marks Day once the zoom lands. Reduced motion makes the zoom
    // instant (the adapter reads `prefers-reduced-motion` through matchMedia, which jsdom lacks), so it lands on the next frame.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    try {
      fireEvent.click(within(zoom).getByRole('radio', { name: 'Day' }));
      await waitFor(() => expect(within(zoom).getByRole('radio', { name: 'Day' })).toHaveAttribute('aria-checked', 'true'));
      expect(within(zoom).getByRole('radio', { name: 'Week' })).toHaveAttribute('aria-checked', 'false');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('29.099 the axis has a period row with a W label on each Monday and a day-number row; a weekend day carries the mark', () => {
    const { container } = renderTimeline([]);
    const axis = container.querySelector('.gn-timeline__axis');
    expect(axis?.querySelectorAll('.gn-timeline__axis-row')).toHaveLength(2);
    // 2026-08-24 is a Monday, 2026-08-29 a Saturday
    expect(within(axis as HTMLElement).getByText('W 24 Aug')).toBeInTheDocument();
    const weekendDays = [...(axis?.querySelectorAll('.gn-timeline__axis-day[data-weekend="true"]') ?? [])];
    expect(weekendDays.length).toBeGreaterThan(10);
    // control: no weekday carries it
    const monday = [...(axis?.querySelectorAll('.gn-timeline__axis-day') ?? [])].filter((n) => !n.hasAttribute('data-weekend'));
    expect(monday.length).toBeGreaterThan(weekendDays.length);
    // The RIGHT days, not only the right share: read each day cell by its offset from the W 24 Aug label (labels and day cells
    // share `--d0`, the day's offset from the surface's first day). Mon 24 and Fri 28 are clear, Sat 29 and Sun 30 are marked.
    const mon = Number((within(axis as HTMLElement).getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
    const dayAt = (d0: number) =>
      [...(axis?.querySelectorAll<HTMLElement>('.gn-timeline__axis-day') ?? [])].find((n) => n.style.getPropertyValue('--d0') === String(d0));
    expect(dayAt(mon)?.textContent).toBe('24');
    expect(dayAt(mon)?.getAttribute('data-weekend')).toBeNull();
    expect(dayAt(mon + 4)?.getAttribute('data-weekend')).toBeNull();
    expect(dayAt(mon + 5)?.getAttribute('data-weekend')).toBe('true');
    expect(dayAt(mon + 6)?.getAttribute('data-weekend')).toBe('true');
    expect(dayAt(mon + 7)?.textContent).toBe('31');
    // The 1st of a month carries the month and year, EXACTLY (planner P20 class 2d): Tue 1 Sep is eight days after Mon 24
    // Aug, and its label reads "Sep 2026", never "Sep", "September" or "2026 Sep". Control: Wed 2 Sep carries no period label.
    const periodAt = (d0: number) =>
      [...(axis?.querySelectorAll<HTMLElement>('.gn-timeline__axis-label') ?? [])].find((n) => n.style.getPropertyValue('--d0') === String(d0));
    expect(periodAt(mon + 8)?.textContent).toBe('Sep 2026');
    expect(periodAt(mon + 8)).toHaveClass('gn-timeline__axis-label--month');
    expect(periodAt(mon + 9)).toBeUndefined();
    // The surface starts on a Monday: the stylesheet's weekend tile is seven days wide and tints days 5-6 of each tile from
    // the surface's left edge, so a surface that started on any other day would tint weekdays.
    expect(mon % 7).toBe(0);
    // The chart itself is one focusable group named EXACTLY "Timeline" (the name a screen reader announces on entering it).
    expect(screen.getByRole('group', { name: 'Timeline' })).toHaveClass('gn-timeline__canvas');
  });
});

describe('11.75 the empty timelines are the model sentences, rendered verbatim', () => {
  /* ⚠ RETITLED 2026-09-20. It read "three empty timelines are three different
     sentences". The narrowing sentence was deleted on the owner's ruling, so a
     filter-emptied chart and an empty one render the SAME bytes now; the
     discrimination this block keeps is between those and the window miss. */
  const dated = () =>
    ticket({
      fields: {
        title: claimField('Dated'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });

  it('nothing claimed', () => {
    renderTimeline([]);
    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_EMPTY_COPY);
  });

  /**
   * The empty timeline must not name a control the TIMELINE does not have.
   *
   * `TimelineViewProps` carries no hidden-field prop and `buildTimelineModel`
   * has no `hiddenCustomFieldIds` option — the legend is `CalendarView`'s own
   * state alone. A first draft of this change copied the calendar's clause
   * across "for symmetry" and named the legend anyway, which is the SAME defect
   * the owner deleted the lane sentence for one screen over: a word no surface
   * can offer the reader. The reviewer who caught it noted that nothing
   * forbade it, so this is the thing that forbids it.
   *
   * Asserted on the WORD rather than the whole string, so a later rewording
   * fails at the clause that matters and not at a comma.
   */
  it('the empty timeline names only controls the TIMELINE has — it has no legend', () => {
    renderTimeline([]);
    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_EMPTY_COPY);
    expect(screen.getByRole('note')).not.toHaveTextContent(/legend/i);
  });

  it('a narrowing the viewer set — the sentence names it, because the arm is shared now', () => {
    const filter: FilterSpec = { assigneeIds: ['user_nobody'] };
    renderTimeline([dated()], { filter });
    // `TIMELINE_NARROWED_COPY` was deleted on 2026-09-20 (owner ruling), so a
    // filter-emptied chart reaches the SAME sentence as an empty one. What
    // replaces the lost distinction is that the sentence names the filter —
    // asserted as the property, since the constant alone would pass either way.
    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_EMPTY_COPY);
    expect(screen.getByRole('note')).toHaveTextContent('your filter');
  });

  it('29.095 dated work a year away is DRAWN, not described: no sentence, a bar', () => {
    renderTimeline([
      ticket({
        fields: {
          title: claimField('Next year'),
          startDate: claimField({ date: '2027-03-01' }),
          dueDate: claimField({ date: '2027-03-05' }),
        },
      }),
    ]);
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getByRole('button', { name: 'Next year' })).toBeInTheDocument();
  });

  it('and NO sentence at all when there is something to show — the over-firing half', () => {
    renderTimeline([dated()]);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('11.76 the side list is rendered only when it has entries, under the heading the model chose', () => {
  it('a list of only missing-claim entries gets the plain heading', () => {
    renderTimeline([
      ticket({ fields: { title: claimField('Bare') } }),
      ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(within(sideList()).getByText(TIMELINE_SIDE_LIST_COPY)).toBeInTheDocument();
    expect(within(sideList()).queryByText(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY)).toBeNull();
  });

  it('one entry the plain heading is false of switches the whole heading', () => {
    renderTimeline([
      ticket({ fields: { title: claimField('Bare') } }),
      ticket({
        fields: {
          title: claimField('Backwards'),
          startDate: claimField({ date: '2026-08-28' }),
          dueDate: claimField({ date: '2026-08-24' }),
        },
      }),
    ]);
    expect(within(sideList()).getByText(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY)).toBeInTheDocument();
    expect(within(sideList()).queryByText(TIMELINE_SIDE_LIST_COPY)).toBeNull();
  });

  it('with nothing to list there is no aside at all — a heading over an empty list is a sentence about nothing', () => {
    renderTimeline([
      ticket({
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      }),
    ]);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('11.77 all FIVE side-list reasons render, each saying which it is', () => {
  it('names every reason and prints the model note verbatim, including the fifth the plan predates', () => {
    const bare = ticket({ fields: { title: claimField('Bare') } });
    const startOnly = ticket({
      fields: { title: claimField('Start only'), startDate: claimField({ date: '2026-08-24' }) },
    });
    const dueOnly = ticket({
      fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const backwards = ticket({
      fields: {
        title: claimField('Backwards'),
        startDate: claimField({ date: '2026-08-28' }),
        dueDate: claimField({ date: '2026-08-24' }),
      },
    });
    const impossible = ticket({
      fields: {
        title: claimField('Impossible'),
        startDate: claimField({ date: '2026-02-30' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const { container } = renderTimeline([bare, startOnly, dueOnly, backwards, impossible]);

    const reasons = [...container.querySelectorAll('[data-reason]')].map((node) =>
      node.getAttribute('data-reason'),
    );
    expect(reasons).toEqual([
      'no-dates',
      'start-only',
      'due-only',
      'start-after-due',
      'unplaceable-day',
    ]);

    // THE VALUES, not merely the arms. `sideEntryClassName`'s `never` default
    // makes a sixth reason a COMPILE error, and that is all the compiler can
    // do: it says nothing about what the five existing arms RETURN. Before
    // this array, `start-only` and `due-only` were reached by no fixture at
    // all — collapsing both to `return ''`, or swapping either for the
    // `--no-dates` class, kept the suite at 26/26 — and neither modifier has a
    // rule in `ui.css`, so the same defect is invisible on screen too.
    //
    // The case below is NOT a substitute, and measurement says so: it asks
    // whether an entry is undrawable via an OR over the two undrawable
    // modifiers, so exchanging `--start-after-due` for `--unplaceable-day`
    // also stayed at 26/26 — two reasons wearing each other's name, in the
    // one pair of modifiers `ui.css` does treat differently from the rest.
    //
    // Hand-typed and compared as a WHOLE ARRAY. Deriving the strings from
    // `data-reason` would still catch `return ''` but would survive a
    // systematic prefix rename, and `toHaveClass` is a subset check that
    // passes with an extra class on the element.
    const classNames = [...container.querySelectorAll('[data-reason]')].map((node) =>
      node.getAttribute('class'),
    );
    expect(classNames).toEqual([
      'gn-timeline__side-entry gn-timeline__side-entry--no-dates',
      'gn-timeline__side-entry gn-timeline__side-entry--start-only',
      'gn-timeline__side-entry gn-timeline__side-entry--due-only',
      'gn-timeline__side-entry gn-timeline__side-entry--start-after-due',
      'gn-timeline__side-entry gn-timeline__side-entry--unplaceable-day',
    ]);

    const side = sideList();
    expect(within(side).getByText(NO_DATES_NOTE)).toBeInTheDocument();
    expect(
      within(side).getByText(startClaimLabel({ date: '2026-08-24', actorId: 'user_kiro' }, userName)),
    ).toBeInTheDocument();
    expect(
      within(side).getByText(dueClaimLabel({ date: '2026-08-28', actorId: 'user_kiro' }, userName)),
    ).toBeInTheDocument();
    expect(
      within(side).getByText(
        contradictionCopy({ date: '2026-08-28', actorId: 'user_kiro' }, { date: '2026-08-24', actorId: 'user_kiro' }),
      ),
    ).toBeInTheDocument();
    expect(within(side).getByText(unplaceableDayCopy(['2026-02-30']))).toBeInTheDocument();
  });

  it('the undrawable modifier lands on the two entries the plain heading is false of, and on no other', () => {
    const bare = ticket({ fields: { title: claimField('Bare') } });
    const backwards = ticket({
      fields: {
        title: claimField('Backwards'),
        startDate: claimField({ date: '2026-08-28' }),
        dueDate: claimField({ date: '2026-08-24' }),
      },
    });
    const impossible = ticket({
      fields: {
        title: claimField('Impossible'),
        startDate: claimField({ date: '2026-02-30' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const { container } = renderTimeline([bare, backwards, impossible]);
    const modifiers = [...container.querySelectorAll('[data-reason]')].map((node) => ({
      reason: node.getAttribute('data-reason'),
      undrawable:
        node.classList.contains('gn-timeline__side-entry--start-after-due') ||
        node.classList.contains('gn-timeline__side-entry--unplaceable-day'),
      classed: node.classList.contains('gn-timeline__side-entry'),
    }));
    expect(modifiers).toEqual([
      { reason: 'no-dates', undrawable: false, classed: true },
      { reason: 'start-after-due', undrawable: true, classed: true },
      // A four-armed switch drops out here with no class at all.
      { reason: 'unplaceable-day', undrawable: true, classed: true },
    ]);
  });

  it("a ticket with a custom date claim is not told it has 'no claimed dates'", () => {
    renderTimeline([
      ticket(
        { fields: { title: claimField('Filed, not scheduled'), 'filed-on': claimField('2026-08-26') } },
        [],
        [{ id: 'filed-on', name: 'Filed on' }],
      ),
    ]);
    const side = sideList();
    expect(within(side).getByText(NO_DAY_CLAIMS_NOTE)).toBeInTheDocument();
    expect(within(side).queryByText(NO_DATES_NOTE)).toBeNull();
    expect(within(side).getByText(customLabel('Filed on', '2026-08-26'))).toBeInTheDocument();
  });
});

describe('11.78 a claim still in transit says so — and a settled one does not', () => {
  function pendingRow(pendingFieldIds: string[]) {
    return ticket(
      {
        fields: {
          title: claimField('Pending'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      },
      pendingFieldIds,
    );
  }

  it('marks the bar when a claim is in transit', () => {
    renderTimeline([pendingRow(['startDate'])]);
    expect(screen.getByRole('button', { name: 'Pending' })).toHaveAttribute('data-pending', 'true');
  });

  it('leaves the attribute OFF when nothing is in transit — a hard-coded "true" survives the test above', () => {
    renderTimeline([pendingRow([])]);
    expect(screen.getByRole('button', { name: 'Pending' })).not.toHaveAttribute('data-pending');
  });

  it('a custom date claim carries its own in-transit mark, and only when it is in transit', () => {
    const fields = [{ id: 'filed-on', name: 'Filed on' }];
    const settledFields = {
      title: claimField('Filed'),
      startDate: claimField({ date: '2026-08-24' }),
      dueDate: claimField({ date: '2026-08-28' }),
      'filed-on': claimField('2026-08-26'),
    };
    const { container, unmount } = renderTimeline([ticket({ fields: settledFields }, ['filed-on'], fields)]);
    expect(container.querySelector('[data-field-id="filed-on"]')).toHaveAttribute('data-pending', 'true');
    unmount();

    const settled = renderTimeline([ticket({ fields: settledFields }, [], fields)]);
    expect(settled.container.querySelector('[data-field-id="filed-on"]')).not.toHaveAttribute('data-pending');
  });
});

describe('29.097 a bar is placed by three numbers and one scale', () => {
  const bar = (title: string, start: string, due: string, key?: string): TicketDatesInput => {
    const input = ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
    return key === undefined ? input : { ...input, key };
  };
  const barOf = (title: string) => screen.getByRole('button', { name: title });
  const prop = (title: string, name: string) => (barOf(title).closest('.gn-timeline__row') as HTMLElement).style.getPropertyValue(name);

  it('29.097 --dn is the length in days, both ends included: Mon-Wed is 3, Mon-Fri 5, a one-day bar 1; the day numbers ride on the bar', () => {
    renderTimeline([bar('Mon to Wed', '2026-08-24', '2026-08-26'), bar('Mon to Fri', '2026-08-24', '2026-08-28'), bar('One day', '2026-09-30', '2026-09-30')]);
    expect(prop('Mon to Wed', '--dn')).toBe('3');
    expect(prop('Mon to Fri', '--dn')).toBe('5');
    expect(prop('One day', '--dn')).toBe('1');
    expect(barOf('Mon to Wed')).toHaveAttribute('data-day-from', String(dayNumberOf('2026-08-24')));
    expect(barOf('Mon to Wed')).toHaveAttribute('data-day-to', String(dayNumberOf('2026-08-26')));
    // --d0 is relative to the surface's first day, so the offset BETWEEN two bars is their distance in days
    expect(Number(prop('One day', '--d0')) - Number(prop('Mon to Wed', '--d0'))).toBe(dayNumberOf('2026-09-30') - dayNumberOf('2026-08-24'));
    // ...and the offset itself is the axis's: a bar starting Monday 24 Aug has the --d0 of the W 24 Aug label above it (a
    // difference alone cannot see an offset counted from the wrong origin, since both bars would carry it).
    expect(prop('Mon to Wed', '--d0')).toBe((screen.getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
  });

  it('29.097 there is no window: work a year before and a year after is drawn, with the surface long enough to hold it', () => {
    const { container } = renderTimeline([bar('Long ago', '2025-08-25', '2025-08-29'), bar('Far ahead', '2027-08-23', '2027-08-27')]);
    expect(barOf('Long ago')).toBeInTheDocument();
    expect(barOf('Far ahead')).toBeInTheDocument();
    expect(Number(prop('Far ahead', '--d0')) - Number(prop('Long ago', '--d0'))).toBe(dayNumberOf('2027-08-23') - dayNumberOf('2025-08-25'));
    // control: the surface is sized from the day count, not from a week count
    const width = (container.querySelector('.gn-timeline__surface') as HTMLElement).style.width;
    expect(width).toMatch(/^calc\(var\(--tl-ppd\) \* \d+ \* 1px\)$/);
    expect(Number(/\* (\d+) \*/.exec(width)?.[1])).toBeGreaterThan(730);
  });

  it('29.097 the surface spans the pan limits EXACTLY, from the Monday on or before their start: one bar 24 Jul - 22 Oct 2026 with today 23 Aug draws 177 days (the unmeasured canvas keeps the 960 px fallback: 40 days of margin at 24 px/day)', () => {
    // today 2026-08-23 is day 20688; the bar is days 20658-20748. panLimits: start = min(20688 - 56, 20658 - 40) = 20618 (a
    // Sunday), end = max(20688 + 56, 20748 + 40) = 20788; the surface starts on Monday 20612 (8 Jun), so it is 20788 - 20612 + 1
    // = 177 days. Literals, not a re-derivation: a margin of 4 days (96 px) or 41 (961 px), a missing `+ 1` or a surface that
    // does not start on a Monday each give another number.
    const { container } = renderTimeline([bar('Near', '2026-07-24', '2026-10-22')]);
    expect(dayNumberOf('2026-08-23')).toBe(20688);
    expect((container.querySelector('.gn-timeline__surface') as HTMLElement).style.width).toBe('calc(var(--tl-ppd) * 177 * 1px)');
    // the bar sits at its day's offset from that Monday
    expect(prop('Near', '--d0')).toBe(String(20658 - 20612));
  });

  it('29.097 no stylesheet number leaks into the markup: the scale is one custom property on the canvas, and no inline grid template exists', () => {
    const { container } = renderTimeline([bar('Mon to Wed', '2026-08-24', '2026-08-26')]);
    expect((container.querySelector('.gn-timeline__canvas') as HTMLElement).style.getPropertyValue('--tl-ppd')).toBe('24');
    expect(container.querySelectorAll('[style*="grid-template-columns"]')).toHaveLength(0);
    expect(container.querySelectorAll('[style*="left:"]')).toHaveLength(0);
  });
});

describe('29.098 the bars of a lane are packed into the fewest rows', () => {
  const bar = (title: string, start: string, due: string): TicketDatesInput =>
    ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } });
  const rowOf = (title: string) => Number((screen.getByRole('button', { name: title }).closest('.gn-timeline__row') as HTMLElement).style.getPropertyValue('--row'));

  it('29.098 two bars that share a day take two rows, two that only touch take one, and the lane is as tall as its rows; control: a third overlap adds a row', () => {
    const { container } = renderTimeline([
      bar('A', '2026-08-24', '2026-08-28'),
      bar('B', '2026-08-26', '2026-08-31'),
      bar('C', '2026-09-01', '2026-09-03'),
    ]);
    expect(rowOf('A')).toBe(0);
    expect(rowOf('B')).toBe(1);
    // C starts the day after B ends: it fits beside A in row 0
    expect(rowOf('C')).toBe(0);
    const lane = container.querySelector('.gn-timeline__lane') as HTMLElement;
    expect(lane.style.getPropertyValue('--lane-extent')).toBe(`${34 + 2 * 40}px`);
    document.body.innerHTML = '';
    const three = renderTimeline([bar('A', '2026-08-24', '2026-08-28'), bar('B', '2026-08-26', '2026-08-31'), bar('C', '2026-08-27', '2026-08-30')]);
    expect((three.container.querySelector('.gn-timeline__lane') as HTMLElement).style.getPropertyValue('--lane-extent')).toBe(`${34 + 3 * 40}px`);
  });
});

describe('29.100 the key is on the bar; the accessible name stays the title', () => {
  const keyed = (title: string, key: string, start: string, due: string): TicketDatesInput => ({
    ...ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } }),
    key,
  });

  it('29.100 a wide bar shows the key inside; a one-day bar shows it just outside its end; the name is the title alone and the description has the key', () => {
    const { container } = renderTimeline([keyed('Wide', 'GN-12', '2026-08-24', '2026-08-28'), keyed('Narrow', 'GN-13', '2026-09-08', '2026-09-08')]);
    const wide = screen.getByRole('button', { name: 'Wide' });
    expect(wide.querySelector('.gn-timeline__key')).toHaveTextContent('GN-12');
    const narrow = screen.getByRole('button', { name: 'Narrow' });
    expect(narrow.querySelector('.gn-timeline__key')).toBeNull();
    const outside = (narrow.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside');
    expect(outside).toHaveTextContent('GN-13');
    expect(outside).toHaveAttribute('aria-hidden', 'true');
    // the key is reachable by assistive technology through the description, never through the name
    const described = document.getElementById(narrow.getAttribute('aria-describedby') as string);
    expect(described).toHaveTextContent('GN-13');
    expect(narrow.getAttribute('aria-label')).toBe('Narrow');
    // exactly one key per bar: inside the wide one, outside the narrow one, never both at once
    expect(container.querySelectorAll('.gn-timeline__key')).toHaveLength(2);
    expect((wide.closest('.gn-timeline__row') as HTMLElement).querySelector('.gn-timeline__key--outside')).toBeNull();
    // control: a bar with no key (a draft or a replica row) has none to show, inside or outside
    document.body.innerHTML = '';
    const bare = renderTimeline([ticket({ fields: { title: claimField('Bare'), startDate: claimField({ date: '2026-09-08' }), dueDate: claimField({ date: '2026-09-08' }) } })]);
    expect(bare.container.querySelector('.gn-timeline__key')).toBeNull();
  });

  it('29.100 a finished ticket carries a check, one in progress a play mark, one not started none; the description says it in words', () => {
    const withState = (title: string, stateCategory: TicketState['stateCategory']): TicketDatesInput =>
      ticket({ stateCategory, fields: { title: claimField(title), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }) } });
    renderTimeline([withState('Done one', 'terminal'), withState('Active one', 'active'), withState('Fresh one', 'open')]);
    const mark = (title: string) => screen.getByRole('button', { name: title }).querySelector('.gn-timeline__mark')?.textContent ?? null;
    expect(mark('Done one')).toBe('✓');
    expect(mark('Active one')).toBe('▶');
    expect(mark('Fresh one')).toBeNull();
    expect(screen.getByRole('button', { name: 'Done one' })).toHaveAttribute('title', expect.stringMatching(/^Done; /));
    expect(screen.getByRole('button', { name: 'Active one' })).toHaveAttribute('title', expect.stringMatching(/^In progress; /));
    expect(screen.getByRole('button', { name: 'Fresh one' }).getAttribute('title')).not.toMatch(/Done|In progress/);
  });
});

describe('29.101 the today line is one line, on the prop\'s day', () => {
  it('29.101 one line, aria-hidden, at today\'s day number; a different prop moves it; an invalid day draws none', () => {
    const { container, rerender } = renderTimeline([]);
    const lines = () => container.querySelectorAll('.gn-timeline__today');
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toHaveAttribute('aria-hidden', 'true');
    expect(lines()[0]).toHaveAttribute('data-day', String(dayNumberOf('2026-08-23')));
    // ...and it is DRAWN on that day: Sunday 23 Aug is one day left of the W 24 Aug label (both offsets count from the
    // surface's first day), so a line placed from the wrong origin fails here even though its data-day is right.
    const mondayD0 = Number((screen.getByText('W 24 Aug') as HTMLElement).style.getPropertyValue('--d0'));
    expect(Number((lines()[0] as HTMLElement).style.getPropertyValue('--d0'))).toBe(mondayD0 - 1);
    rerender(<TimelineView tickets={[]} today="2026-10-07" userName={userName} onOpenTicket={vi.fn()} />);
    expect(lines()[0]).toHaveAttribute('data-day', String(dayNumberOf('2026-10-07')));
    rerender(<TimelineView tickets={[]} today="2026-02-30" userName={userName} onOpenTicket={vi.fn()} />);
    expect(lines()).toHaveLength(0);
  });
});

describe('29.102 only the bars near the view are mounted', () => {
  function crowd(n: number): TicketDatesInput[] {
    return Array.from({ length: n }, (_, i) => {
      const start = isoDayOf(dayNumberOf('2026-01-05') + i * 3);
      return ticket({ fields: { title: claimField(`Bar ${i}`), startDate: claimField({ date: start }), dueDate: claimField({ date: start }) } });
    });
  }

  it('29.102 with a measured width the mounted bars are the viewport and one viewport either side; with none (jsdom, a hidden tab) every bar is mounted', () => {
    const all = crowd(300);
    const bars = () => document.querySelectorAll('.gn-timeline__bar').length;
    const stub = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(960);
    try {
      renderTimeline(all, { today: '2026-06-01' });
      const measured = bars();
      expect(measured).toBeGreaterThan(0);
      expect(measured).toBeLessThan(300);
      // WHICH bars, not only how many. Bar i is on 2026-01-05 + 3i, so Bar 49 is on today (2026-06-01). The viewport is 40 days
      // (960 px at 24 px/day) centred on today, so the visible days are today -20 .. +20 and one viewport either side reaches
      // about today -61 .. +61 (Bars 29 to 69). Bars 21 and 77 are 84 days away, past any band of the view; Bars 0 and 299 are
      // the ends of the data.
      const mounted = (i: number) => screen.queryByRole('button', { name: `Bar ${i}` }) !== null;
      expect([mounted(29), mounted(49), mounted(69)]).toEqual([true, true, true]);
      expect([mounted(0), mounted(21), mounted(77), mounted(299)]).toEqual([false, false, false, false]);
      // After the mount and its first refresh the band IS spec PR-5's [visible - V, visible + V], exactly (planner ruling
      // 2026-10-04): visible = today -20 .. +20 (offset today - 19.5, 40 days), V = 41, band = today -61 .. +61. Bars 28 and 70
      // (today -63 and +63) are just outside it; the 54-day guess the view starts from (today -81 .. +80) would mount both.
      expect([mounted(28), mounted(70)]).toEqual([false, false]);
    } finally {
      stub.mockRestore();
    }
    document.body.innerHTML = '';
    renderTimeline(all, { today: '2026-06-01' });
    expect(bars()).toBe(300);
  });
});

/**
 * 29.055 (the view's half; the packing half is `packages/viewport/test/pack.test.ts`): the packer reserves an outside key
 * from the bar's END, `KEY_GAP_PX` after it, so the view must decide "outside" with the SAME predicate and draw the key at
 * the SAME gap. A second copy of the comparison here would let the two drift apart while every test of each stays green.
 */
describe('29.055 the view decides an outside key with the packer\'s one predicate and draws it at the packer\'s gap', () => {
  it('29.055 the "outside" comparison is written once, in pack.ts, and the view calls keyOutside; control: the scan counts a planted copy', () => {
    const roots = [join(REPO_ROOT, 'packages/viewport/src'), join(REPO_ROOT, 'packages/app-core/src')];
    const comparisons = (text: string) => (text.match(/\bbarPx\s*<=?(?!=)|>=?\s*barPx\b/g) ?? []).length;
    let total = 0;
    for (const root of roots) {
      for (const file of readdirSync(root, { recursive: true }) as string[]) {
        if (/\.tsx?$/.test(file)) total += comparisons(readFileSync(join(root, file), 'utf8'));
      }
    }
    expect(total).toBe(1);
    expect(comparisons(readFileSync(join(REPO_ROOT, 'packages/viewport/src/pack.ts'), 'utf8'))).toBe(1);
    expect(readFileSync(join(REPO_ROOT, 'packages/app-core/src/timeline/timeline-view.tsx'), 'utf8')).toMatch(/\bkeyOutside\(barPx, measure\(row\.key\)\)/);
    expect(comparisons('const outside = row.key !== null && barPx < measure(row.key);')).toBe(1);
    expect(comparisons('const outside = measure(row.key) > barPx;')).toBe(1);
  });

  it('29.055 the view packs with the key width it measures: GN-13 (jsdom: 5 x 6.5 + 12 = 45 px) on a one-day bar reserves days 0-4 at the Week bucket (16 px/day), so a bar on day 4 takes a second row and one on day 5 shares; a 9-character key (71 px) sits inside a 3-day bar (72 px at 24 px/day); an 8-character key (64 px) exactly fills a 4-day bar at 16 px/day, so a bar on the next day shares its row', () => {
    // The premise: jsdom has no OffscreenCanvas, so the view measures with its 6.5 px per character estimate.
    expect(typeof OffscreenCanvas).toBe('undefined');
    const keyedBar = (title: string, key: string, start: string, due: string): TicketDatesInput => ({
      ...ticket({ fields: { title: claimField(title), startDate: claimField({ date: start }), dueDate: claimField({ date: due }) } }),
      key,
    });
    const rowOf = (title: string) => (screen.getByRole('button', { name: title }).closest('.gn-timeline__row') as HTMLElement).style.getPropertyValue('--row');
    // ceil((4 + 45) / 16) = 4 days after the bar: days 0-4
    renderTimeline([keyedBar('Short', 'GN-13', '2026-08-24', '2026-08-24'), keyedBar('Day four', 'GN-14', '2026-08-28', '2026-08-29')]);
    expect(rowOf('Day four')).toBe('1');
    document.body.innerHTML = '';
    renderTimeline([keyedBar('Short', 'GN-13', '2026-08-24', '2026-08-24'), keyedBar('Day five', 'GN-15', '2026-08-29', '2026-08-30')]);
    expect(rowOf('Day five')).toBe('0');
    document.body.innerHTML = '';
    // 8 x 6.5 + 12 = 64 px = 4 days x 16 px/day: the key fits, so the bar is its own footprint and day 4 is free
    // (one px more of padding, 65 px, would put the key outside and reserve days 0-8)
    renderTimeline([keyedBar('Four days', 'GN-12345', '2026-08-24', '2026-08-27'), keyedBar('Next day', 'GN-16', '2026-08-28', '2026-08-29')]);
    expect(rowOf('Next day')).toBe('0');
    document.body.innerHTML = '';
    // 9 x 6.5 + 12 = 70.5, so 71 px: a 72 px bar holds it (alone in its lane, so its packing footprint disturbs nothing)
    const { container } = renderTimeline([keyedBar('Three days', 'GN-123456', '2026-08-24', '2026-08-26')]);
    expect(screen.getByRole('button', { name: 'Three days' }).querySelector('.gn-timeline__key')).toHaveTextContent('GN-123456');
    expect(container.querySelector('.gn-timeline__key--outside')).toBeNull();
  });

  it('29.055 ui.css draws the outside key KEY_GAP_PX (4 px) after the bar\'s end; the literal is pinned too, so a gap scaled on both sides still reddens', () => {
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const body = /^\.gn-timeline__key--outside \{([^}]*)\}/m.exec(css)?.[1] ?? '';
    const left = /(?:^|;)\s*left:\s*([^;]+);/.exec(body)?.[1]?.trim();
    expect(left).toBe(`calc((var(--d0) + var(--dn)) * var(--tl-ppd) * 1px + ${KEY_GAP_PX}px)`);
    expect(KEY_GAP_PX).toBe(4);
    expect(left).toBe('calc((var(--d0) + var(--dn)) * var(--tl-ppd) * 1px + 4px)');
  });
});

/**
 * 29.088 — TV-11: the panel fills the window under its own top edge, 16 px short of the bottom, never below 320 px, and fits
 * again when the window resizes. jsdom lays nothing out (every rect's top is 0) and its window is 768 px tall, so the numbers
 * are literals: 768 - 0 - 16 = 752, and a 300 px window gives the 320 px floor. T10's 29.040 measures the same rule in a real
 * browser (where the floor never binds at 800 px). Collect, restore the window, then assert.
 */
describe('29.088 the panel fills the window below it, 16 px short, never under 320 px', () => {
  it('29.088 752 px in jsdom\'s 768 px window, 320 px when the window is 300 px tall, and 752 px again after the window comes back; each read follows a resize event', () => {
    const { container } = renderTimeline([]);
    const panel = container.querySelector('.gn-timeline') as HTMLElement;
    const windowHeight = window.innerHeight;
    const tall = panel.style.height;
    const saved = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    fireEvent(window, new Event('resize'));
    const short = panel.style.height;
    if (saved === undefined) delete (window as { innerHeight?: number }).innerHeight;
    else Object.defineProperty(window, 'innerHeight', saved);
    fireEvent(window, new Event('resize'));
    const back = panel.style.height;
    expect(windowHeight).toBe(768);
    expect(window.innerHeight).toBe(768);
    expect(tall).toBe('752px');
    expect(short).toBe('320px');
    expect(back).toBe('752px');
  });
});

describe('29.102 a view that re-renders without new data re-renders none of its bars', () => {
  it('29.102 the bar is a React.memo component imported from react, so a moving / resting flip of the view does not re-render 2,000 bars (measured: a 33 ms stall without it, 9.4 ms with); control: the scan finds a planted un-memoised bar', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, '../../src/timeline/timeline-view.tsx'), 'utf8');
    const memoised = (text: string) => /import \{[^}]*\bmemo\b[^}]*\} from 'react'/.test(text) && /const TimelineBar = memo\(function TimelineBar\(/.test(text);
    expect(memoised(source)).toBe(true);
    expect(memoised("const TimelineBar = function TimelineBar(props) { return null; };")).toBe(false);
  });
});

describe('29.103 custom date claims stay beside the ticket (TV-2)', () => {
  it('29.103 the claim list sits in the bar\'s row, outside the bar, with the model\'s label; a bar with none has no list', () => {
    const withClaim = ticket(
      { fields: { title: claimField('Filed'), startDate: claimField({ date: '2026-08-24' }), dueDate: claimField({ date: '2026-08-28' }), 'filed-on': claimField('2026-08-26') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const plain = ticket({ fields: { title: claimField('Plain'), startDate: claimField({ date: '2026-09-01' }), dueDate: claimField({ date: '2026-09-02' }) } });
    renderTimeline([withClaim, plain]);
    const rowOfFiled = screen.getByRole('button', { name: 'Filed' }).closest('.gn-timeline__row') as HTMLElement;
    expect(rowOfFiled.querySelector('[data-custom-claims]')).not.toBeNull();
    expect(rowOfFiled.querySelector('[data-custom-claims]')).toHaveTextContent(customLabel('Filed on', '2026-08-26'));
    expect(rowOfFiled.querySelector('.gn-timeline__bar [data-custom-claims]')).toBeNull();
    expect((screen.getByRole('button', { name: 'Plain' }).closest('.gn-timeline__row') as HTMLElement).querySelector('[data-custom-claims]')).toBeNull();
  });
});

describe('29.105 the pages are gone from the source', () => {
  it('29.105 no Earlier / Later, SHIFT_DAYS, weeksCount, anchor option or week-column grid remains in the timeline source or in ui.css; control: the scan finds a planted one', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = ['timeline-view.tsx', 'timeline-model.ts', 'timeline-layout.ts'].map((f) => readFileSync(join(here, '../../src/timeline', f), 'utf8'));
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const banned = /SHIFT_DAYS|weeksCount|--timeline-week-columns|--timeline-bar-lead|TimelineWeekCol|TimelineBarSpan|TIMELINE_OUT_OF_WINDOW_COPY|>\s*Earlier\s*<|>\s*Later\s*</;
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const text of files) expect(banned.test(code(text))).toBe(false);
    expect(banned.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))).toBe(false);
    expect(banned.test('const SHIFT_DAYS = 28;')).toBe(true);
  });
});

describe('11.80 custom date claims sit beside the ticket, never across the weeks, and join the hover', () => {
  const fields = [{ id: 'filed-on', name: 'Filed on' }];

  function filed() {
    return ticket(
      {
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
          'filed-on': claimField('2026-08-26', 'user_anselma'),
        },
      },
      [],
      fields,
    );
  }

  it("renders the claim under its own field name, in the bar's row and not inside the bar", () => {
    const { container } = renderTimeline([filed()]);
    const claim = screen.getByText(customLabel('Filed on', '2026-08-26', 'user_anselma'));
    expect(claim).toHaveAttribute('data-field-id', 'filed-on');
    expect(claim.closest('.gn-timeline__row')).not.toBeNull();
    // The list is beside the ticket, a callout in the bar's row (TV-2): it is
    // not inside the bar, so the bar's own text stays the key and the title.
    expect(claim.closest('.gn-timeline__bar')).toBeNull();
    expect(container.querySelectorAll('[data-custom-claims]')).toHaveLength(1);
  });

  it('appends the claim to the bar hover, after the bar provenance', () => {
    renderTimeline([filed()]);
    expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
      'title',
      IN_PROGRESS + [
        barProvenance(
          { date: '2026-08-24', actorId: 'user_kiro' },
          { date: '2026-08-28', actorId: 'user_kiro' },
          userName,
        ),
        customLabel('Filed on', '2026-08-26', 'user_anselma'),
      ].join('; '),
    );
  });

  it('a side-list entry carries its own claim list, and a claim-free entry beside it carries none', () => {
    const filed = ticket(
      {
        fields: {
          title: claimField('Filed, not scheduled'),
          'filed-on': claimField('2026-08-26', 'user_anselma'),
        },
      },
      [],
      fields,
    );
    const bare = ticket({ fields: { title: claimField('Bare') } });
    const { container } = renderTimeline([filed, bare]);
    const side = sideList();

    // The ROW's `customClaims.length > 0` guard is witnessed both ways by the
    // case below. Its TWIN on the side entry — the identical conditional, same
    // shape, same commit — was witnessed in one direction only: rendering the
    // list unconditionally emits an EMPTY `<ul data-custom-claims>` on the
    // claim-free entry, and nothing counted side-list lists at all, so the
    // whole suite stayed at 26/26.
    //
    // The mixed fixture is the point. A render with only a claim-free ticket
    // would prove absence without proving the probe can see a list when there
    // is one; the pair proves both in the same DOM.
    const entries = [...side.querySelectorAll('[data-reason]')].map((node) => ({
      title: node.querySelector('.gn-timeline__open')?.textContent,
      lists: node.querySelectorAll('[data-custom-claims]').length,
    }));
    expect(entries).toEqual([
      { title: 'Filed, not scheduled', lists: 1 },
      { title: 'Bare', lists: 0 },
    ]);
    expect(side.querySelectorAll('[data-custom-claims]')).toHaveLength(1);
    // Neither ticket is drawable, so the side list holds the only claim list
    // on screen: nothing leaked into a row.
    expect(container.querySelectorAll('[data-custom-claims]')).toHaveLength(1);
    expect(
      within(side).getByText(customLabel('Filed on', '2026-08-26', 'user_anselma')),
    ).toBeInTheDocument();
  });

  it('renders no claim list at all for a ticket that carries none — and the hover is the provenance alone', () => {
    const { container } = renderTimeline([
      ticket({
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      }),
    ]);
    expect(container.querySelector('[data-custom-claims]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
      'title',
      IN_PROGRESS + barProvenance(
        { date: '2026-08-24', actorId: 'user_kiro' },
        { date: '2026-08-28', actorId: 'user_kiro' },
        userName,
      ),
    );
  });
});

describe('11.81 rows are grouped under the epic that owns them, and under "No epic" when none does', () => {
  it('heads a lane with its epic, keeps the undated epic out of the side list, and gives it no row of its own', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const child = ticket({
      parentId: 'epic1',
      fields: {
        title: claimField('DLT'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const orphan = ticket({
      fields: {
        title: claimField('Loose'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const { container } = renderTimeline([epic, child, orphan]);

    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No epic' })).toBeInTheDocument();
    // A lane, not missing work — and not a row either.
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(container.querySelector('[data-ticket-id="epic1"]')).toBeNull();

    const lanes = [...container.querySelectorAll('.gn-timeline__group')].map((group) => ({
      heading: group.querySelector('h3')?.textContent,
      tickets: [...group.querySelectorAll('[data-ticket-id]')].map((row) =>
        row.getAttribute('data-ticket-id'),
      ),
    }));
    expect(lanes).toEqual([
      { heading: 'Registrations', tickets: [child.state.id] },
      { heading: 'No epic', tickets: [orphan.state.id] },
    ]);
  });

  it('a lane epic narrows the timeline to that epic\'s work — the prop no test used to pass', () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('Registrations') } });
    const child = ticket({
      parentId: 'epic1',
      fields: {
        title: claimField('DLT'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const orphan = ticket({
      fields: {
        title: claimField('Loose'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    // Every case above renders the same three tickets with the prop ABSENT, so
    // deleting the `laneEpicId` forwarding in the component changed no output
    // anywhere and the suite stayed at 26/26. The narrowing is the model's;
    // what this pins is that the component hands the prop over.
    const { container } = renderTimeline([epic, child, orphan], { laneEpicId: 'epic1' });
    expect(
      [...container.querySelectorAll('[data-ticket-id]')].map((row) =>
        row.getAttribute('data-ticket-id'),
      ),
    ).toEqual([child.state.id]);
    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No epic' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Loose' })).toBeNull();
  });

  /**
   * 11.159 — `isEpicType`, the pass-through this component never had, reaching
   * BOTH answers the model uses it for.
   *
   * `buildTimelineModel` has accepted it since Task 10 and this view did not
   * forward it, so every lane used the built-in `epic` id while the server
   * groups by RANK 1 (`routes/list.ts`). One fixture witnesses both reaches at
   * once, and neither alone would be enough:
   *
   * - `epicAncestorOf` — with the prop the child is grouped under
   *   "Registrations"; without it the walk reaches a parent it does not know as
   *   an epic and answers null, so the child lands under "No epic".
   * - the `isEpicType(typeId) && start === null && due === null` arm — with the
   *   prop the undated initiative is a LANE HEADING and gets no row and no side
   *   entry; without it, it is an ordinary undated ticket and appears in the
   *   side list, which is the aside this case asserts is absent.
   *
   * `CalendarView` gained the same prop in the same change (11.158). Fixing one
   * view alone would have left the calendar and the timeline answering
   * differently about the same ticket's epic on two tabs of one page.
   */
  it("11.159 a workspace's OWN rank-1 type heads the lane and is kept out of the side list", () => {
    const initiative = ticket({
      id: 'init1',
      typeId: 'initiative',
      fields: { title: claimField('Registrations') },
    });
    const child = ticket({
      parentId: 'init1',
      fields: {
        title: claimField('DLT'),
        startDate: claimField({ date: '2026-08-24' }),
        dueDate: claimField({ date: '2026-08-28' }),
      },
    });
    const { container } = renderTimeline([initiative, child], {
      isEpicType: (typeId) => typeId === 'initiative',
    });

    expect(screen.getByRole('heading', { name: 'Registrations' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'No epic' })).toBeNull();
    // A lane, not missing work: no row of its own, and not in the side list.
    expect(container.querySelector('[data-ticket-id="init1"]')).toBeNull();
    expect(screen.queryByRole('complementary')).toBeNull();

    const lanes = [...container.querySelectorAll('.gn-timeline__group')].map((group) => ({
      heading: group.querySelector('h3')?.textContent,
      tickets: [...group.querySelectorAll('[data-ticket-id]')].map((row) =>
        row.getAttribute('data-ticket-id'),
      ),
    }));
    expect(lanes).toEqual([{ heading: 'Registrations', tickets: [child.state.id] }]);
  });
});

/**
 * E4-28 (batch B15, case `11.223`) — the timeline's own half of the same
 * finding calendar-view.test.tsx's `11.222` covers: a bar's rendered text is
 * its ticket title alone, and the date span lives only in the `title`
 * attribute, not reliably read by assistive tech (it requires hover, which
 * touch/mobile AT has no equivalent for). `docs/lanes/review-ui-exec4.md:446`.
 */
describe("11.223 a timeline bar's date span is a linked DESCRIPTION, not folded into its accessible name", () => {
  it('keeps the accessible NAME exactly the ticket title, and links the dates as aria-describedby', () => {
    renderTimeline([
      ticket({
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      }),
    ]);
    // Unchanged from 11.73 above: proves this fix did not fold the date into
    // the name a caller already depends on to find the control.
    const bar = screen.getByRole('button', { name: 'Dated' });
    const describedById = bar.getAttribute('aria-describedby');
    expect(describedById).not.toBeNull();
    const description = document.getElementById(describedById!);
    expect(description).not.toBeNull();
    const provenance = barProvenance(
      { date: '2026-08-24', actorId: 'user_kiro' },
      { date: '2026-08-28', actorId: 'user_kiro' },
      userName,
    );
    expect(description).toHaveTextContent(provenance);
    // Not a second, competing statement of the same text: the attribute the
    // hover-only title carried is unchanged, and the description is the SAME
    // string linked a second, AT-reachable way — not a duplicate invention.
    expect(bar).toHaveAttribute('title', description!.textContent);
  });
});

describe('23.143 the undated list speaks to the person and offers "Add dates" (audit PV-11)', () => {
  const bare = (title: string) => ticket({ fields: { title: claimField(title) } });

  it('23.143 a list of undated tickets reads "These tickets have no dates yet.", under a counted heading, with an Add dates button per ticket', () => {
    const { onOpenTicket } = renderTimeline([bare('Order till roll'), bare('Call the CA')]);
    const side = within(sideList());
    expect(side.getByRole('heading', { name: 'Not on the timeline yet (2)' })).toBeInTheDocument();
    expect(side.getByText('These tickets have no dates yet.')).toBeInTheDocument();
    // The builder's voice is gone, from the heading and from the whole list.
    expect(sideList().textContent).not.toContain('No bar is invented');
    expect(TIMELINE_SIDE_LIST_COPY).not.toContain('No bar is invented');
    expect(TIMELINE_SIDE_LIST_UNDRAWABLE_COPY).not.toContain('No bar is invented');

    const add = side.getByRole('button', { name: 'Add dates to Order till roll' });
    expect(add).toHaveTextContent('Add dates');
    fireEvent.click(add);
    expect(onOpenTicket).toHaveBeenCalledTimes(1);
    expect(onOpenTicket).toHaveBeenCalledWith(expect.stringMatching(/^t\d+$/));
    // One action per ticket, no more.
    expect(side.getAllByRole('button', { name: /^Add dates to / })).toHaveLength(2);

    // CONTROL — "no dates yet" is only said while it is TRUE: a due-only ticket has a date, so the list says what it lacks.
    document.body.innerHTML = '';
    renderTimeline([bare('Order till roll'), ticket({ fields: { title: claimField('Due only'), dueDate: claimField({ date: '2026-08-28' }) } })]);
    expect(within(sideList()).queryByText('These tickets have no dates yet.')).toBeNull();
    expect(within(sideList()).getByText(TIMELINE_SIDE_LIST_COPY)).toBeInTheDocument();
    expect(TIMELINE_SIDE_LIST_COPY).toBe('Add a start and a due date to place a ticket on the timeline.');
  });
});
