import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid, type TicketTypeDef } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { TemplateGallery } from '../../src/workflow-builder/ui/template-gallery.js';
import { createDraftStore } from '../../src/workflow-builder/draft-store.js';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.js';
import { TicketTypeEditorScreen } from '../../src/workflow-builder/ticket-types/ticket-type-editor-screen.js';
import { TicketTypeListScreen } from '../../src/workflow-builder/ticket-types/ticket-type-list-screen.js';

/**
 * The web app on phones, Plan Task 11 (§21.11) — what the phone CSS in `apps/web/test/phone-builder.test.ts` assumes
 * of the components. A rule on a class (or an attribute) the component does not carry paints nothing, so each hook
 * the rules key on is asserted here, and the Panels sheet's behaviour (open / close / focus / the selection that
 * opens it) is exercised through the real screen. jsdom evaluates no CSS, so the sheet's visibility is the CSS
 * test's; here the component's half is: `data-open` flips, the scrim exists only while open, focus goes where it
 * should.
 */
const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const session = { userId: newUlid(), role: 'admin' } as const;
const published = { ...cloneTemplate(kanban), version: 1 };
const taskType: TicketTypeDef = {
  id: 'task',
  name: 'Task',
  icon: 'check',
  rank: 3,
  workflowId: published.id,
  fields: [{ id: newUlid(), name: 'Shop', type: 'text' }],
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

/** jsdom has no `matchMedia`; the sheet's auto-open (21.176) asks whether the window is a phone, so the tests say which. */
function stubMatchMedia(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query === '(max-width: 40rem)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

async function renderBuilder(initialDraft = draftFromTemplate(kanban)) {
  const view = render(
    <WorkflowBuilderScreen workspaceId={newUlid()} session={session} gateway={createFakeGateway()} initialDraft={initialDraft} />,
  );
  await screen.findByRole('textbox', { name: 'Workflow name' });
  const aside = view.container.querySelector<HTMLElement>('aside.workflow-builder-screen__left')!;
  return { ...view, aside };
}

describe('21.170 the Panels sheet: the column is `data-open`, a Panels button opens it, Done / Escape / the scrim close it', () => {
  it('21.170 closed at rest: the Panels button is collapsed and names the column it controls; no scrim; the States and Transitions lists are still in the column', async () => {
    const { aside, container } = await renderBuilder();
    const panels = screen.getByRole('button', { name: 'Panels' });
    expect(panels).toHaveClass('workflow-builder-screen__panels');
    expect(panels).toHaveAttribute('aria-expanded', 'false');
    expect(panels).toHaveAttribute('aria-controls', aside.id);
    // AMENDED 2026-10-01 (T11 fix 1): the aside is the desktop column, not a dialog (no role, no aria-modal, no focus
    // containment), so the button is an `aria-expanded` disclosure and promises no popup.
    expect(panels).not.toHaveAttribute('aria-haspopup');
    expect(aside).not.toHaveAttribute('role');
    expect(aside).not.toHaveAttribute('aria-modal');
    expect(aside).toHaveAttribute('data-open', 'false');
    expect(container.querySelector('.workflow-builder-screen__scrim')).toBeNull();
    // CONTROL — the column is the same aside the wide layout uses and still holds all four panels.
    expect(within(aside).getByRole('heading', { name: /^States \(/ })).toBeInTheDocument();
    expect(within(aside).getByRole('heading', { name: /^Transitions \(/ })).toBeInTheDocument();
    expect(aside.parentElement).toHaveClass('workflow-builder-screen__layout');
  });

  it('21.170 Panels opens the sheet (aria-expanded, data-open, a scrim) and moves focus to Done; Done closes it and returns focus to Panels', async () => {
    const user = userEvent.setup();
    const { aside, container } = await renderBuilder();
    await user.click(screen.getByRole('button', { name: 'Panels' }));
    expect(aside).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: 'Panels' })).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('.workflow-builder-screen__scrim')).not.toBeNull();
    const done = within(aside).getByRole('button', { name: 'Done' });
    expect(done).toHaveClass('workflow-builder-screen__panels-done');
    expect(done).toHaveFocus();
    await user.click(done);
    expect(aside).toHaveAttribute('data-open', 'false');
    expect(container.querySelector('.workflow-builder-screen__scrim')).toBeNull();
    expect(screen.getByRole('button', { name: 'Panels' })).toHaveFocus();
  });

  it('21.170 Escape inside the sheet and a tap on the scrim each close it; Escape while closed does nothing', async () => {
    const user = userEvent.setup();
    const { aside, container } = await renderBuilder();
    fireEvent.keyDown(aside, { key: 'Escape' });
    expect(aside).toHaveAttribute('data-open', 'false');
    // Escape while closed is a no-op: it must not pull focus onto the Panels button.
    expect(screen.getByRole('button', { name: 'Panels' })).not.toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Panels' }));
    fireEvent.keyDown(within(aside).getByRole('button', { name: 'Done' }), { key: 'Escape' });
    expect(aside).toHaveAttribute('data-open', 'false');
    await user.click(screen.getByRole('button', { name: 'Panels' }));
    fireEvent.click(container.querySelector('.workflow-builder-screen__scrim')!);
    expect(aside).toHaveAttribute('data-open', 'false');
  });

  it('21.170 tapping a canvas node writes a selection and opens the sheet (its row lives in the column); the draft’s starting selection does not', async () => {
    // AMENDED 2026-10-01 (T13 carry-over, 21.176): the auto-open is a PHONE behaviour, so the window says it is one.
    stubMatchMedia(true);
    const user = userEvent.setup();
    const { aside } = await renderBuilder();
    expect(aside).toHaveAttribute('data-open', 'false');
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(aside).toHaveAttribute('data-open', 'true');
    // The row it opened is in the sheet.
    expect(within(aside).getAllByRole('button').some((button) => button.getAttribute('aria-expanded') === 'true' && /^Doing/.test(button.textContent ?? ''))).toBe(true);
    // CONTROL — closing the sheet and then CLEARING the selection (collapsing the open row) is not a new selection, so it
    // does not reopen the sheet.
    await user.click(within(aside).getByRole('button', { name: 'Done' }));
    expect(aside).toHaveAttribute('data-open', 'false');
    // CONTROL — a draft change that is NOT a selection change (typing the workflow name) leaves the state selected, and
    // the sheet closed: only a NEW selection opens it. (Drop `last = next` or `next !== last` and this reopens it.)
    await user.type(screen.getByRole('textbox', { name: 'Workflow name' }), 'x');
    expect(screen.getByRole('textbox', { name: 'Workflow name' })).toHaveValue(`${kanban.name}x`);
    expect(aside).toHaveAttribute('data-open', 'false');
    const openRow = within(aside).getAllByRole('button').find((button) => button.getAttribute('aria-expanded') === 'true')!;
    await user.click(openRow);
    expect(openRow).toHaveAttribute('aria-expanded', 'false');
    expect(aside).toHaveAttribute('data-open', 'false');
  });
});

describe('21.175 / 21.176 the Panels sheet leaves a nested Select and the desktop column alone (T13 browser pass carry-overs)', () => {
  async function renderWithRequireFieldRule() {
    const seed = createDraftStore(draftFromTemplate(kanban));
    seed.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    return renderBuilder(seed.getState());
  }

  it('21.175 Escape inside a Select that is open in the sheet closes only the Select; the next Escape closes the sheet', async () => {
    stubMatchMedia(true);
    const user = userEvent.setup();
    const { aside } = await renderWithRequireFieldRule();
    await user.click(screen.getByRole('button', { name: 'Panels' }));
    const transitions = within(aside).getByRole('heading', { name: /^Transitions \(/ }).closest('section')!;
    await user.click(within(transitions).getAllByRole('button').find((button) => button.className.includes('builder-row__head'))!);
    const trigger = within(aside).getAllByRole('button').find((button) => button.className.includes('gn-select__trigger') && button.getAttribute('aria-expanded') === 'false' && /due/i.test(button.textContent ?? ''))!;
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    // react-aria unmounts the listbox and restores focus to the trigger ASYNCHRONOUSLY (FocusScope / overlay close),
    // so those two are awaited; `data-open` is NOT — it is the 21.175 proof and must already be true.
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    // The sheet stays: the Escape was the Select's.
    expect(aside).toHaveAttribute('data-open', 'true');
    // CONTROL — with the Select closed, the next Escape (focus back on its trigger, inside the sheet) closes the sheet.
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(aside).toHaveAttribute('data-open', 'false');
  });

  it('21.176 above 40rem the selection never opens the sheet: `panelsOpen` stays false, no scrim, `data-open` false; control: on a phone the same tap opens it', async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    const { aside, container } = await renderBuilder();
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(aside).toHaveAttribute('data-open', 'false');
    expect(container.querySelector('.workflow-builder-screen__scrim')).toBeNull();
    expect(screen.getByRole('button', { name: 'Panels' })).toHaveAttribute('aria-expanded', 'false');
    cleanup();
    stubMatchMedia(true);
    const phone = await renderBuilder();
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(phone.aside).toHaveAttribute('data-open', 'true');
  });
});

describe('21.171 the builder header: name, then the actions row with Add state, Panels and Publish — the one primary', () => {
  it('21.171 the title row holds the name field and the actions row; Add state · Panels · Publish live in the actions; Publish is the header’s only primary button', async () => {
    const { container } = await renderBuilder();
    const header = container.querySelector('header.workflow-builder-screen__header')!;
    const row = header.querySelector('.workflow-builder-screen__title-row')!;
    expect(row.firstElementChild).toHaveClass('workflow-builder-screen__name');
    const actions = row.querySelector('.workflow-builder-screen__actions')!;
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Add state' })).toHaveClass('workflow-builder-screen__add-state');
    expect(within(actions as HTMLElement).getByRole('button', { name: 'Panels' })).toHaveClass('workflow-builder-screen__panels');
    const publish = actions.querySelector('.publish-controls .publish-controls__publish')!;
    expect(publish).toHaveClass('gn-button--primary');
    // CONTROL — it is the ONLY primary in the header: Add state and Panels are ghost buttons.
    expect(header.querySelectorAll('.gn-button--primary')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Panels' })).toHaveClass('gn-button--ghost');
    expect(screen.getByRole('button', { name: 'Add state' })).toHaveClass('gn-button--ghost');
  });
});

describe('21.172 template doors and the workflow list carry the classes the single-column rules key on', () => {
  it('21.172 the template doors are a list of door buttons (four templates + blank) under `.template-gallery__cards`', () => {
    const { container } = render(<TemplateGallery onPick={() => {}} />);
    const list = container.querySelector('ul.template-gallery__cards')!;
    const doors = list.querySelectorAll(':scope > li.template-gallery__card > button.template-gallery__door');
    expect(doors).toHaveLength(WORKFLOW_TEMPLATES.length + 1);
    expect(list.children).toHaveLength(WORKFLOW_TEMPLATES.length + 1);
  });

  it('21.172 the workflow list: New workflow is the header’s `workflow-list__new` primary; a card carries Open / History (`workflow-list__open`, `workflow-list__history`) under `.workflow-list__cards`', async () => {
    const { container } = render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={session}
        gateway={createFakeGateway({ workflows: [published] })}
        onOpen={() => {}}
        onHistory={() => {}}
        onNew={() => {}}
      />,
    );
    await screen.findByText(published.name);
    const header = container.querySelector('header.workflow-list__header')!;
    expect(header.querySelector('.workflow-list__new')).toHaveClass('gn-button--primary');
    const card = container.querySelector('.workflow-list__cards > .workflow-list__card')!;
    const actions = card.querySelector('.workflow-list__actions')!;
    expect(actions.querySelector('.workflow-list__open')).not.toBeNull();
    expect(actions.querySelector('.workflow-list__history')).not.toBeNull();
    // CONTROL — the header's primary is the only one in the list screen.
    expect(container.querySelectorAll('.gn-button--primary')).toHaveLength(1);
  });
});

describe('21.173 ticket types carry the classes the full-width / reorder rules key on', () => {
  it('21.173 the list: New ticket type is `ticket-type-list__new` in the header; each row has two `ticket-type-list__move` buttons inside `ticket-type-list__reorder`', async () => {
    const { container } = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={session}
        gateway={createFakeGateway({ ticketTypes: [taskType], workflows: [published] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    await screen.findByText('Task');
    expect(container.querySelector('header.ticket-type-list__header > .ticket-type-list__new')).toHaveClass('gn-button--primary');
    const reorder = container.querySelector('.ticket-type-list__rows li > .ticket-type-list__reorder')!;
    expect(reorder.querySelectorAll('button.ticket-type-list__move')).toHaveLength(2);
  });

  it('21.173 the editor: the header’s actions row holds Save (`ticket-type-editor__save`); each field row carries `fields-editor__name`, `fields-editor__type`; Add field is `fields-editor__add`', async () => {
    const { container } = render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={session}
        gateway={createFakeGateway({ workflows: [published], ticketTypes: [taskType] })}
        initialDef={taskType}
      />,
    );
    await screen.findByRole('textbox', { name: 'Type name' });
    const actions = container.querySelector('.gn-type-editor-header > .gn-type-editor-header__actions')!;
    // An unchanged type's Save is the QUIET ghost (23.094, UX fixes T6); it is the primary once the form changes.
    expect(actions.querySelector('.ticket-type-editor__save')).toHaveClass('gn-button--ghost');
    const row = container.querySelector('.fields-editor__row')!;
    expect(row.querySelector('.fields-editor__name')).not.toBeNull();
    expect(row.querySelector('.fields-editor__type')).not.toBeNull();
    expect(container.querySelector('.fields-editor__add')).not.toBeNull();
    // CONTROL — the layout the rules stack is the editor’s main + aside pair.
    expect(container.querySelector('.ticket-type-editor__layout > .ticket-type-editor__main')).not.toBeNull();
    expect(container.querySelector('.ticket-type-editor__layout > .ticket-type-editor__aside')).not.toBeNull();
  });
});
