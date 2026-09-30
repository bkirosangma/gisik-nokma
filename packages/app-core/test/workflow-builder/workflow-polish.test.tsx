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
