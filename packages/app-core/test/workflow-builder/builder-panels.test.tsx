import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { BuilderPanels } from '../../src/workflow-builder/ui/builder-panels.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';

/**
 * Cases 10.141–10.152 — the States and Transitions panels (owner, 2026-09-30: *"I need a panel that
 * lists all the transitions. and also another one that lists all the states. clicking on the
 * transitions should expand a section to show the settings"*; on the design: *"both expand in place,
 * as recommended"*). The right inspector is gone; each row is a disclosure whose body is the EXISTING
 * StateInspector / TransitionInspector, and the open row is derived from the draft store's one
 * `selection`, so two rows can never be open and the canvas and the lists cannot disagree.
 */
const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

function env(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
    ...overrides,
  };
}

function renderPanels(store: DraftStore, environment = env()) {
  return render(
    <BuilderProvider store={store} env={environment}>
      <BuilderPanels />
    </BuilderProvider>,
  );
}

function rowButtons(): HTMLButtonElement[] {
  // The phone Panels button (21.170) carries `aria-expanded` too, but it opens the sheet, not a row.
  return screen
    .queryAllByRole('button')
    .filter((button) => button.hasAttribute('aria-expanded') && !button.classList.contains('workflow-builder-screen__panels')) as HTMLButtonElement[];
}

/** A state's row — scoped to the States list, because "Doing → To do" (a transition row) also starts "Doing". */
function stateRow(name: string): HTMLButtonElement {
  const section = screen.getByRole('heading', { name: /^States \(/ }).closest('section')!;
  return within(section).getByRole('button', { name: new RegExp(`^${name}`) }) as HTMLButtonElement;
}

function openRows(): HTMLButtonElement[] {
  return rowButtons().filter((button) => button.getAttribute('aria-expanded') === 'true');
}

const scrollIntoView = vi.fn();

beforeEach(() => {
  scrollIntoView.mockReset();
  Element.prototype.scrollIntoView = scrollIntoView;
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('10.141 both lists render every state and transition with their summaries', () => {
  it('10.141 States (N) and Transitions (N): a row each, with category, tags, endpoints and a condition count', () => {
    const draft = draftFromTemplate(errand);
    const store = createDraftStore(draft);
    const states = draft.def.states;
    const transitions = draft.def.transitions;
    renderPanels(store);

    expect(screen.getByRole('heading', { name: `States (${states.length})` })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: `Transitions (${transitions.length})` })).toBeInTheDocument();

    // One disclosure per state and per transition — nothing dropped, nothing invented.
    expect(rowButtons()).toHaveLength(states.length + transitions.length);

    const stateSection = screen.getByRole('heading', { name: `States (${states.length})` }).closest('section')!;
    const labelOf = { open: 'Open', active: 'Active', terminal: 'Done' } as const;
    for (const state of states) {
      const row = within(stateSection).getByRole('button', { name: new RegExp(`^${state.name}`) });
      expect(row).toHaveTextContent(labelOf[state.category]);
      if (state.blocked === true) expect(row).toHaveTextContent('Blocked');
      else expect(row).not.toHaveTextContent('Blocked');
    }

    const transitionSection = screen.getByRole('heading', { name: `Transitions (${transitions.length})` }).closest('section')!;
    const nameOf = (id: string) => (id === '*' ? 'Any state' : states.find((state) => state.id === id)!.name);
    transitions.forEach((transition, index) => {
      const row = within(transitionSection).getAllByRole('button')[index]!;
      expect(row).toHaveTextContent(`${nameOf(transition.from)} → ${nameOf(transition.to)}`);
      const count = transition.rules.length;
      expect(row).toHaveTextContent(count === 0 ? 'No conditions' : count === 1 ? '1 condition' : `${count} conditions`);
    });
    // The errand template has both a guarded and an unguarded edge, so both summaries were exercised.
    expect(transitions.some((transition) => transition.rules.length === 0)).toBe(true);
    expect(transitions.some((transition) => transition.rules.length > 0)).toBe(true);
  });

  it('10.141 the plural "N conditions", the Start chip on the initial state only, and a from-any edge reading "Any state"', () => {
    const draft = draftFromTemplate(kanban);
    const store = createDraftStore({
      ...draft,
      def: { ...draft.def, transitions: [...draft.def.transitions, { from: '*', to: 'done', rules: [] }] },
    });
    store.actions.addRule(0, { kind: 'require-comment' });
    store.actions.addRule(0, { kind: 'require-evidence' });
    store.actions.addRule(1, { kind: 'require-comment' });
    renderPanels(store);
    const transitions = screen.getByRole('heading', { name: /^Transitions \(/ }).closest('section')!;
    const rows = within(transitions).getAllByRole('button');
    expect(rows[0]).toHaveTextContent('2 conditions');
    expect(rows[1]).toHaveTextContent('1 condition');
    expect(rows[1]).not.toHaveTextContent('1 conditions');
    expect(rows[2]).toHaveTextContent('No conditions');
    expect(rows[4]).toHaveTextContent('Any state → Done');
    // The Start chip marks the initial state and no other.
    expect(stateRow('To do')).toHaveTextContent('Start');
    expect(stateRow('Doing')).not.toHaveTextContent('Start');
    expect(stateRow('Done')).not.toHaveTextContent('Start');
  });

  it("10.141 a state that cannot start tickets carries the \"Can't create here\" tag; one that can does not", () => {
    const draft = draftFromTemplate(kanban);
    const store = createDraftStore(draft);
    store.actions.setStateCreatable('doing', false);
    renderPanels(store);
    expect(stateRow('Doing')).toHaveTextContent("Can't create here");
    expect(stateRow('To do')).not.toHaveTextContent("Can't create here");
  });
});

describe('10.142 expanding a transition shows its settings, and editing them changes the draft', () => {
  it('10.142 the body is the rule list with Add rule; Remove rule runs the same store action as before', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    const guarded = store.getState().def.transitions.findIndex((transition) => transition.rules.length > 0);
    expect(guarded).toBeGreaterThan(-1);
    renderPanels(store);
    const before = store.getState().def.transitions[guarded]!.rules.length;

    const row = screen.getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'))[
      store.getState().def.states.length + guarded
    ]!;
    await user.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Remove rule' })[0]!);
    expect(store.getState().def.transitions[guarded]!.rules).toHaveLength(before - 1);
    // CONTROL: the row summary follows the draft (the list is not a frozen copy).
    expect(row).toHaveTextContent(before - 1 === 0 ? 'No conditions' : before - 1 === 1 ? '1 condition' : `${before - 1} conditions`);
  });
});

describe('10.143 expanding a state shows its settings', () => {
  it('10.143 name field, Set as start and Delete state; renaming updates the draft and the row', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    await user.click(stateRow('Doing'));
    expect(screen.getByRole('button', { name: 'Set as start' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete state' })).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: 'State name' });
    await user.clear(name);
    await user.type(name, 'In review');
    expect(store.getState().def.states.find((state) => state.id === 'doing')?.name).toBe('In review');
    expect(stateRow('In review')).toHaveAttribute('aria-expanded', 'true');
    // CONTROL: the other states' rows are still collapsed and carry no fields.
    expect(screen.getAllByRole('textbox', { name: 'State name' })).toHaveLength(1);
  });
});

describe('10.144 one row open at a time across both lists', () => {
  it('10.144 opening a transition closes the open state, and the reverse; collapsing selects nothing', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    const doingRow = stateRow('Doing');
    const transitionRow = rowButtons()[store.getState().def.states.length]!;

    await user.click(doingRow);
    expect(openRows()).toEqual([doingRow]);
    await user.click(transitionRow);
    expect(doingRow).toHaveAttribute('aria-expanded', 'false');
    expect(openRows()).toEqual([transitionRow]);
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 0 });

    await user.click(doingRow);
    expect(openRows()).toEqual([doingRow]);
    expect(transitionRow).toHaveAttribute('aria-expanded', 'false');

    // Collapsing the open row is `select({ kind: 'none' })` — the same selection the canvas pane-click makes.
    await user.click(doingRow);
    expect(openRows()).toEqual([]);
    expect(store.getState().selection).toEqual({ kind: 'none' });
    // CONTROL: the body is unmounted with the row, not merely hidden (a stale inspector cannot linger).
    expect(document.querySelector('.state-inspector, .transition-inspector')).toBeNull();
  });
});

describe('10.144 a TRANSITION row collapses on a second click too', () => {
  it('10.144 clicking the open transition row again closes it and selects nothing (the state-row test above cannot see this arm)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    const transitionRow = rowButtons()[store.getState().def.states.length]!;

    // CONTROL — the first click opens it and selects it, so the second click below starts from a real open transition.
    await user.click(transitionRow);
    expect(transitionRow).toHaveAttribute('aria-expanded', 'true');
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 0 });

    await user.click(transitionRow);
    expect(transitionRow).toHaveAttribute('aria-expanded', 'false');
    expect(store.getState().selection).toEqual({ kind: 'none' });
    expect(document.querySelector('.transition-inspector')).toBeNull();
  });
});

describe('10.154 the rows carry the hooks the stylesheet selects on', () => {
  it('10.154 an open row is `li[data-open="true"] > .builder-row__head > .builder-row__chevron`, and a closed one says "false"', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    const doingRow = stateRow('Doing');
    const item = doingRow.closest('li')!;
    const chevron = () => item.querySelector(':scope > .builder-row__head > .builder-row__chevron');

    // CONTROL — closed: the chevron exists at the path the CSS names, and the row says "false".
    expect(chevron()).not.toBeNull();
    expect(item).toHaveAttribute('data-open', 'false');
    await user.click(doingRow);
    expect(item).toHaveAttribute('data-open', 'true');
    expect(chevron()).not.toBeNull();
  });
});

describe('10.145 the canvas and the lists share the one selection', () => {
  it('10.145 a selection made elsewhere (the canvas) opens its row and scrolls it into view, nearest, in the list', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    expect(openRows()).toEqual([]);
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => store.actions.select({ kind: 'state', stateId: 'doing' }));
    const doingRow = stateRow('Doing');
    expect(openRows()).toEqual([doingRow]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    // It is the ROW (button + body) that scrolls, not something outside the panels.
    expect(scrollIntoView.mock.contexts[0]).toBe(doingRow.closest('li'));

    act(() => store.actions.select({ kind: 'transition', index: 1 }));
    expect(openRows()).toEqual([rowButtons()[store.getState().def.states.length + 1]!]);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);

    // Selecting nothing (a pane click) collapses and does not scroll.
    act(() => store.actions.select({ kind: 'none' }));
    expect(openRows()).toEqual([]);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it('10.145 a click on a ROW does not scroll it (the change came from the row itself)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    await user.click(stateRow('Doing'));
    expect(openRows()).toHaveLength(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
    // And a canvas-side selection afterwards still scrolls: the row flag is consumed, not stuck on.
    act(() => store.actions.select({ kind: 'state', stateId: 'done' }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('10.145 stacked (one column, lists above the canvas) a canvas selection does NOT scroll; side by side it does', () => {
    const matchMedia = (matches: boolean) =>
      vi.fn((query: string) => ({ matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    try {
      window.matchMedia = matchMedia(true) as unknown as typeof window.matchMedia;
      const stacked = createDraftStore(draftFromTemplate(kanban));
      renderPanels(stacked);
      act(() => stacked.actions.select({ kind: 'state', stateId: 'doing' }));
      expect(openRows()).toHaveLength(1);
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect((window.matchMedia as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('(max-width: 64rem)');
      cleanup();

      // CONTROL: the same selection with a wide viewport scrolls, so the silence above is the gate, not a dead effect.
      window.matchMedia = matchMedia(false) as unknown as typeof window.matchMedia;
      const wide = createDraftStore(draftFromTemplate(kanban));
      renderPanels(wide);
      act(() => wide.actions.select({ kind: 'state', stateId: 'doing' }));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('10.145 an environment without scrollIntoView (jsdom) does not throw', () => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    expect(() => act(() => store.actions.select({ kind: 'state', stateId: 'doing' }))).not.toThrow();
    expect(openRows()).toHaveLength(1);
  });

  it('10.145 through the real screen: clicking a canvas node opens its row; opening a row highlights the canvas node', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(kanban);
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'admin' }}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(openRows().map((row) => row.textContent)).toEqual([expect.stringMatching(/^Doing/)]);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });

    await user.click(await screen.findByTestId('transition-label-0'));
    expect(openRows()).toHaveLength(1);
    expect(openRows()[0]).toHaveTextContent('→');

    // Row -> canvas: expanding the state row selects it, and the canvas node wears its selected class.
    await user.click(stateRow('To do'));
    expect(screen.getByTestId('state-node-todo')).toHaveClass('gn-state-node--selected');
    expect(screen.getByTestId('state-node-doing')).not.toHaveClass('gn-state-node--selected');
  });
});

describe('10.146 the right inspector is gone', () => {
  it('10.146 no right aside and no "Select a state…" hint; the lists sit in the left column above System rules', async () => {
    const { container } = render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'admin' }}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    expect(container.querySelector('.workflow-builder-screen__right')).toBeNull();
    expect(screen.queryByText('Select a state or a transition to edit it.')).not.toBeInTheDocument();
    // CONTROL: the layout still has its left column and canvas, and the lists precede System rules in it.
    const left = container.querySelector('.workflow-builder-screen__left')!;
    expect(left).not.toBeNull();
    expect(container.querySelector('.workflow-builder-screen__canvas')).not.toBeNull();
    const order = [...left.querySelectorAll('h3')].map((heading) => heading.textContent);
    expect(order.findIndex((text) => text?.startsWith('States ('))).toBe(0);
    expect(order.findIndex((text) => text?.startsWith('Transitions ('))).toBe(1);
    expect(order.findIndex((text) => text?.startsWith('System rules'))).toBeGreaterThan(1);
  });
});

describe('10.147 a row is a keyboard-operable disclosure', () => {
  it('10.147 Tab reaches a row; Enter and Space toggle aria-expanded; aria-controls names the body that exists', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    const first = rowButtons()[0]!;
    expect(first).toHaveAttribute('aria-expanded', 'false');
    await user.tab();
    expect(first).toHaveFocus();

    const bodyId = first.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();
    const body = document.getElementById(bodyId!);
    expect(body).not.toBeNull();
    expect(body).toHaveAttribute('hidden');

    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(bodyId!)).not.toHaveAttribute('hidden');
    await user.keyboard(' ');
    expect(first).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{Enter}');
    expect(first).toHaveAttribute('aria-expanded', 'true');
    // CONTROL: the button is a real <button> in the tab order, and the body is a sibling of it, never inside it.
    expect(first.tagName).toBe('BUTTON');
    expect(first.contains(document.getElementById(bodyId!))).toBe(false);
  });
});

describe('10.148 the universal transitions are read-only rows', () => {
  it('10.148 Start and Send to Backlog are listed last, are not buttons, and say every workflow has them', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    const { container } = renderPanels(store);
    const section = screen.getByRole('heading', { name: /^Transitions \(/ }).closest('section')!;
    const universal = within(section).getAllByRole('listitem').filter((item) => item.hasAttribute('data-universal')) as HTMLLIElement[];
    expect(universal).toHaveLength(2);
    expect(universal[0]).toHaveTextContent('Start');
    expect(universal[0]).toHaveTextContent('Backlog → To do');
    expect(universal[1]).toHaveTextContent('Send to Backlog');
    for (const item of universal) expect(within(item).queryByRole('button')).toBeNull();
    expect(section).toHaveTextContent(/every workflow has these/i);
    // They come AFTER the declared transitions, and they do not count toward "Transitions (N)".
    const items = [...section.querySelectorAll('li')];
    expect(items.indexOf(universal[0]!)).toBeGreaterThan(items.length - 3);
    expect(screen.getByRole('heading', { name: `Transitions (${store.getState().def.transitions.length})` })).toBeInTheDocument();
    // CONTROL: a declared row IS a button, and clicking a universal row selects nothing.
    fireEvent.click(universal[0]!);
    fireEvent.click(universal[1]!);
    expect(store.getState().selection).toEqual({ kind: 'none' });
    expect(rowButtons()).toHaveLength(store.getState().def.states.length + store.getState().def.transitions.length);
    expect(container.querySelectorAll('[data-universal]')).toHaveLength(2);
  });
});

describe('10.149 a read-only viewer still gets the lists, with the settings read-only', () => {
  it('10.149 a member expands a transition and sees the rules but no Add rule / Delete transition; an admin sees them', async () => {
    const user = userEvent.setup();
    for (const [canAuthor, role] of [
      [false, 'member'],
      [true, 'admin'],
    ] as const) {
      const store = createDraftStore(draftFromTemplate(errand));
      const environment = env({ canAuthor, session: { userId: newUlid(), role } });
      renderPanels(store, environment);
      const guarded = store.getState().def.transitions.findIndex((transition) => transition.rules.length > 0);
      await user.click(rowButtons()[store.getState().def.states.length + guarded]!);
      expect(openRows()).toHaveLength(1);
      if (canAuthor) {
        expect(screen.getByRole('button', { name: 'Add rule' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Delete transition' })).toBeInTheDocument();
      } else {
        expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Delete transition' })).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /^From .* to / })).toBeInTheDocument();
      }
      cleanup();
    }
  });
});

describe('10.150 empty lists say so', () => {
  it('10.150 no states -> "No states yet"; no transitions -> "No transitions yet. …"; the universal rows remain', () => {
    const draft = draftFromTemplate(kanban);
    const store = createDraftStore({ ...draft, def: { ...draft.def, states: [], transitions: [] } });
    renderPanels(store);
    expect(screen.getByText('No states yet')).toBeInTheDocument();
    expect(screen.getByText(/^No transitions yet\. /)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'States (0)' })).toBeInTheDocument();
    expect(rowButtons()).toHaveLength(0);
    // The universal rows remain even with nothing declared.
    expect(document.querySelectorAll('[data-universal]')).toHaveLength(2);
    cleanup();
    // A viewer who cannot author is not told to draw one.
    renderPanels(createDraftStore({ ...draft, def: { ...draft.def, states: [], transitions: [] } }), env({ canAuthor: false }));
    expect(screen.getByText('No transitions yet.')).toBeInTheDocument();
    expect(screen.queryByText(/draw one/)).not.toBeInTheDocument();
    // CONTROL: with content, neither empty message is shown.
    cleanup();
    renderPanels(createDraftStore(draftFromTemplate(kanban)));
    expect(screen.queryByText('No states yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/^No transitions yet/)).not.toBeInTheDocument();
  });
});

describe('10.151 publishing is untouched by the new layout', () => {
  it('10.151 the header still carries Add state and Publish, and Publish submits the draft', async () => {
    const user = userEvent.setup();
    const gateway = createFakeGateway();
    const onPublished = vi.fn();
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'admin' }}
        gateway={gateway}
        initialDraft={draftFromTemplate(kanban)}
        onPublished={onPublished}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    expect(screen.getByRole('button', { name: 'Add state' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(onPublished).toHaveBeenCalled());
    expect(gateway.submitted).toHaveLength(1);
  });
});
