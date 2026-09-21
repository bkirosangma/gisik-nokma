import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { TemplateGallery } from '../../src/workflow-builder/ui/template-gallery.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };

describe('WorkflowBuilderScreen', () => {
  it('loads workspace data, then shows canvas, panels, name field and publish', async () => {
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(screen.getByText('Loading workspace people and types…')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue('Simple kanban');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('System rules — in every workflow')).toBeInTheDocument();
    expect(screen.getByText('No issues — this workflow can be published.')).toBeInTheDocument();
    expect(await screen.findByText('To do')).toBeInTheDocument(); // a canvas node — React Flow renders it a tick after mount
    expect(screen.getByText('Select a state or a transition to edit it.')).toBeInTheDocument();
  });

  it('edits the workflow name into the def', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(kanban);
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.clear(nameField);
    await user.type(nameField, 'Shop errands');
    expect(nameField).toHaveValue('Shop errands');
  });

  /**
   * 10.10 — add state from the header.
   */
  it('adds a state from the header button', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(screen.getByRole('button', { name: 'Add state' }));
    expect(await screen.findByText('New state')).toBeInTheDocument();
  });

  it('says so when workspace data cannot load', async () => {
    const gateway = createFakeGateway();
    gateway.listTicketTypes = async () => {
      throw new Error('boom');
    };
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(
      await screen.findByText('Could not load workspace people and types — reload to try again.'),
    ).toBeInTheDocument();
  });

  it('degrades to an empty roster instead of a fatal error when a guest is refused the member list', async () => {
    const gateway = createFakeGateway();
    gateway.listMembers = async () => {
      throw new Error('403 guest cannot list members');
    };
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue('Simple kanban');
    expect(screen.queryByText('Could not load workspace people and types — reload to try again.')).not.toBeInTheDocument();
  });

  it('disables the name field and hides Add state for non-authors', async () => {
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Add state' })).not.toBeInTheDocument();
  });

  /**
   * 10.93 — RULING E5-41, CRITICAL. Before this ruling the draft lived only in
   * the mounted screen's React state (`useState(() => createDraftStore(...))`)
   * and nowhere else, so any navigation away — the nav bar, the breadcrumb, the
   * browser's back button — unmounted the screen and discarded every edited
   * state, arrow and rule with no marker and no recovery. Simulated here the
   * same way the real edit route re-mounts it: unmount, then render again with
   * the SAME workspace and the SAME draft id (an edit route re-fetches the
   * identical published def on every visit).
   */
  it('10.93 recovers an edited draft after the screen unmounts and remounts, from this same tab', async () => {
    const workspaceId = newUlid();
    const draft = draftFromTemplate(kanban);
    const user = userEvent.setup();
    const first = render(
      <WorkflowBuilderScreen
        workspaceId={workspaceId}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.clear(nameField);
    await user.type(nameField, 'Renamed mid-session');
    expect(nameField).toHaveValue('Renamed mid-session');
    first.unmount();

    render(
      <WorkflowBuilderScreen
        workspaceId={workspaceId}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    // Recovered from `sessionStorage`, not from `draft` (the server's
    // last-published version, still named "Simple kanban") — a component that
    // silently reverted to `initialDraft` on remount would pass every OTHER
    // case in this file and fail only this assertion.
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue(
      'Renamed mid-session',
    );
  });

  it('10.93 a published draft clears its own recovery slot, so a later visit does not resurrect a stale pre-publish version', async () => {
    const workspaceId = newUlid();
    const draft = draftFromTemplate(kanban);
    const gateway = createFakeGateway();
    const onPublished = vi.fn();
    const user = userEvent.setup();
    const first = render(
      <WorkflowBuilderScreen
        workspaceId={workspaceId}
        session={adminSession}
        gateway={gateway}
        initialDraft={draft}
        onPublished={onPublished}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.clear(nameField);
    await user.type(nameField, 'Published name');
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    first.unmount();

    render(
      <WorkflowBuilderScreen
        workspaceId={workspaceId}
        session={adminSession}
        gateway={gateway}
        initialDraft={draft}
      />,
    );
    // `draft` still carries the pre-publish name ("Simple kanban") — the
    // route would in reality re-fetch the newly published def instead, but
    // reusing `draft` here is what proves the recovery slot itself was
    // cleared: if it were not, this remount would show "Published name" from
    // a STALE sessionStorage entry rather than from a fresh server read.
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue(
      'Simple kanban',
    );
  });
});

describe('WorkflowListScreen', () => {
  /**
   * 10.62 — published workflows list with name, v<version> and a state count; Open hands the route the id.
   */
  it('lists published workflows with version and state count, and opens one', async () => {
    const user = userEvent.setup();
    const first = cloneTemplate(kanban);
    const workflows = [{ ...first, version: 7 }];
    const onOpen = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows })}
        onOpen={onOpen}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Simple kanban')).toBeInTheDocument();
    // The version, the state count and the transition count on ONE line, built
    // from the fixture rather than typed out, so the assertion moves with the
    // template instead of pinning today's numbers. The version stayed when the
    // card grid replaced the row list — see the screen's docblock for why.
    expect(
      screen.getByText(
        `v7 · ${first.states.length} states · ${first.transitions.length} transitions`,
      ),
    ).toBeInTheDocument();
    // 13.311 — the per-row open control's aria-label carries THAT row's name;
    // the expected name is hard-coded, so a lost interpolation cannot pass.
    await user.click(screen.getByRole('button', { name: 'Open Simple kanban' }));
    expect(onOpen).toHaveBeenCalledWith(first.id);
  });

  /**
   * 13.920 — the card grid, the state chips and their category bars, and the
   * TWO ABSENCES the prototype draws and this product cannot back.
   *
   * The bars are asserted by CLASS and the classes are asserted to carry the
   * three category values the DOMAIN declares — a `switch` over
   * `WorkflowState.category`, so a fourth category appearing in
   * `stateCategorySchema` would leave a state with no bar rather than a
   * silently mis-coloured one. The COLOUR itself is measured, not asserted for
   * existence, in `packages/ui/test/tokens.test.ts` (the same split every
   * styling case in this repo uses: this file proves the component applies the
   * class, that file proves the class draws something).
   */
  it('13.920 draws a card per workflow with a bar per state category, and invents neither absent element', async () => {
    const first = cloneTemplate(kanban);
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [{ ...first, version: 3 }] })}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Simple kanban')).toBeInTheDocument();

    // The prototype's own header sentence (`desktop.dc.html:845`), exact.
    expect(
      screen.getByText('Publishing records a version. Nothing already recorded is rewritten.'),
    ).toBeInTheDocument();

    // One chip per state, and one bar per chip carrying THAT state's category.
    const bars = document.querySelectorAll('.workflow-list__state-bar');
    expect(bars).toHaveLength(first.states.length);
    expect([...bars].map((bar) => bar.className)).toEqual(
      first.states.map((state) => `workflow-list__state-bar workflow-list__state-bar--${state.category}`),
    );
    // Every declared category, so the set above is not satisfied by one class.
    expect(new Set(first.states.map((state) => state.category))).toEqual(
      new Set(['open', 'active', 'terminal']),
    );
    // The bar is decorative: the state's NAME is the accessible content.
    for (const bar of bars) expect(bar).toHaveAttribute('aria-hidden', 'true');

    // One CARD per workflow — the title claims a card per workflow, and until
    // this arm existed nothing counted them.
    const cards = document.querySelectorAll('.workflow-list__card');
    expect(cards).toHaveLength(1);

    // THE NAMED ABSENCE, asserted rather than assumed — a badge that can only
    // ever say "Published" is exactly what this repo keeps re-finding, so it is
    // pinned by CLASS and by CONTENT: a class-shaped guard alone would pass a
    // badge renamed to `.gn-chip`.
    expect(document.querySelector('.workflow-list__badge')).toBeNull();
    // THE SECOND ACTION IS NO LONGER ONE OF THEM. This arm used to read
    // `actions?.querySelectorAll('button')).toHaveLength(1)` — the count WAS the
    // assertion, and it was the right one while the action was held. Task 3 was
    // lifted by the owner on 2026-09-19 and the action now ships, so the arm
    // pins the opposite, **BY NAME AND BY ORDER**: a count of two would pass two
    // `Open` buttons, which is the failure this file's own habits warn about.
    const actions = document.querySelector('.workflow-list__actions');
    const actionButtons = [...(actions?.querySelectorAll('button') ?? [])];
    expect(actionButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      `Open ${first.name}`,
      `View history of ${first.name}`,
    ]);
    const card = cards[0]!;
    expect(card.textContent).not.toMatch(/Published|Superseded|Draft/);
    // Two now, and the count is a second witness rather than the assertion.
    expect(card.querySelectorAll('a, button')).toHaveLength(2);
  });

  /**
   * 10.63 — an author is offered New workflow, and an empty list says so in its own words.
   */
  it('offers New workflow to authors and says when the list is empty', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={onNew}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New workflow' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  /**
   * 10.64 — a rejected list read gets its own sentence, never the empty-list one.
   */
  it('says so when the workflow list cannot load', async () => {
    const gateway = createFakeGateway();
    gateway.listWorkflows = async () => {
      throw new Error('boom');
    };
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Could not load workflows — reload to try again.')).toBeInTheDocument();
  });

  it('hides New workflow from non-authors', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument();
  });
});

describe('TemplateGallery', () => {
  /**
   * 10.40 — the gallery offers the three templates plus Start blank.
   */
  it('offers the three templates and Start blank', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<TemplateGallery onPick={onPick} />);
    expect(screen.getByText('Start from a template')).toBeInTheDocument();
    for (const template of WORKFLOW_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.tagline)).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Use this template — Errand with waits' }));
    expect(onPick).toHaveBeenCalledWith(WORKFLOW_TEMPLATES[1]);
    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
