import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardColumn, BoardGroup, BoardView } from '../../src/view-types.js';
import { Board, EMPTY_BOARD_COPY, type BoardMoveCapability } from '../../src/views/board.js';
import { WORKFLOW_COLLAPSE_KEY } from '../../src/preferences/workflow-collapse.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * The board's workflow group is a DISCLOSURE (owner request, 2026-09-23: *"in
 * the board, the workflow is collapsible. if the workflow has no tickets in it,
 * it is shown collapsed by default."*), and the choice is remembered in
 * `localStorage` (*"by persist i didnt mean to database/server. only on the
 * local storage, clientside"*).
 *
 * ## Why this is a file and not four more cases in `board.test.tsx`
 *
 * `board.test.tsx` is the read-only board's file and it is 60 KB; this feature
 * needs its own fixtures (two-workflow boards where one group is EMPTY, in
 * several card-count shapes), its own probes (a per-group rail lookup) and its
 * own storage hygiene (every case below starts from an empty `localStorage`).
 * The same judgement `board-moves-ui.test.tsx` and `board-close.test.tsx`
 * already made, for the same reason.
 *
 * ## ⚠ The request's premise, measured rather than accepted
 *
 * The owner's words read as though the group were already collapsible and only
 * the default needed changing. At the commit this branch is cut from, it is
 * not: `board.tsx` rendered a bare `<h2 class="gn-board__workflow">`, only when
 * there was more than one workflow group, and the columns below it always
 * rendered. So this file holds a NEW control, a new default and a new store,
 * and every case below is a claim about something that did not exist before.
 *
 * ## The one probe that is a MEASUREMENT, and it is not the obvious one
 *
 * `hidden` is the mechanism and is asserted as an ATTRIBUTE — the repo's own
 * idiom for it (`.gn-list__columns-tray[hidden]`, case `13.671`). But the
 * attribute is not the property the owner asked for; "not shown" is. So the
 * effect half of every visibility case is `queryByRole('region', …)`.
 *
 * ⚠ **MEASURED, not assumed: in THIS environment `hidden` filters `getByRole`
 * and nothing else.** A probe (Node v22.22.2, this package's own jsdom +
 * dom-testing-library) rendered one visible and one `hidden` `role="region"`
 * and read back `{"roleVisible":true,"roleHidden":false,"testIdHidden":true,
 * "textHidden":true}` — `queryByRole` excludes it, `queryByTestId` and
 * `queryByText` both still find it. A case here that reached for
 * `getByTestId`/`getByText` to prove a group was collapsed would therefore pass
 * over a rail that is still on screen, which is exactly the "a check that
 * cannot fail" shape. Every collapsed-group probe below is a ROLE query.
 */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const UI_CSS_PATH = resolve(REPO_ROOT, 'packages/ui/src/ui.css');

const CURRENT_USER = 'user_kiro';

/**
 * Every case starts from an empty store. `localStorage` is shared by every case
 * in a file, so a leaked record turns a later case green for the wrong reason —
 * the discipline `new-ticket-dialog.test.tsx`'s own `13.1355`–`13.1357` block
 * records for the sibling key, and the reason each case there clears first.
 */
beforeEach(() => {
  window.localStorage.clear();
});

// ------------------------------------------------------------------ fixtures

function column(name: string, cards: BoardCard[] = []): BoardColumn {
  return {
    stateId: name.toLowerCase().replace(/[^a-z]+/g, '-'),
    name,
    category: 'active',
    blocked: false,
    creatable: true,
    cards,
  };
}

function group(workflowId: string, workflowName: string, columns: BoardColumn[]): BoardGroup {
  return { workflowId, workflowVersion: 1, workflowName, columns };
}

function boardOf(groups: BoardGroup[], projectId = 'prj_00000000000000000000000001'): BoardView {
  return { projectId, groups };
}

/** Two workflows, one EMPTY (`Onboarding` holds no card in either column). */
function mixedBoard(): BoardView {
  return boardOf([
    group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')]),
    group('wf-onboarding', 'Onboarding', [column('Intake'), column('Review')]),
  ]);
}

/** The same two workflows, neither empty. */
function bothFilledBoard(): BoardView {
  return boardOf([
    group('wf-errand', 'Errand', [column('To do', [boardCardSeed({ ticketId: 'tk_a' })]), column('Done')]),
    group('wf-onboarding', 'Onboarding', [column('Intake'), column('Review', [boardCardSeed({ ticketId: 'tk_b' })])]),
  ]);
}

/** One workflow holding a card — the lone-group path. */
function loneBoard(): BoardView {
  return boardOf([group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')])]);
}

/** One workflow holding NOTHING — the trap the owner's ruling names. */
function loneEmptyBoard(): BoardView {
  return boardOf([group('wf-onboarding', 'Onboarding', [column('Intake'), column('Review')])]);
}

function movesFor() {
  const source = createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND });
  const moves: BoardMoveCapability = {
    dataSource: source,
    workspaceId: WS,
    currentUserId: CURRENT_USER,
    onMoved: vi.fn(),
  };
  return { moves };
}

/** The record as this build writes it, read back whole. */
function storedRecord(): unknown {
  return JSON.parse(window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY) ?? 'null');
}

// ------------------------------------------------------------------- helpers

/**
 * The rail belonging to ONE workflow group, found through its own heading
 * rather than through index order — a fixture that swapped its groups would
 * otherwise silently move every assertion in this file onto the other one.
 *
 * `workflowName` is optional because the helper is also used on boards whose
 * single group is addressed by name anyway; passing it requires exactly one
 * match, so a fixture mistake throws rather than testing the wrong group.
 */
function railOf(container: HTMLElement, workflowName?: string): HTMLElement {
  const sections = [...container.querySelectorAll('.gn-board__group')];
  const matched =
    workflowName === undefined
      ? sections
      : sections.filter((candidate) => candidate.querySelector('h2')?.textContent?.includes(workflowName));
  if (matched.length !== 1) {
    throw new Error(`${matched.length} group sections matched ${workflowName ?? '(no name given)'}`);
  }
  const rail = matched[0]?.querySelector('.gn-board__rail');
  if (!(rail instanceof HTMLElement)) throw new Error(`group ${workflowName ?? '(lone)'} rendered no rail`);
  return rail;
}

/** The group heading's disclosure button, addressed through its own heading. */
function toggleFor(workflowName: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name: workflowName });
  const button = heading.querySelector('button');
  if (!(button instanceof HTMLElement)) throw new Error(`heading ${workflowName} holds no button`);
  return button;
}

/** Is this group's column reachable on screen? (the effect half) */
function columnShown(workflowName: string, columnName: string): boolean {
  expect(toggleFor(workflowName), `${workflowName} has no disclosure button`).toBeInTheDocument();
  return screen.queryByRole('region', { name: columnName }) !== null;
}

// ---------------------------------------------------------------------- cases

describe('13.1406 the workflow heading is a disclosure button, and it says so', () => {
  it('each group heading holds a button carrying aria-expanded', () => {
    const { container } = render(<Board board={mixedBoard()} onOpenTicket={() => {}} />);

    for (const [workflowName, expected] of [
      ['Errand', 'true'],
      ['Onboarding', 'false'],
    ] as const) {
      const toggle = toggleFor(workflowName);
      // The tag is the property here: a `div` with a click handler would carry
      // `aria-expanded` and still not be a control.
      expect(toggle.tagName, `${workflowName}'s toggle is not a button`).toBe('BUTTON');
      expect(toggle.getAttribute('type'), `${workflowName}'s toggle is not type=button`).toBe('button');
      expect(toggle.getAttribute('aria-expanded'), `${workflowName}'s aria-expanded`).toBe(expected);
      // `aria-controls` must NAME something. A dangling reference is worse than
      // none: it tells assistive technology the control owns a region that does
      // not exist, and nothing about `aria-expanded` alone would catch it.
      const controls = toggle.getAttribute('aria-controls');
      expect(controls, `${workflowName}'s toggle controls nothing`).not.toBeNull();
      expect(
        container.querySelector(`#${controls}`),
        `${workflowName}'s aria-controls names no element`,
      ).not.toBeNull();
    }
  });
});

describe('13.1407 an empty workflow group starts collapsed', () => {
  it('the empty group is collapsed on mount, and its sibling is not', () => {
    const { container } = render(<Board board={mixedBoard()} onOpenTicket={() => {}} />);

    // The mechanism half.
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    // The effect half — and the POSITIVE CONTROL sits above it in the same
    // path: the SAME query, against the sibling group, must find a region, or a
    // `queryByRole` that simply never matches would read as a pass below.
    expect(
      columnShown('Errand', 'To do'),
      'the control arm failed: a non-empty group’s column was not found either',
    ).toBe(true);
    expect(columnShown('Onboarding', 'Intake')).toBe(false);
  });
});

describe('13.1408 a non-empty workflow group starts expanded', () => {
  it('neither group is collapsed when both hold tickets', () => {
    const { container } = render(<Board board={bothFilledBoard()} onOpenTicket={() => {}} />);

    expect(railOf(container, 'Errand').hasAttribute('hidden')).toBe(false);
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    // Both directions of the same query, so "everything is visible" cannot be
    // satisfied by a `hidden` attribute that is never written at all.
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeNull();
  });
});

describe('13.1409 collapsed hides the COLUMNS, not merely the cards', () => {
  it('a collapsed group takes its columns, their empty copy and their Add-a-ticket with it', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} onCreateTicket={() => {}} />,
    );

    // The control, FIRST and through the same path as the measurement below:
    // expanded, this group's columns and their per-column affordances ARE
    // reachable. `Create ticket` is the load-bearing one — it lives INSIDE a
    // column and is not a card, so losing it proves the column went, not just
    // the cards.
    //
    // Counted EXACTLY rather than `> 0`: three of this fixture's four columns
    // are empty (Errand's `Done`, plus both of Onboarding's), so the measure
    // below is "three became one", and the survivor is the SIBLING's. A
    // page-wide `toBeNull()` would have been a claim about the sibling's too.
    await user.click(toggleFor('Onboarding'));
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();
    // ⚠ `Create ticket` is the probe and `EMPTY_COLUMN_COPY` deliberately is NOT
    // one: this environment measures `getAllByText` as still finding text inside
    // a `hidden` subtree, so a case that counted the copy would pass over a
    // collapsed group. The copy is here to be LOST in the measurement below; the
    // button count is what can see that happen.
    expect(screen.getAllByRole('button', { name: /^Create ticket in / })).toHaveLength(3);

    await user.click(toggleFor('Onboarding'));
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Intake' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Review' })).toBeNull();
    // Three became one, and the survivor belongs to the group that did not collapse.
    const survivors = screen.getAllByRole('button', { name: /^Create ticket in / });
    expect(survivors).toHaveLength(1);
    expect(railOf(container, 'Errand').contains(survivors[0] ?? null)).toBe(true);
    // And the sibling group is untouched by the other group's collapse.
    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeNull();
  });
});

describe('13.1410 a person can collapse a non-empty group, and its cards go with it', () => {
  it('collapsing the group holding the card removes that card and leaves the sibling', async () => {
    const user = userEvent.setup();
    const { container } = render(<Board board={bothFilledBoard()} onOpenTicket={() => {}} />);

    // Control, first: ONE card per group is reachable before the click, so the
    // "one left" below is a measurement rather than an empty page.
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeNull();

    await user.click(toggleFor('Onboarding'));

    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Review' })).toBeNull();
    // `queryAllByRole('listitem')` is the card probe, and it is the ROLE query
    // on purpose: this environment measures `queryByText` as still finding text
    // inside a `hidden` subtree, so a case asserting the card's own title was
    // gone would report success over a card still on screen.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    // A collapse is per-group: the sibling keeps its own column and its card.
    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeNull();
    expect(railOf(container, 'Errand').hasAttribute('hidden')).toBe(false);
  });
});

describe('13.1411 the disclosure is reachable and operable by keyboard', () => {
  it('tabs to the heading button, and Enter then Space each flip it', async () => {
    const user = userEvent.setup();
    const { container } = render(<Board board={bothFilledBoard()} onOpenTicket={() => {}} />);
    const toggle = toggleFor('Onboarding');

    // Tabbing rather than `.focus()`: "reachable by keyboard" is a claim about
    // the tab order, and `focus()` would prove only that `.focus()` works. The
    // loop is bounded and stops on success, so this does not pin the button to a
    // tab index — only that it is IN the order.
    let hops = 0;
    while (document.activeElement !== toggle && hops < 12) {
      await user.tab();
      hops += 1;
    }
    expect(toggle, `the toggle was not reachable in ${hops} tab stops`).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);

    await user.keyboard(' ');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(false);
  });
});

describe('13.1412 a lone workflow is collapsible too, so it gets a control', () => {
  it('one group still renders a heading, and that heading holds a working toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(<Board board={loneBoard()} onOpenTicket={() => {}} />);

    // The heading used to render ONLY where there was more than one workflow
    // group, so this is the widened half of the owner's ruling: *"it must end up
    // with something to click, since it is collapsible."* A lone workflow is
    // collapsible, therefore it is named and it has a control.
    expect(screen.getAllByRole('heading', { level: 2, name: 'Errand' })).toHaveLength(1);

    const toggle = toggleFor('Errand');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);
    expect(railOf(container).hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('region', { name: 'To do' })).toBeNull();
  });
});

describe('13.1413 a lone workflow with no tickets still shows something to act on', () => {
  it('the empty single-workflow board renders its columns, its per-column action and the sentence', () => {
    const created: number[] = [];
    render(
      <Board board={loneEmptyBoard()} onOpenTicket={() => {}} onCreateTicket={() => created.push(1)} />,
    );

    // THE TRAP THE OWNER'S RULING NAMES, closed from two sides at once. An empty
    // workflow read literally as "the workflow has no tickets → collapsed by
    // default" would hide the only thing on this page behind a heading: the
    // per-column `Create ticket` buttons that are the only act available here.
    // The lone-group DEFAULT is expanded (13.1420 measures that as a default),
    // and what that leaves on screen is this — the columns, their action, and
    // the board's own sentence, which is a THIRD way out.
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Review' })).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /^Create ticket in / })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Create ticket' })).toBeInTheDocument();
  });

  it('and the person may still collapse it by hand — the DEFAULT is what was pinned, not the control', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Board board={loneEmptyBoard()} onOpenTicket={() => {}} onCreateTicket={() => {}} />,
    );

    expect(railOf(container).hasAttribute('hidden')).toBe(false);
    await user.click(toggleFor('Onboarding'));
    // Nothing is left but the heading and the sentence — which is a person's own
    // choice now, and not a state the board put them in.
    expect(railOf(container).hasAttribute('hidden')).toBe(true);
    expect(screen.getByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
  });
});

/**
 * 13.1414 — THE CHOICE IS REMEMBERED, KEYED BY USER AND BY PROJECT.
 *
 * `localStorage` outlives a session, so the record carries the user it was
 * written for and a record belonging to anyone else is not honoured — the
 * load-bearing half of the pattern `apps/web/src/use-last-workspace.ts`,
 * `use-last-project.ts` and `preferences/new-ticket-start.ts` establish, and the
 * reason the stored value is not a bare keyed set: sign out, hand the laptop
 * over, and a flat record would collapse the next person's workflow groups.
 *
 * The PROJECT half is a second scope rather than a duplicate of the first:
 * collapse is per workflow group WITHIN a project, and two projects can hold the
 * same workflow at the same version, so a record keyed by user alone would share
 * one collapsed set between two boards.
 */
describe('13.1414 the choice is remembered, per user and per project', () => {
  it('a collapse survives a real unmount and remount, and is stored against the user', async () => {
    const user = userEvent.setup();
    const first = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    await user.click(toggleFor('Onboarding'));
    expect(railOf(first.container, 'Onboarding').hasAttribute('hidden')).toBe(false);

    // The record, read back and compared WHOLE: the user id is what the key's
    // shape is for, and a record that stored the choices without it would still
    // satisfy the remount assertion below while being the leak this key exists
    // to prevent. `true` — the state the person CHOSE, and the reason a group
    // absent from this record is not the same as one stored as `false`.
    expect(storedRecord()).toEqual({
      userId: CURRENT_USER,
      projects: { prj_00000000000000000000000001: { 'wf-onboarding@1': true } },
    });

    first.unmount();
    const second = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    expect(railOf(second.container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('true');
  });

  it('a record written for ANOTHER user is not honoured — and the same bytes DO answer for the user they name', () => {
    window.localStorage.setItem(
      WORKFLOW_COLLAPSE_KEY,
      JSON.stringify({
        userId: 'usr_grace',
        projects: { prj_00000000000000000000000001: { 'wf-onboarding@1': true } },
      }),
    );

    // CONTROL FIRST, and it is the whole reason this case can be trusted: the
    // SAME bytes, read for the user the record names, DO open the empty group.
    // Without it, "the other user's record was refused" is indistinguishable
    // from a reader that failed for some unrelated reason — a typo in the key,
    // an unparsed shape — which is the failure mode `use-last-project.ts`'s own
    // 13.853 control names.
    const control = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId="usr_grace" />,
    );
    expect(railOf(control.container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    control.unmount();

    const { container } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
  });

  it('a record written for ANOTHER project is not honoured, and the project it names is', () => {
    window.localStorage.setItem(
      WORKFLOW_COLLAPSE_KEY,
      JSON.stringify({
        userId: CURRENT_USER,
        projects: { prj_00000000000000000000000009: { 'wf-onboarding@1': true } },
      }),
    );

    // Same two-arm shape, on the other axis: the project the record names gets
    // the choice...
    const control = render(
      <Board
        board={boardOf(mixedBoard().groups, 'prj_00000000000000000000000009')}
        onOpenTicket={() => {}}
        currentUserId={CURRENT_USER}
      />,
    );
    expect(railOf(control.container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    control.unmount();

    // ...and this one, which it does not, does not.
    const { container } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
  });

  it('a record this build does not recognise answers the default, and a signed-out board neither reads nor writes', async () => {
    const user = userEvent.setup();
    // Hand-edited, or written by a shape of this key that no longer exists. A
    // `"yes"` is refused WHOLE rather than filtered down to its well-formed
    // entries — a partially-honoured record is a board that collapses some of
    // what a person chose and silently ignores the rest.
    window.localStorage.setItem(
      WORKFLOW_COLLAPSE_KEY,
      JSON.stringify({
        userId: CURRENT_USER,
        projects: { prj_00000000000000000000000001: { 'wf-onboarding@1': 'yes' } },
      }),
    );
    const corrupted = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    expect(railOf(corrupted.container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    corrupted.unmount();

    // No session: `currentUserId` absent is the "no person attached" case, and
    // `''` is the shell's signed-out sentinel. Nothing is read and nothing is
    // written, so the next person to sign in on this machine inherits nothing.
    window.localStorage.clear();
    const signedOut = render(<Board board={mixedBoard()} onOpenTicket={() => {}} />);
    await user.click(toggleFor('Onboarding'));
    expect(railOf(signedOut.container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    expect(window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY), 'a signed-out toggle was written').toBeNull();
  });
});

describe('13.1415 a group nobody collapsed reveals new work', () => {
  it('an empty group that gains a ticket expands, and the expansion is written through', () => {
    const { container, rerender } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);

    // The same groups, one of them no longer empty — a card created in, or moved
    // into, the collapsed group.
    rerender(
      <Board
        board={boardOf([
          group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')]),
          group('wf-onboarding', 'Onboarding', [
            column('Intake', [boardCardSeed({ ticketId: 'tk_new' })]),
            column('Review'),
          ]),
        ])}
        onOpenTicket={() => {}}
        currentUserId={CURRENT_USER}
      />,
    );

    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(false);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('true');
    // AND IT PERSISTS, which is the half that makes the rule more than a
    // rendering accident: the group auto-opened once, and the record now holds
    // that OPEN as a choice, so a reload cannot put the new work back behind a
    // heading.
    expect(storedRecord()).toEqual({
      userId: CURRENT_USER,
      projects: { prj_00000000000000000000000001: { 'wf-onboarding@1': true } },
    });
  });

  it('the expansion is written ONCE — a re-read of the same board writes nothing', () => {
    // ⚠ THE OWNER NAMED THIS HAZARD BY NAME: *"the board re-reads on every stream
    // frame — a naive effect here is a write storm against the preferences door."*
    // The door moved to `localStorage` and the storm is no less real for being
    // synchronous and local, so the one-shot property is asserted rather than
    // reasoned about. Nothing else in this file can see it: every other case
    // reads the record's VALUE, and a record rewritten with the same value reads
    // back identical.
    //
    // ⚠ THE SPY MUST BE ON `Storage.prototype`, AND THAT IS MEASURED RATHER THAN
    // STYLED. jsdom's `localStorage` is a Proxy whose own property access answers
    // a bound method from the internal store, so BOTH `vi.spyOn(window.localStorage,
    // 'setItem')` AND a plain `window.localStorage.setItem = fn` are bypassed:
    // probed on this environment (Node v22.22.2), each recorded **0** calls while
    // the value was written and read back successfully — a check that would have
    // reported "no write storm" over ANY number of writes, including the storm it
    // exists to detect. The prototype-level spy recorded the write (1).
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const writes = () => setItem.mock.calls.filter(([key]) => key === WORKFLOW_COLLAPSE_KEY).length;

    const arrivedWithCard = boardOf([
      group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')]),
      group('wf-onboarding', 'Onboarding', [
        column('Intake', [boardCardSeed({ ticketId: 'tk_new' })]),
        column('Review'),
      ]),
    ]);
    const { rerender } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    // Mounting reads the record and writes nothing: hydration is not a choice.
    expect(writes(), 'mounting wrote to the store').toBe(0);

    const settle = (board: BoardView) =>
      rerender(<Board board={board} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />);

    settle(arrivedWithCard);
    expect(writes(), 'the transition did not write').toBe(1);

    // The four re-reads a stream frame or a refetch produces: the same object
    // twice, then a fresh but EQUAL one twice — the second pair is the real
    // test, because a re-read builds a new view and a guard keyed on identity
    // would hold where a guard keyed on the transition is what is wanted.
    settle(arrivedWithCard);
    settle(arrivedWithCard);
    settle(
      boardOf([
        group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')]),
        group('wf-onboarding', 'Onboarding', [
          column('Intake', [boardCardSeed({ ticketId: 'tk_new' })]),
          column('Review'),
        ]),
      ]),
    );
    settle(
      boardOf([
        group('wf-errand', 'Errand', [column('To do', [boardCardSeed()]), column('Done')]),
        group('wf-onboarding', 'Onboarding', [
          column('Intake', [boardCardSeed({ ticketId: 'tk_new' })]),
          column('Review'),
        ]),
      ]),
    );
    expect(writes(), 'the board re-wrote the store on a re-read of unchanged data').toBe(1);
    setItem.mockRestore();
  });
});

describe('13.1416 a group the PERSON collapsed stays collapsed when work arrives', () => {
  it('an explicit collapse holds across a ticket landing, and the store is not rewritten', async () => {
    const user = userEvent.setup();
    // Both groups hold a card, so neither starts collapsed — every collapse in
    // this case is one the person made.
    const { container, rerender } = render(
      <Board board={bothFilledBoard()} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    await user.click(toggleFor('Onboarding'));
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    const afterCollapse = storedRecord();

    rerender(
      <Board
        board={boardOf([
          group('wf-errand', 'Errand', [column('To do', [boardCardSeed({ ticketId: 'tk_a' })]), column('Done')]),
          group('wf-onboarding', 'Onboarding', [
            column('Intake', [boardCardSeed({ ticketId: 'tk_new' })]),
            column('Review', [boardCardSeed({ ticketId: 'tk_b' })]),
          ]),
        ])}
        onOpenTicket={() => {}}
        currentUserId={CURRENT_USER}
      />,
    );

    // THE RECONCILIATION THE RULING ASKED FOR BY NAME. The stored shape tells
    // "collapsed by the default" from "collapsed deliberately" — the first is
    // the absence of a key, the second is `false` — so the auto-expand rule
    // never touches this group, and the person's choice stands.
    expect(
      railOf(container, 'Onboarding').hasAttribute('hidden'),
      'the group auto-expanded under a person who had collapsed it',
    ).toBe(true);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('false');
    // And the store says the same thing it said before the ticket arrived: the
    // refusal to reopen is a refusal to WRITE, not a write the render ignored.
    expect(storedRecord()).toEqual(afterCollapse);
    expect(storedRecord()).toEqual({
      userId: CURRENT_USER,
      projects: { prj_00000000000000000000000001: { 'wf-onboarding@1': false } },
    });
  });

  it('a group the person collapsed, that then EMPTIED and refilled, is still collapsed', async () => {
    // ⚠ THIS ARM EXISTS BECAUSE A MUTATION ROUND FOUND THE ONE ABOVE INSUFFICIENT,
    // and the reason is worth stating: the case above never lets the group become
    // EMPTY, so it never becomes "collapsed by the default" either — which means
    // the auto-expand rule's `previous` guard alone already keeps it shut, and
    // dropping the `Object.hasOwn(groupChoices, key)` term leaves that case GREEN.
    // Measured: that mutation survived against the case above (20/20).
    //
    // The sequence below is the only one in which the term is load-bearing, and it
    // is a sequence a board reaches in ordinary use — collapse a column's worth of
    // work by hand, move the last ticket out, then move one back in:
    //
    //   non-empty ──person collapses──▶ collapsed ──empties──▶ collapsed-by-DEFAULT
    //              ──a ticket arrives──▶ non-empty again
    //
    // At the last step the group WAS collapsed by the default on the previous
    // render (so the `previous` guard is satisfied) AND carries a person's `false`
    // (so the hasOwn term is the only thing standing between the rule and undoing
    // their choice). Without it the group reopens, which is exactly the hazard the
    // owner named: *"if your stored shape cannot tell collapsed by the default
    // from collapsed deliberately by a person, say so and propose one that can,
    // rather than letting the auto-expand silently undo a manual collapse."*
    const user = userEvent.setup();
    const current = (columns: BoardColumn[]) =>
      boardOf([
        group('wf-errand', 'Errand', [column('To do', [boardCardSeed({ ticketId: 'tk_a' })]), column('Done')]),
        group('wf-onboarding', 'Onboarding', columns),
      ]);

    const { container, rerender } = render(
      <Board board={current([column('Intake', [boardCardSeed({ ticketId: 'tk_b' })]), column('Review')])} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />,
    );
    // Control, first: the group STARTS expanded and non-empty, so every collapse
    // below is one the person made.
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(false);

    await user.click(toggleFor('Onboarding'));
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);

    // It empties — so from this render on it is ALSO collapsed by the default,
    // and the auto-expand rule's transition guard is armed.
    rerender(<Board board={current([column('Intake'), column('Review')])} onOpenTicket={() => {}} currentUserId={CURRENT_USER} />);
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);

    // A ticket arrives. Both of the rule's other terms now point at OPENING it.
    rerender(
      <Board
        board={current([column('Intake', [boardCardSeed({ ticketId: 'tk_c' })]), column('Review')])}
        onOpenTicket={() => {}}
        currentUserId={CURRENT_USER}
      />,
    );

    expect(
      railOf(container, 'Onboarding').hasAttribute('hidden'),
      'the group reopened over a person’s own collapse, because the store could not tell the two apart',
    ).toBe(true);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('false');
    // And the new work is still reachable by the person, one click away — the
    // choice is respected, not a trap.
    await user.click(toggleFor('Onboarding'));
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();
  });
});

describe('13.1417 the caret is drawn, never typed — the accessible name is the workflow', () => {
  it('the toggle names exactly the workflow, with no direction glyph in it', () => {
    const { container } = render(<Board board={mixedBoard()} onOpenTicket={() => {}} />);

    // The name, asserted EXACTLY: a `▸` typed into the button's own text node
    // would join the accessible name, and a person would hear "▸ Onboarding".
    // `.gn-list__columns-caret`'s docblock is where this idiom comes from.
    for (const workflowName of ['Errand', 'Onboarding']) {
      const toggle = toggleFor(workflowName);
      expect(toggle.textContent, `${workflowName}'s button text`).toBe(workflowName);
    }
    expect(
      container.querySelectorAll('.gn-board__workflow-caret[aria-hidden="true"]').length,
      'no aria-hidden caret element rendered',
    ).toBe(2);
    expect(container.textContent ?? '').not.toContain('▸');
    expect(container.textContent ?? '').not.toContain('▾');
  });
});

describe('13.1418 the stylesheet attributes the disclosure uses are the ones the component writes', () => {
  it('reads [aria-expanded] and [hidden] out of the board rules and finds both in the DOM', async () => {
    const user = userEvent.setup();
    const css = readFileSync(UI_CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

    // Comments stripped first, for the reason `13.671` records: this stylesheet
    // is mostly prose and quotes its own selectors, so a rule DELETED but still
    // discussed would answer for itself.
    const attributesIn = (source: string): string[] =>
      [...source.matchAll(/[^{}\n]*\{/g)]
        .map((hit) => hit[0] ?? '')
        .filter((head) => /^\.gn-board__(workflow|rail)/.test(head.trim()))
        .flatMap((head) => [...head.matchAll(/\[([a-z-]+)/g)].flatMap((m) => m[1] ?? []));

    const styled = [...new Set(attributesIn(css))].sort();
    expect(styled, 'the board rules name no attribute selectors — the extractor is broken').toEqual([
      'aria-expanded',
      'hidden',
    ]);
    // POSITIVE CONTROL through the same reader: an attribute planted into the
    // same sheet is seen. Without it, a filter that matched nothing would leave
    // the assertion above failing for a reason it does not name.
    expect(attributesIn(`${css}\n.gn-board__rail[data-zz-probe] { display: none; }`)).toContain(
      'data-zz-probe',
    );

    // The caret's TWO rules, pinned here because nothing else can see them: a
    // `::after` contributes nothing to the DOM, so `13.1417`'s name assertion
    // would hold over a stylesheet whose caret had been deleted outright — the
    // control would be a word with no affordance and every case above green. The
    // rule keyed on `[aria-expanded='true']` is the half that makes the drawn
    // glyph a DISCLOSURE rather than decoration, so both halves are asserted.
    expect(css, 'the closed caret is gone').toMatch(
      /\.gn-board__workflow-caret::after\s*\{[^}]*content:\s*'▸'/,
    );
    expect(css, 'the open caret is gone, or is no longer keyed on aria-expanded').toMatch(
      /\.gn-board__workflow-toggle\[aria-expanded='true'\][^{]*\.gn-board__workflow-caret::after\s*\{[^}]*content:\s*'▾'/,
    );

    // And the other half of the binding: the component writes each attribute the
    // stylesheet keys on. Renaming one in the JSX leaves every class still
    // matching, and this is where that is caught.
    const { container } = render(<Board board={bothFilledBoard()} onOpenTicket={() => {}} />);
    const toggle = toggleFor('Onboarding');
    const rail = railOf(container, 'Onboarding');
    expect(toggle.hasAttribute('aria-expanded'), 'the component never writes [aria-expanded]').toBe(true);
    expect(rail.hasAttribute('hidden'), 'the component never writes [hidden]').toBe(false);
    await user.click(toggle);
    expect(
      container.querySelector('.gn-board__rail[hidden]'),
      'the component never writes [hidden]',
    ).not.toBeNull();
  });
});

describe('13.1419 the hook-owning path collapses with the same rules', () => {
  it('with moves wired, the empty group is still collapsed and toggles both ways', async () => {
    const user = userEvent.setup();
    const { moves } = movesFor();
    const { container } = render(
      <Board board={mixedBoard()} onOpenTicket={() => {}} onCreateTicket={() => {}} moves={moves} />,
    );

    // `BoardGroupWithMoves` wraps `BoardGroupSection` one level down, so a prop
    // forwarded on the plain path and forgotten on this one leaves the two paths
    // disagreeing with every read-only case above still green.
    expect(railOf(container, 'Onboarding').hasAttribute('hidden')).toBe(true);
    expect(railOf(container, 'Errand').hasAttribute('hidden')).toBe(false);
    expect(screen.queryByRole('region', { name: 'Intake' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'To do' })).not.toBeNull();

    await user.click(toggleFor('Onboarding'));
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();
    await user.click(toggleFor('Onboarding'));
    expect(screen.queryByRole('region', { name: 'Intake' })).toBeNull();
  });
});

describe('13.1420 a lone group rests expanded, even when it is empty', () => {
  it('one empty workflow is NOT collapsed by the empty-group default', () => {
    const { container } = render(<Board board={loneEmptyBoard()} onOpenTicket={() => {}} />);

    // The owner's answer on 2026-09-23: *"single workflow → UNCOLLAPSED,
    // including when it is empty."* The empty-group rule is about reclaiming a
    // row for the OTHER workflows on a board; where there is no other workflow
    // there is no row to reclaim, and collapsing would hide the board.
    //
    // Asserted here as the DEFAULT rather than only as an effect, and its
    // sibling `13.1413` carries the control arm: 13.1412 proves the toggle
    // EXISTS and works, so this cannot be satisfied by a board that simply
    // never collapsed anything.
    expect(railOf(container).hasAttribute('hidden')).toBe(false);
    expect(toggleFor('Onboarding').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('region', { name: 'Intake' })).not.toBeNull();

    // CONTROL, in the same case and the same store: the identical fixture with a
    // SECOND workflow group added is collapsed by that same rule. Without it,
    // "a lone group is expanded" is indistinguishable from an empty-group rule
    // that had stopped firing altogether.
    const two = render(
      <Board
        board={boardOf([
          group('wf-onboarding', 'Onboarding', [column('Intake'), column('Review')]),
          group('wf-errand', 'Errand', [column('To do', [boardCardSeed()])]),
        ])}
        onOpenTicket={() => {}}
      />,
    );
    expect(railOf(two.container, 'Onboarding').hasAttribute('hidden')).toBe(true);
  });
});
