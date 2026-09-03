import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_NARROWED_COPY,
  TIMELINE_OUT_OF_WINDOW_COPY,
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
import { TimelineView } from '../../src/timeline/timeline-view.js';

/**
 * 11.73–11.82 — `TimelineView`, the week columns over Task 10's landed model.
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
 * aside rendered over an empty list, a clipped marker on a bar that fits.
 * Those three were covered from the start. These were not, and each is now
 * pinned at the site named beside it:
 *
 * - the side entry's custom-claim list, whose twin on the ROW was witnessed
 *   both ways while the identical conditional here was not (11.80);
 * - the title column's own text, reached by every other assertion through
 *   some OTHER element, so emptying it left the whole suite green (11.79);
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
 * A Sunday. `mondayOnOrBefore` puts the window's first column on 2026-08-17,
 * so week 0 is 17 Aug and the eighth (default) column starts 5 Oct, closing
 * inclusively on 11 Oct.
 */
const TODAY = '2026-08-23';

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

/** The model's own label shape for a column, never a second spelling of it. */
const WEEK_17_AUG = 'W 17 Aug';
const WEEK_14_SEP = 'W 14 Sep';

function renderTimeline(
  tickets: TicketDatesInput[],
  extra: {
    onOpenTicket?: (ticketId: string) => void;
    today?: string;
    filter?: FilterSpec;
    laneEpicId?: string | null;
    isEpicType?: IsEpicType;
    weeksCount?: number;
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
      {...(extra.weeksCount === undefined ? {} : { weeksCount: extra.weeksCount })}
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
      barProvenance(
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

describe('11.74 the window moves four weeks at a time, and Today follows the prop rather than the mount', () => {
  it('Later shifts forward, Earlier comes back, and the columns that leave really leave', () => {
    renderTimeline([]);
    expect(screen.getByText(WEEK_17_AUG)).toBeInTheDocument();
    // 14 Sep is ALREADY on screen before the shift — the plan's own assertion
    // would have passed without the window moving at all. What proves the move
    // is that it becomes the FIRST column and that 17 Aug is gone.
    expect(screen.getByText(WEEK_14_SEP)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText(WEEK_17_AUG)).toBeNull();
    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_14_SEP);
    // And a column that could not have been in the old window is now in view.
    expect(screen.getByText('W 2 Nov')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Earlier' }));
    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_17_AUG);
    expect(screen.queryByText('W 2 Nov')).toBeNull();
  });

  it('Today returns to the day the shell is handing in NOW, not the one it mounted with', () => {
    const { rerender } = renderTimeline([]);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent(WEEK_14_SEP);

    // Midnight passed, or the shell simply re-rendered with a fresher day.
    rerender(
      <TimelineView tickets={[]} today="2026-10-07" userName={userName} onOpenTicket={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    // 2026-10-07 is a Wednesday; its Monday is 5 Oct. A component that had
    // captured the mounted `today` would land back on 17 Aug.
    expect(screen.getAllByText(/^W /)[0]).toHaveTextContent('W 5 Oct');
    expect(screen.queryByText(WEEK_17_AUG)).toBeNull();
  });
});

describe('11.75 three empty timelines are three different sentences, rendered verbatim', () => {
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

  it('a narrowing the viewer set', () => {
    const filter: FilterSpec = { assigneeIds: ['user_nobody'] };
    renderTimeline([dated()], { filter });
    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_NARROWED_COPY);
  });

  it('dated work scheduled outside these weeks — the arm the component cannot reconstruct', () => {
    renderTimeline([
      ticket({
        fields: {
          title: claimField('Next year'),
          startDate: claimField({ date: '2027-03-01' }),
          dueDate: claimField({ date: '2027-03-05' }),
        },
      }),
    ]);
    expect(screen.getByRole('note')).toHaveTextContent(TIMELINE_OUT_OF_WINDOW_COPY);
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

describe('11.79 a bar occupies the columns it was claimed for, and says which end the window cut', () => {
  const INSIDE = { title: 'Inside', start: '2026-08-24', due: '2026-08-28', column: '3 / 4' };
  const OVER_START = { title: 'Over start', start: '2026-08-10', due: '2026-08-28', column: '2 / 4' };
  const OVER_END = { title: 'Over end', start: '2026-08-24', due: '2026-11-01', column: '3 / 10' };
  const OVER_BOTH = { title: 'Over both', start: '2026-08-10', due: '2026-11-01', column: '2 / 10' };

  function spans() {
    return [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) =>
      ticket({
        fields: {
          title: claimField(span.title),
          startDate: claimField({ date: span.start }),
          dueDate: claimField({ date: span.due }),
        },
      }),
    );
  }

  it('places each bar on its own columns', () => {
    renderTimeline(spans());
    for (const span of [INSIDE, OVER_START, OVER_END, OVER_BOTH]) {
      expect(screen.getByRole('button', { name: span.title })).toHaveStyle({
        gridColumn: span.column,
      });
    }
  });

  it('names the ticket in the title column as well as inside the bar', () => {
    const { container } = renderTimeline(spans());
    // The 12rem title column exists BECAUSE a one-week bar clips its own
    // label — that is the whole reason the row is not just a bar. Every other
    // assertion in this file reaches a name through the bar button or through
    // a side entry, so emptying `.gn-timeline__title-text` made every name
    // vanish from the column with the suite at 26/26.
    const rows = [...container.querySelectorAll('.gn-timeline__row')].map((row) => ({
      title: row.querySelector('.gn-timeline__title-text')?.textContent,
      bar: row.querySelector('.gn-timeline__bar')?.textContent,
    }));
    expect(rows).toHaveLength(4);
    // The four names really arrived — a pairwise check alone would be
    // satisfied by an empty column beside an equally empty bar. Sorted,
    // because the row order is the model's business and 11.81 pins it.
    expect(rows.map((row) => row.title).sort()).toEqual(
      [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) => span.title).sort(),
    );
    // And each row names its OWN ticket in both places.
    for (const row of rows) expect(row.title).toBe(row.bar);
    // The copy counted above is the title column's, never the bar's.
    for (const node of container.querySelectorAll('.gn-timeline__title-text')) {
      expect(node.closest('.gn-timeline__bar')).toBeNull();
      expect(node.closest('.gn-timeline__title')).not.toBeNull();
    }
  });

  it('the header reserves the title column, so week i heads the column bar i lands on', () => {
    const { container } = renderTimeline(spans());
    // A PROXY, and named as one. jsdom computes no layout, so nothing here can
    // assert that a label sits over its bar. What it CAN assert is the
    // structure that alignment rests on: the weeks grid opens with one empty
    // spacer cell before the week cells, which is why week `i` occupies column
    // `i + 2` — exactly what the bar's computed `grid-column` says above.
    // Deleting the spacer slides every label one column left of the bar it
    // labels, and no assertion in this file could see it.
    const weeks = container.querySelector('.gn-timeline__weeks');
    const cells = [...(weeks?.children ?? [])];
    const weekCells = container.querySelectorAll('[data-week]');
    expect(weekCells.length).toBeGreaterThan(0);
    expect(cells).toHaveLength(weekCells.length + 1);
    expect(cells[0]).toHaveClass('gn-timeline__corner');
    expect(cells[0]?.textContent).toBe('');
    expect(cells[0]?.hasAttribute('data-week')).toBe(false);
    expect(cells.slice(1).every((cell) => cell.hasAttribute('data-week'))).toBe(true);
  });

  it('marks each clipped end at the end that was clipped, and nowhere else', () => {
    renderTimeline(spans());
    const clipping = [INSIDE, OVER_START, OVER_END, OVER_BOTH].map((span) => {
      const bar = screen.getByRole('button', { name: span.title });
      return {
        title: span.title,
        start: bar.getAttribute('data-clipped-start'),
        end: bar.getAttribute('data-clipped-end'),
      };
    });
    expect(clipping).toEqual([
      { title: 'Inside', start: null, end: null },
      { title: 'Over start', start: 'true', end: null },
      { title: 'Over end', start: null, end: 'true' },
      { title: 'Over both', start: 'true', end: 'true' },
    ]);
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

  it("renders the claim under its own field name, in the title column and not inside the bar", () => {
    const { container } = renderTimeline([filed()]);
    const claim = screen.getByText(customLabel('Filed on', '2026-08-26', 'user_anselma'));
    expect(claim).toHaveAttribute('data-field-id', 'filed-on');
    expect(claim.closest('.gn-timeline__title')).not.toBeNull();
    // The list is beside the ticket, never a cell in the week grid: it is not
    // inside the bar, and the bar is the only thing this row puts on a column.
    expect(claim.closest('.gn-timeline__bar')).toBeNull();
    expect(container.querySelectorAll('[data-custom-claims]')).toHaveLength(1);
  });

  it('appends the claim to the bar hover, after the bar provenance', () => {
    renderTimeline([filed()]);
    expect(screen.getByRole('button', { name: 'Dated' })).toHaveAttribute(
      'title',
      [
        barProvenance(
          { date: '2026-08-24', actorId: 'user_kiro' },
          { date: '2026-08-28', actorId: 'user_kiro' },
          userName,
        ),
        customLabel('Filed on', '2026-08-26', 'user_anselma'),
      ].join(' · '),
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
      barProvenance(
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

describe('11.82 the window width is the model\'s, stated once', () => {
  it('draws the default eight columns and publishes the count for the grids to read', () => {
    const { container } = renderTimeline([]);
    const root = container.querySelector('.gn-timeline');
    expect(container.querySelectorAll('[data-week]')).toHaveLength(8);
    expect(root).toBeInstanceOf(HTMLElement);
    // The TRACK LIST, not a bare count: `12rem var(--timeline-week-columns)`
    // substitutes a var as a component of the value, where
    // `repeat(var(--n), 1fr)` would substitute one into a function argument —
    // a form no test here could check, since jsdom computes no layout.
    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe(
      'repeat(8, 1fr)',
    );
  });

  it('forwards weeksCount unchanged rather than restating the default', () => {
    const { container } = renderTimeline([], { weeksCount: 2 });
    const root = container.querySelector('.gn-timeline');
    expect([...container.querySelectorAll('[data-week]')].map((n) => n.getAttribute('data-week'))).toEqual([
      '2026-08-17',
      '2026-08-24',
    ]);
    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe(
      'repeat(2, 1fr)',
    );
  });

  it('the stylesheet that CONSUMES the track list names the property the component publishes', () => {
    const { container } = renderTimeline([]);
    const root = container.querySelector('.gn-timeline');
    expect(root).toBeInstanceOf(HTMLElement);
    const inline = (root as HTMLElement).style;
    const published = [...Array(inline.length).keys()]
      .map((index) => inline.item(index))
      .filter((name) => name.startsWith('--'));
    // The NAME is not typed here — only the count. Typing it would make this
    // file a third spelling of the property, which is the duplication the case
    // exists to catch; the length is what says the component publishes exactly
    // one custom property and that `published[0]` below means something.
    expect(published).toHaveLength(1);

    // The count was de-duplicated INSIDE this component and then restated
    // across a package boundary: the producer is here, the consumer is
    // `packages/ui/src/ui.css`, and nothing tied the two spellings together.
    // Typing `--timeline-week-colummns` on the ui side left ui 34/34 AND
    // app-core 26/26 green — a `var()` naming an undefined property with no
    // fallback is invalid at computed-value time, so `grid-template-columns`
    // becomes `none`, every row drops onto implicit auto-placed tracks, and
    // each bar keeps a `grid-column` indexing into them. It is outside
    // `tokens.test.ts`'s var scan on purpose: that scan covers `--gn-` roles,
    // and a track list is not a colour.
    //
    // The name comes from the RENDERED COMPONENT above, so a rename on either
    // side of the boundary reddens here and names the other side.
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const consumed = [...css.matchAll(/var\((--timeline-[a-z0-9-]*)\)/g)].map((hit) => hit[1]);
    // The walk really read a stylesheet that reads the property — an empty
    // match list would satisfy a subset check by finding nothing at all.
    expect(consumed.length).toBeGreaterThan(0);
    expect([...new Set(consumed)]).toEqual(published);

    // And the SUBSTITUTION FORM, which a name check cannot see. `12rem
    // var(--…)` substitutes the property as a plain COMPONENT of the value;
    // `repeat(var(--…), 1fr)` substitutes into a function argument, fails to
    // parse, and turns the whole declaration into `none` — the same silent
    // collapse as the typo, behind the same green suite, because jsdom
    // computes no layout.
    // `12rem` is pinned DELIBERATELY, and it couples this app-core case to a ui
    // width: what is load-bearing is that exactly ONE track precedes the week
    // track list, because that is where the bar's `grid-column: i + 2` gets
    // its `+ 2`. A ui-side change to the number of leading tracks must be seen
    // here; a change to the width alone will redden this too, and re-reading
    // this comment is the intended cost.
    expect(css).toContain(`grid-template-columns: 12rem var(${published[0]});`);
    expect(css).not.toMatch(/repeat\(\s*var\(--timeline-/);
  });

  it('refuses a window it cannot mean rather than restating or clamping the default', () => {
    // `weeksCount` is forwarded, never defaulted here. `0` is the input that
    // separates a forward from a rescue: a `|| 8`, a `Math.max(1, …)` or any
    // clamp in this component swallows the model's refusal and silently draws
    // a window nobody asked for.
    //
    // MEASURED AND REPORTED AS A SURVIVOR: `?? 8` is NOT killed by this case.
    // `0 ?? 8` is `0`, `null` is not type-legal for this prop, and `undefined`
    // maps to the model's own 8 — so no input discriminates the forward from
    // that one restatement. The doc comment on `TimelineViewProps` forbids it;
    // nothing here proves it absent.
    expect(() => renderTimeline([], { weeksCount: 0 })).toThrow(RangeError);
  });

  it('states the column template ONCE: no inline grid-template-columns anywhere', () => {
    const { container } = renderTimeline([
      ticket({
        fields: {
          title: claimField('Dated'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-28' }),
        },
      }),
    ]);
    // The plan writes the template twice — header row and every ticket row —
    // from one expression. Two statements that can disagree would slide every
    // bar off the column it names, silently.
    expect(container.querySelectorAll('[style*="grid-template-columns"]')).toHaveLength(0);
    expect(container.querySelectorAll('.gn-timeline__row').length).toBeGreaterThan(0);
  });
});
