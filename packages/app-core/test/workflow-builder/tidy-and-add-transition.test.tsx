import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { layoutDraft } from '../../src/workflow-builder/layout.js';
import { NODE_GAP, rectsOverlap } from '../../src/workflow-builder/collision.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { AddTransitionForm, transitionExists } from '../../src/workflow-builder/ui/add-transition-form.js';
import { UNMEASURED_NODE } from '../../src/workflow-builder/ui/flow-graph.js';
import { TidyControl } from '../../src/workflow-builder/ui/tidy-control.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.js';

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

function renderWith(store: DraftStore, ui: React.ReactNode, overrides: Partial<BuilderEnvironment> = {}) {
  return render(<BuilderProvider store={store} env={env(overrides)}>{ui}</BuilderProvider>);
}

/** A draft whose boxes have been dragged about, so Tidy has something to undo. */
function scatteredStore(): DraftStore {
  const store = createDraftStore(draftFromTemplate(errand));
  store.actions.moveState('later', { x: 500, y: 20 });
  store.actions.moveState('next', { x: 503, y: 25 });
  return store;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('G-9 T4: setPositions', () => {
  /** 25.535 */
  it('25.535 setPositions replaces every position in ONE notify', () => {
    const store = createDraftStore(draftFromTemplate(errand));
    const listener = vi.fn();
    store.subscribe(listener);
    const next = layoutDraft(store.getState().def);
    store.actions.setPositions({ ...next, later: { x: 1, y: 2 } });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().positions.later).toEqual({ x: 1, y: 2 });
    // every id came from the argument, in one object: not merged into the old one
    expect(Object.keys(store.getState().positions).sort()).toEqual(Object.keys(next).sort());
    store.actions.setPositions({ later: { x: 9, y: 9 } });
    expect(store.getState().positions).toEqual({ later: { x: 9, y: 9 } });
  });
});

describe('G-9 T4: Tidy and Undo tidy', () => {
  /** 25.536 */
  it('25.536 Tidy lays the draft out with no two boxes overlapping, offers Undo tidy, and Undo tidy restores the exact previous positions', () => {
    const store = scatteredStore();
    const before = store.getState().positions;
    renderWith(store, <TidyControl />);
    // control: nothing to undo before Tidy
    expect(screen.queryByRole('button', { name: 'Undo tidy' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }));
    const tidied = store.getState().positions;
    expect(tidied).toEqual(layoutDraft(store.getState().def));
    const rects = Object.values(tidied).map((position) => ({ ...position, ...UNMEASURED_NODE }));
    for (let a = 0; a < rects.length; a += 1) {
      for (let b = a + 1; b < rects.length; b += 1) expect(rectsOverlap(rects[a]!, rects[b]!, NODE_GAP)).toBe(false);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Undo tidy' }));
    expect(store.getState().positions).toEqual(before);
    // the button goes once it has been used
    expect(screen.queryByRole('button', { name: 'Undo tidy' })).toBeNull();
  });

  /** 25.537 */
  it('25.537 Undo tidy goes after 10 s (control: still there at 9.999 s) and after any other move', () => {
    vi.useFakeTimers();
    const store = scatteredStore();
    renderWith(store, <TidyControl />);
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }));
    act(() => void vi.advanceTimersByTime(9_999));
    expect(screen.getByRole('button', { name: 'Undo tidy' })).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.queryByRole('button', { name: 'Undo tidy' })).toBeNull();

    // a second Tidy, then a move: the button is gone at once
    fireEvent.click(screen.getByRole('button', { name: 'Tidy' }));
    expect(screen.getByRole('button', { name: 'Undo tidy' })).toBeInTheDocument();
    act(() => store.actions.moveState('later', { x: 1, y: 1 }));
    expect(screen.queryByRole('button', { name: 'Undo tidy' })).toBeNull();
    // and a stale undo cannot clobber the move: nothing to click, the position stays
    expect(store.getState().positions.later).toEqual({ x: 1, y: 1 });
  });

  /** 25.538 */
  it('25.538 a viewer (canAuthor false) is offered no Tidy, no Add transition and no Add state, in the header or the canvas corner; control: an admin is', async () => {
    const draft = draftFromTemplate(errand);
    const screenFor = (role: 'admin' | 'member') => (
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role }}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />
    );
    const admin = render(screenFor('admin'));
    await screen.findByRole('button', { name: 'Add state' });
    expect(screen.getAllByRole('button', { name: 'Tidy' }).length).toBeGreaterThanOrEqual(2); // header + canvas corner
    expect(screen.getByRole('button', { name: 'Add transition' })).toBeInTheDocument();
    admin.unmount();

    render(screenFor('member'));
    await screen.findByRole('textbox', { name: 'Workflow name' });
    expect(screen.queryByRole('button', { name: 'Add state' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add transition' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tidy' })).toBeNull();
    // the canvas on its own, too (the corner Tidy is the canvas's)
    cleanup();
    renderWith(createDraftStore(draft), <WorkflowCanvas />, { canAuthor: false });
    expect(screen.getByRole('button', { name: 'Fit to screen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tidy' })).toBeNull();
  });
});

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Add transition' }));
  return screen.findByRole('dialog', { name: 'Add transition' });
}
async function optionsOf(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, label: string) {
  await user.click(within(dialog).getByRole('button', { name: new RegExp(`${label}$`) }));
  const listbox = await screen.findByRole('listbox');
  const names = within(listbox).getAllByRole('option').map((option) => option.textContent);
  await user.keyboard('{Escape}');
  return names;
}
async function pick(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, label: string, option: string) {
  await user.click(within(dialog).getByRole('button', { name: new RegExp(`${label}$`) }));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: option }));
}

describe('G-9 T4: Add transition', () => {
  /** 25.539 */
  it('25.539 From lists every state plus Any state, To lists every state and no Any state; Add adds the transition and selects it', async () => {
    const user = userEvent.setup({ delay: null });
    const store = createDraftStore(draftFromTemplate(errand));
    const names = store.getState().def.states.map((state) => state.name);
    const onAdded = vi.fn();
    renderWith(store, <AddTransitionForm onAdded={onAdded} />);
    const dialog = await openForm(user);
    expect(await optionsOf(user, dialog, 'From')).toEqual(['Any state', ...names]);
    expect(await optionsOf(user, dialog, 'To')).toEqual(names);

    const count = store.getState().def.transitions.length;
    await pick(user, dialog, 'From', 'Any state');
    await pick(user, dialog, 'To', 'Done');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));
    const { def, selection } = store.getState();
    expect(def.transitions).toHaveLength(count + 1);
    expect(def.transitions.at(-1)).toEqual({ from: '*', to: 'done', rules: [] });
    expect(selection).toEqual({ kind: 'transition', index: count });
    expect(onAdded).toHaveBeenCalledWith(count);
    // the form closes
    expect(screen.queryByRole('dialog', { name: 'Add transition' })).toBeNull();
  });

  /** 25.540 */
  it('25.540 Add is disabled with an inline reason for an existing pair and for From = To; control: a fresh pair enables it', async () => {
    const user = userEvent.setup({ delay: null });
    const store = createDraftStore(draftFromTemplate(errand));
    const existing = store.getState().def.transitions[0]!;
    expect(existing.from).not.toBe('*');
    const nameOf = (id: string) => store.getState().def.states.find((state) => state.id === id)!.name;
    renderWith(store, <AddTransitionForm />);
    const dialog = await openForm(user);
    const add = within(dialog).getByRole('button', { name: 'Add' });
    // nothing picked yet: disabled, and no reason shouted at someone who has not chosen
    expect(add).toBeDisabled();

    await pick(user, dialog, 'From', nameOf(existing.from));
    await pick(user, dialog, 'To', nameOf(existing.to));
    expect(add).toBeDisabled();
    expect(within(dialog).getByText('That transition already exists')).toBeInTheDocument();

    await pick(user, dialog, 'To', nameOf(existing.from));
    expect(add).toBeDisabled();
    expect(within(dialog).getByText('Pick two different states')).toBeInTheDocument();
    expect(within(dialog).queryByText('That transition already exists')).toBeNull();

    // control: a pair that does not exist
    await pick(user, dialog, 'From', 'Any state');
    expect(within(dialog).queryByText('Pick two different states')).toBeNull();
    expect(add).toBeEnabled();
    expect(transitionExists(store.getState().def, '*', existing.from)).toBe(false);
    expect(transitionExists(store.getState().def, existing.from, existing.to)).toBe(true);
    // never reaches the store
    const count = store.getState().def.transitions.length;
    await pick(user, dialog, 'From', nameOf(existing.from));
    await pick(user, dialog, 'To', nameOf(existing.to));
    await user.click(add);
    expect(store.getState().def.transitions).toHaveLength(count);
  });
});
