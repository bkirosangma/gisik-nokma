import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.js';
import { BuilderPanels } from '../../src/workflow-builder/ui/builder-panels.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.js';

/**
 * Cases 10.155–10.163 — W1 polish (owner, 2026-10-01: *"Fix all four as recommended"*): every canvas edge
 * is clickable (10.155, 10.156), the rule controls' touch targets (10.157, 10.158 — the stylesheet half
 * is in `packages/ui/test/styling-b16-builder.test.ts`), the quiet danger buttons (10.159 — DOM half
 * here, stylesheet half there, contrast in `tokens.test.ts` 10.160), the column scrolling on its own
 * (10.161 — stylesheet only; 10.162/10.163 are browser measurements).
 */
const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;
const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function env(): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
  };
}

function renderCanvas(store: DraftStore) {
  return render(
    <BuilderProvider store={store} env={env()}>
      <WorkflowCanvas />
    </BuilderProvider>,
  );
}

function renderPanels(store: DraftStore) {
  return render(
    <BuilderProvider store={store} env={env()}>
      <BuilderPanels />
    </BuilderProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

describe('10.155 every transition is clickable on the canvas, conditions or not', () => {
  it('10.155 a transition with NO conditions is selected by clicking its arrow; one with conditions still is, by label or arrow', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(errand);
    const bare = draft.def.transitions.findIndex((transition) => transition.rules.length === 0);
    const ruled = draft.def.transitions.findIndex((transition) => transition.rules.length > 0);
    // CONTROL — the template really carries both kinds, so the two arms below read different edges.
    expect(bare).toBeGreaterThanOrEqual(0);
    expect(ruled).toBeGreaterThanOrEqual(0);
    const store = createDraftStore(draft);
    renderCanvas(store);

    // The label of a no-condition edge is a 0x0 box — the arrow is the only thing there is to click.
    expect(screen.getByTestId(`transition-label-${bare}`).textContent).toBe('');

    // CONTROL (same `it`) — an edge with conditions still selects from its label …
    await user.click(screen.getByTestId(`transition-label-${ruled}`));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: ruled });

    // … the arrow of the no-condition edge selects it …
    const hit = screen.getByTestId(`transition-hit-${bare}`);
    await user.click(hit);
    expect(store.getState().selection).toEqual({ kind: 'transition', index: bare });

    // … and so does the arrow of the edge with conditions (the hit area is for EVERY edge, not a patch for the empty ones).
    await user.click(screen.getByTestId(`transition-hit-${ruled}`));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: ruled });
  });

  it('10.155 the hit area is an invisible stroke at least 12px wide that takes pointer events on the stroke alone', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const hits = screen.getAllByTestId(/^transition-hit-/);
    // CONTROL — one per edge, not an empty set.
    expect(hits).toHaveLength(draftFromTemplate(errand).def.transitions.length);
    for (const hit of hits) {
      expect(hit.tagName.toLowerCase()).toBe('path');
      expect(Number(hit.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(12);
      expect(hit.getAttribute('stroke')).toBe('transparent');
      expect(hit.getAttribute('pointer-events')).toBe('stroke');
      expect(hit.getAttribute('fill')).toBe('none');
      expect(hit.getAttribute('d')).toMatch(/^M/);
    }
  });

  it('10.155 through the real screen: clicking a no-condition arrow expands that transition row', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(kanban);
    const bare = draft.def.transitions.findIndex((transition) => transition.rules.length === 0);
    expect(bare).toBeGreaterThanOrEqual(0);
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'admin' }}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    const section = screen.getByRole('heading', { name: /^Transitions \(/ }).closest('section')!;
    const rowButton = within(section).getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'))[bare]!;
    // CONTROL — the row starts collapsed, so "expanded" after the click is the click's doing.
    expect(rowButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(await screen.findByTestId(`transition-hit-${bare}`));
    expect(rowButton).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('10.159 the destructive buttons in the well are quiet danger buttons', () => {
  it('10.159 Remove rule and Delete transition wear the quiet class; the neutral control beside them does not', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(errand);
    const ruled = draft.def.transitions.findIndex((transition) => transition.rules.length > 0);
    const store = createDraftStore(draft);
    renderPanels(store);
    act(() => store.actions.select({ kind: 'transition', index: ruled }));
    const remove = screen.getAllByRole('button', { name: 'Remove rule' })[0]!;
    const del = screen.getByRole('button', { name: 'Delete transition' });
    for (const button of [remove, del]) {
      expect(button).toHaveClass('builder-quiet-danger');
      // Still the destructive affordance by class as well: the variant is kept, the quiet class overrides its ground.
      expect(button).toHaveClass('gn-button--danger');
    }
    // CONTROL — the non-destructive button in the same well does not wear it (the class is not on every button).
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    expect(screen.getByRole('button', { name: 'Add rule' })).not.toHaveClass('builder-quiet-danger');
  });

  it('10.159 Delete state wears it; Set as start does not', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    renderPanels(store);
    act(() => store.actions.select({ kind: 'state', stateId: 'doing' }));
    expect(screen.getByRole('button', { name: 'Delete state' })).toHaveClass('builder-quiet-danger');
    expect(screen.getByRole('button', { name: 'Set as start' })).not.toHaveClass('builder-quiet-danger');
  });
});

describe('10.158 the Add rule menu items carry the 44px class', () => {
  it('10.158 every menu item is an add-rule-menu__item and the trigger keeps its own class', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(errand);
    const store = createDraftStore(draft);
    renderPanels(store);
    act(() => store.actions.select({ kind: 'transition', index: 0 }));
    const trigger = screen.getByRole('button', { name: 'Add rule' });
    expect(trigger).toHaveClass('add-rule-menu__trigger');
    await user.click(trigger);
    const items = screen.getAllByRole('menuitem');
    // CONTROL — the menu really opened with its items.
    expect(items.length).toBeGreaterThanOrEqual(3);
    for (const item of items) expect(item).toHaveClass('add-rule-menu__item');
  });
});

/**
 * Cases 10.166–10.167 — the Add rule menu is a `role="menu"`, so it keeps a menu's promises (polish 2, 2026-10-01: the
 * controller's browser pass found two real Escape presses left it open with focus on an item).
 */
describe('10.166 Escape closes the Add rule menu and returns focus to its trigger', () => {
  async function openMenuWithFocusOnFirstItem(user: ReturnType<typeof userEvent.setup>) {
    const store = createDraftStore(draftFromTemplate(errand));
    const { container } = renderPanels(store);
    act(() => store.actions.select({ kind: 'transition', index: 0 }));
    const trigger = screen.getByRole('button', { name: 'Add rule' });
    await user.click(trigger);
    await user.tab();
    return { trigger, store, container };
  }

  it('10.166 the first Escape closes the menu, focuses the trigger and is consumed; the second does nothing and is NOT swallowed', async () => {
    const user = userEvent.setup();
    const { trigger, container } = await openMenuWithFocusOnFirstItem(user);
    const seen: { key: string; defaultPrevented: boolean }[] = [];
    const listener = (event: KeyboardEvent) => seen.push({ key: event.key, defaultPrevented: event.defaultPrevented });
    // On the React root itself (still reached after the menu's own handler ran): the press is marked HANDLED — the contract
    // `Dialog` and `Sheet` document ("a child that handles Escape must call `preventDefault()`").
    const atRoot: boolean[] = [];
    const rootListener = (event: KeyboardEvent) => atRoot.push(event.defaultPrevented);
    container.addEventListener('keydown', rootListener);
    document.addEventListener('keydown', listener);
    try {
      // CONTROL — the menu really is open with focus on an item, so "closed" after the key is the key's doing.
      expect(screen.getByRole('menu', { name: 'Add rule' })).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0]);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(document.activeElement).toBe(trigger);
      // The press was CONSUMED by the menu: nothing above it (a dialog, a sheet) also acts on it.
      expect(seen).toEqual([]);
      expect(atRoot).toEqual([true]);

      // Second Escape, menu closed: nothing changes, and the key is NOT swallowed — a surface above still sees it.
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(seen).toEqual([{ key: 'Escape', defaultPrevented: false }]);
      expect(atRoot).toEqual([true, false]);
    } finally {
      container.removeEventListener('keydown', rootListener);
      document.removeEventListener('keydown', listener);
    }
  });

  it('10.166 Escape inside the inspector is not swallowed when the menu is closed', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderPanels(store);
    act(() => store.actions.select({ kind: 'transition', index: 0 }));
    const seen: boolean[] = [];
    const listener = (event: KeyboardEvent) => seen.push(event.defaultPrevented);
    document.addEventListener('keydown', listener);
    try {
      // CONTROL — no menu is open, and focus is on another control of the same inspector (the trigger itself).
      const trigger = screen.getByRole('button', { name: 'Add rule' });
      trigger.focus();
      expect(screen.queryByRole('menu')).toBeNull();
      await user.keyboard('{Escape}');
      expect(seen).toEqual([false]);
      // …and it DOES swallow while open (the contrast that makes the line above a reading).
      await user.click(trigger);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(seen).toEqual([false]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });
});

describe('10.167 the Add rule menu moves focus with the arrow keys, Home and End', () => {
  it('10.167 ArrowDown/ArrowUp step between items and wrap; Home and End jump', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderPanels(store);
    act(() => store.actions.select({ kind: 'transition', index: 0 }));
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.tab();
    const items = screen.getAllByRole('menuitem');
    // CONTROL — focus starts on the first item of a menu with several, so each move below is a move.
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(document.activeElement).toBe(items[0]);

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[1]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(items[items.length - 1]);
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(items[0]);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(items[items.length - 1]);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(items[0]);
    // The menu is still open (navigation does not close it) and nothing was added.
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
