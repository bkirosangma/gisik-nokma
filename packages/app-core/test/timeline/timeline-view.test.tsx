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
 * EVERY CONDITIONAL AFFORDANCE IS ASSERTED IN BOTH DIRECTIONS. The recorded
 * failure class on this branch is a thing asserted present-when-expected and
 * never absent-when-not, so nothing detects OVER-firing: a `data-pending`
 * hard-coded to `'true'`, an aside rendered over an empty list, a clipped
 * marker on a bar that fits. Each block below carries its own negative.
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
