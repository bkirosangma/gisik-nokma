import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newUlid, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { WorkflowHistoryScreen } from '../../src/workflow-builder/ui/workflow-history-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';

const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };
const WORKFLOW_ID = newUlid();

/**
 * Two versions of ONE workflow whose CONTENT differs, which is the whole point:
 * v1 carries a `Review` state and a transition through it, v2 dropped `Review`
 * and maps it forward to `Done`. A case asserting only that two version numbers
 * render would pass on a screen that drew the same definition twice — the
 * failure this fixture exists to make impossible.
 */
const v1: PublishedWorkflowDef = {
  id: WORKFLOW_ID,
  version: 1,
  name: 'Field ops',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'review', name: 'Review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'review', rules: [] },
    { from: 'review', to: 'done', rules: [] },
  ],
};
const v2: PublishedWorkflowDef = {
  ...v1,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
  stateMapping: { review: 'done' },
};

const versionCard = (version: number): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-version="${version}"]`)!;

describe('WorkflowHistoryScreen', () => {
  it('13.939 renders the whole chain, newest first, with the current version marked', async () => {
    render(
      <WorkflowHistoryScreen
        workspaceId={newUlid()}
        workflowId={WORKFLOW_ID}
        gateway={createFakeGateway({ workflows: [v1, v2] })}
      />,
    );
    expect(await screen.findByText('Version history')).toBeInTheDocument();

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    // Newest first, and asserted on the RENDERED order rather than on the array
    // the screen sorted — a reverse() that ran twice would leave both cards
    // present and the reading wrong.
    expect(cards.map((card) => card.getAttribute('data-version'))).toEqual(['2', '1']);

    expect(within(versionCard(2)).getByText('Current')).toBeInTheDocument();
    expect(within(versionCard(1)).getByText('Superseded')).toBeInTheDocument();
    expect(within(versionCard(2)).queryByText('Superseded')).toBeNull();

    // THE MARKER IS TWO THINGS, and this half is the one a word-assertion
    // cannot reach. The review's mutation D deleted the `--current` class and
    // **every case stayed green**, so the accent leading edge could silently
    // vanish while `Current` still printed. Pinned on the class the rule styles,
    // with the superseded card as the negative — a selector that matched every
    // card would pass the first line and fail the second.
    expect(versionCard(2).querySelector('.workflow-history__version--current')).not.toBeNull();
    expect(versionCard(1).querySelector('.workflow-history__version--current')).toBeNull();
  });

  /**
   * The acceptance's load-bearing half, and the reason the fixture's two
   * versions differ: **a superseded version is visible WITH ITS CONTENT.** A
   * screen that rendered only version numbers, or the latest definition twice,
   * satisfies every count in the case above and fails here.
   */
  it('13.940 renders a superseded version with its own content, not a version number', async () => {
    render(
      <WorkflowHistoryScreen
        workspaceId={newUlid()}
        workflowId={WORKFLOW_ID}
        gateway={createFakeGateway({ workflows: [v1, v2] })}
      />,
    );
    await screen.findByText('Version history');

    // v1's dropped state is drawn inside v1's card …
    expect(within(versionCard(1)).getByText('Review')).toBeInTheDocument();
    // … and NOWHERE inside v2's, which is what makes the assertion above a
    // statement about the chain rather than about the screen as a whole. A
    // screen rendering one definition under two headings passes the first half
    // and fails this one.
    expect(within(versionCard(2)).queryByText('Review')).toBeNull();

    // The control that keeps the absence above from being a broken render: v2's
    // own content is present, so "v2 has no Review" is a fact about v2 rather
    // than about an empty card.
    expect(within(versionCard(2)).getByText('To do')).toBeInTheDocument();
    expect(within(versionCard(2)).getByText('Done')).toBeInTheDocument();

    // And the CONTENT is not only the state names: v1 ran two transitions
    // through Review, v2 runs one, and v1's mapping column is absent because a
    // first version drops nothing.
    expect(within(versionCard(1)).getByText(/2 transitions/)).toBeInTheDocument();
    expect(within(versionCard(2)).getByText(/1 transition/)).toBeInTheDocument();
    expect(within(versionCard(2)).getByText(/maps 1 state/)).toBeInTheDocument();
  });

  it('13.941 says so rather than showing a short chain when a version does not answer', async () => {
    // A chain with a hole: the read answers v2 and not v1.
    const gateway = createFakeGateway({ workflows: [v2] });
    render(<WorkflowHistoryScreen workspaceId={newUlid()} workflowId={WORKFLOW_ID} gateway={gateway} />);
    expect(await screen.findByText(/1 version in this workflow's range did not answer/)).toBeInTheDocument();
  });

  /**
   * 13.943 — **a workflow that answers nothing says so, rather than loading
   * forever.** The review's mutation I replaced this branch with a bare `return`
   * and **all four history cases still passed**, because nothing asserted the
   * state a stale `workflowId` in the URL reaches: the screen would sit on
   * "Loading history…" for a workflow that does not exist, which is the shell
   * claiming an answer is on its way. The `load-error` branch is a rejection
   * rather than a null and stays uncovered; said here rather than implied.
   */
  it('13.943 says there are no published versions rather than loading forever', async () => {
    render(
      <WorkflowHistoryScreen
        workspaceId={newUlid()}
        workflowId={newUlid()}
        gateway={createFakeGateway({ workflows: [v2] })}
      />,
    );
    expect(await screen.findByText('No published versions to show.')).toBeInTheDocument();
    // The control: the loading line is GONE, so this is the answered state
    // rather than the sentence rendering beside a spinner that never stops.
    expect(screen.queryByText('Loading history…')).toBeNull();
  });
});

describe('WorkflowListScreen — the second action', () => {
  it('13.938 renders View history per card and opens it for THAT workflow', async () => {
    const user = userEvent.setup();
    const onHistory = vi.fn();
    const onOpen = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [v2] })}
        onOpen={onOpen}
        onHistory={onHistory}
        onNew={() => {}}
      />,
    );
    const history = await screen.findByRole('button', { name: 'View history of Field ops' });
    await user.click(history);
    expect(onHistory).toHaveBeenCalledWith(WORKFLOW_ID);
    // The control: the click reached the history door and not the open one, so
    // the assertion above is about the button rather than about a handler that
    // any click would have fired.
    expect(onOpen).not.toHaveBeenCalled();

    // Both candidates with no door stay absent, asserted rather than assumed.
    expect(screen.queryByRole('button', { name: /Duplicate/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Discard draft/ })).toBeNull();
  });
});
