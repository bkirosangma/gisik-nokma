import { render, screen, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax` — the same fix already
// settled at test/views/board.test.tsx and test/workflow-builder/canvas.test.tsx.
// The plan's Task 11 snippet still carries the default spelling, which passes
// vitest and fails `turbo run typecheck` — so vitest green is not the check.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  builtinTicketTypeDefs,
  newUlid,
  ticketTypeDefSchema,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { createFakeGateway, type FakeGatewaySeed } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.js';
import { TicketTypeEditorScreen } from '../../src/workflow-builder/ticket-types/ticket-type-editor-screen.js';
import { TicketTypeListScreen } from '../../src/workflow-builder/ticket-types/ticket-type-list-screen.js';

// The shared Select's panel is portal-rendered to document.body, so the
// option must be queried against the popup (role listbox), never within(row)
// — the row only ever contains the trigger. Scoping to the listbox also
// sidesteps useSelect's HiddenSelect, which renders a visually-hidden native
// <select>/<option> pair alongside the visible button for mobile support.
async function pickFromSelect(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, optionName: string) {
  await user.click(trigger);
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: optionName }));
}

// Workflow's searchable trigger is a real <input role="combobox">, unlike Field type's
// non-searchable <button>, but otherwise behaves the same way: click to open, click the
// option inside the portal-rendered listbox to select. (Task 7.5 fixed the reopen-on-click
// gap this helper used to work around with an inline `{ArrowDown}` — see select.tsx.)
async function pickFromSearchableSelect(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, optionName: string) {
  await user.click(trigger);
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: optionName }));
}

const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };
const kanbanPublished = cloneTemplate(WORKFLOW_TEMPLATES[0]!);
// A second published workflow, so the binding combobox has somewhere to move to.
const errandPublished = cloneTemplate(WORKFLOW_TEMPLATES[1]!);
// And a THIRD, because two is exactly the number that hides the defect below:
// with only an outgoing and an incoming workflow there is nowhere to re-point
// to after a save, so no test could reach the state where the move gate lets an
// admin migrate at a workflow the type is not bound to.
const approvalPublished = cloneTemplate(WORKFLOW_TEMPLATES[2]!);
const builtins = builtinTicketTypeDefs(kanbanPublished.id);

function renderEditor(
  initialDef: TicketTypeDef | null,
  seed: FakeGatewaySeed = {},
  session: BuilderSession = adminSession,
) {
  const gateway = createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins, ...seed });
  const onSaved = vi.fn();
  render(
    <TicketTypeEditorScreen
      workspaceId={newUlid()}
      session={session}
      gateway={gateway}
      initialDef={initialDef}
      onSaved={onSaved}
    />,
  );
  return { gateway, onSaved };
}

describe('TicketTypeListScreen', () => {
  /**
   * 10.41 — list with rank, field count, Built-in badges.
   */
  /**
   * 10.79 — clicking the Built-in badge — a plain `<span>` with no handler of its own — still opens the type: "the whole row is the door", not "an element with the right name exists somewhere in it".
   */
  it('lists types with rank, field count and a Built-in badge on the seeds', async () => {
    const user = userEvent.setup();
    const custom: TicketTypeDef = {
      id: newUlid(),
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: kanbanPublished.id,
      fields: [{ id: newUlid(), name: 'Amount', type: 'number' }],
    };
    const onOpen = vi.fn();
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, custom] })}
        onOpen={onOpen}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Invoice')).toBeInTheDocument();
    const epicRow = screen.getByText('Epic').closest('li')!;
    expect(within(epicRow).getByText('Built-in')).toBeInTheDocument();
    const invoiceRow = screen.getByText('Invoice').closest('li')!;
    expect(within(invoiceRow).queryByText('Built-in')).not.toBeInTheDocument();
    // 13.313 — the shipped `rank ${type.rank}` form, tied to THIS row's rank.
    expect(within(invoiceRow).getByText('rank 3')).toBeInTheDocument();
    expect(within(invoiceRow).getByText('1 field')).toBeInTheDocument();
    // 10.41 extended: the row also names the workflow the type is bound to —
    // read from `listWorkflows`, never a count nothing measures.
    expect(within(invoiceRow).getByText(kanbanPublished.name)).toBeInTheDocument();
    await user.click(within(invoiceRow).getByRole('button', { name: 'Edit Invoice' }));
    expect(onOpen).toHaveBeenCalledWith(custom.id);
    // Owner feedback, 2026-09-10: "remove that button and open on just
    // clicking the entire card/row" — the row itself is now the ONE `button`
    // this query above resolves to, not a trailing sibling. Clicking the
    // Built-in badge — a plain `<span>` at the opposite end of the row, no
    // handler of its own — proves the WHOLE surface is the door rather than
    // merely confirming an element with the right accessible name exists.
    const badge = within(epicRow).getByText('Built-in');
    await user.click(badge);
    expect(onOpen).toHaveBeenCalledWith('epic');
  });

  /**
   * `icon` is a free string on the wire — `ticketTypeDefSchema` asks only for
   * min(1), so a `ticket-type.defined` payload written by a newer client, or by
   * a workspace whose icon vocabulary has moved on, can name a glyph this build
   * has never heard of. The row must still render. This is the one guarantee in
   * icons.tsx that is written here rather than transcribed from the plan (the
   * sixteen glyphs are stroke data, not lucide components), so it gets its own
   * test rather than riding on the fixtures, all of which use known names.
   */
  it('an icon name this build has never heard of renders the row anyway — data never crashes the UI', async () => {
    const alien: TicketTypeDef = {
      id: newUlid(),
      name: 'Rota',
      icon: 'not-an-icon-this-build-knows',
      rank: 2,
      workflowId: kanbanPublished.id,
      fields: [],
    };
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ ticketTypes: [alien] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    const row = (await screen.findByText('Rota')).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Edit Rota' })).toBeInTheDocument();
    // It fell back to something drawable rather than rendering an empty glyph.
    expect(row.querySelector('svg.type-icon')?.querySelectorAll('path, circle').length ?? 0).toBeGreaterThan(0);
  });

  it('hides New type from non-authors', async () => {
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway({ ticketTypes: builtins })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Epic')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New type' })).not.toBeInTheDocument();
  });

  /**
   * 13.894 — the `isTypes` port's render half: the three ported strings and the
   * DOM precondition the zebra's parity depends on.
   *
   * **Why the DOM shape is asserted at all.** The zebra is CSS —
   * `.ticket-type-list__rows li:nth-child(even) .ticket-type-list__row` — and
   * `:nth-child` counts ELEMENTS, so the parity is only the prototype's while
   * every row is a DIRECT `<li>` child of that one list, one per type. A wrapper
   * element, a header row, or a row moved out of the `<ul>` would silently shift
   * every stripe by one and land on the ODD rows — the exact inversion two other
   * families in this repo already shipped (`packages/ui/src/ui.css:1088`,
   * `:2671`). That is a structural property of this component, so it is pinned
   * here; the rule's own parity and its visibility are measured in
   * `packages/ui/test/tokens.test.ts`.
   */
  it('13.894 the ported strings render, and every row is a direct <li> of the one list', async () => {
    const custom: TicketTypeDef = {
      id: newUlid(),
      name: 'Invoice',
      icon: 'receipt',
      rank: 5,
      workflowId: kanbanPublished.id,
      fields: [],
    };
    const { container } = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, custom] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Invoice')).toBeInTheDocument();

    // The prototype's own strings (`desktop.dc.html:820`, `:823`, `:3150`).
    expect(screen.getByRole('heading', { name: 'Ticket types' })).toHaveClass('ticket-type-list__title');
    expect(screen.getByRole('button', { name: 'New type' })).toBeInTheDocument();
    expect(screen.getByText('5 types. Rank orders them in every picker.')).toBeInTheDocument();

    // This screen's own singular handling is KEPT — the prototype writes
    // `${n} types.` unconditionally and would say "1 types." here. A second
    // render rather than a negative against the five-type one: `1 type…` is
    // absent there whatever the code does, so asserting its absence would be a
    // check that cannot fail.
    const single = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [builtins[0]!] })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await single.findByText('1 type. Rank orders them in every picker.')).toBeInTheDocument();
    single.unmount();

    // The parity precondition: every row is a direct `<li>` child of the one
    // `<ul>`, in the order rendered, with nothing between them.
    const rows = container.querySelector('.ticket-type-list__rows')!;
    const children = Array.from(rows.children);
    expect(children).toHaveLength(5);
    expect(children.every((child) => child.tagName === 'LI')).toBe(true);
    const rowTexts = children.map((child) => child.querySelector('.ticket-type-list__row')?.textContent ?? '');
    expect(rowTexts.every((text) => text.length > 0)).toBe(true);
    // The order is `listTicketTypes`'s own — position is what the parity keys
    // on, so the fifth row is asserted to be the custom type rather than any of
    // the four seeds.
    expect(rowTexts[4]).toContain('Invoice');
    expect(rowTexts.slice(0, 4).some((text) => text.includes('Invoice'))).toBe(false);
    // The control: the two stripes are distinguishable by POSITION, so a
    // selector keyed on `:nth-child(even)` has five rows to choose from and
    // picks two of them (rows 2 and 4) — not zero, and not all five.
    const evenRows = children.filter((_, index) => (index + 1) % 2 === 0);
    expect(evenRows).toHaveLength(2);
  });
});

describe('TicketTypeEditorScreen — creating a custom type', () => {
  it('builds and submits ticket-type.defined from the filled form', async () => {
    const user = userEvent.setup();
    const { gateway, onSaved } = renderEditor(null);
    const nameField = await screen.findByRole('textbox', { name: 'Type name' });
    await user.type(nameField, 'Invoice');
    await user.click(screen.getByRole('button', { name: 'Icon: receipt' }));
    await pickFromSearchableSelect(user, screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.name);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    const fieldName = within(row).getByRole('textbox', { name: 'Field name' });
    await user.clear(fieldName);
    await user.type(fieldName, 'Amount');
    await pickFromSelect(user, within(row).getByRole('button', { name: /Field type/ }), 'number');
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));

    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    const event = gateway.submitted[0]!;
    expect(event.type).toBe('ticket-type.defined');
    expect(event.entity.kind).toBe('ticket-type');
    const payload = event.payload as TicketTypeDef;
    expect(payload).toMatchObject({ name: 'Invoice', icon: 'receipt', rank: 3, workflowId: kanbanPublished.id });
    expect(payload.fields).toHaveLength(1);
    expect(payload.fields[0]).toMatchObject({ name: 'Amount', type: 'number' });
    expect(onSaved).toHaveBeenCalledWith(payload);
  });

  it('shows rank implications derived from the workspace types', async () => {
    renderEditor(null);
    expect(await screen.findByTestId('rank-implications')).toHaveTextContent(
      'Can sit under: Epic, Story · or at the project root.',
    );
  });

  /**
   * 10.43 — select field without options: schema refusal in zod's own words; save blocked.
   */
  it('surfaces the schema refusal for a select field without options and blocks saving', async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.type(await screen.findByRole('textbox', { name: 'Type name' }), 'Priority thing');
    await pickFromSearchableSelect(user, screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.name);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    await pickFromSelect(user, within(row).getByRole('button', { name: /Field type/ }), 'select');

    // assert against the schema's own words — the editor never rephrases zod
    const draftDef: TicketTypeDef = {
      id: newUlid(),
      name: 'Priority thing',
      icon: 'flag',
      rank: 3,
      workflowId: kanbanPublished.id,
      fields: [{ id: newUlid(), name: 'New field', type: 'select' }],
    };
    const parsed = ticketTypeDefSchema.safeParse(draftDef);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        expect(screen.getAllByText(issue.message).length).toBeGreaterThan(0);
      }
    }
    expect(screen.getByRole('button', { name: 'Save ticket type' })).toBeDisabled();
  });
});

describe('TicketTypeEditorScreen — built-ins and refusals', () => {
  /**
   * 10.45 — built-in ranks locked in the UI with the reason named.
   */
  it('locks the rank of a built-in type and says why', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'epic')!);
    const rankField = await screen.findByRole('spinbutton', { name: 'Hierarchy rank' });
    expect(rankField).toBeDisabled();
    expect(screen.getByText('Built-in type — its place in the hierarchy is fixed.')).toBeInTheDocument();
  });

  /**
   * 10.46 — server refusal on save rendered verbatim.
   */
  it('renders a server refusal verbatim (planted defect: non-admin ingest)', async () => {
    const user = userEvent.setup();
    const reason = 'Only a workspace owner or admin can do this. Your role is member.';
    renderEditor(builtins.find((builtin) => builtin.id === 'task')!, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'permission.role', reason }],
    });
    await user.click(await screen.findByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('The server refused this ticket type.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: permission.role')).toBeInTheDocument();
  });

  it('hides Save and disables inputs for non-authors', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'task')!, {}, { userId: newUlid(), role: 'member' });
    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save ticket type' })).not.toBeInTheDocument();
  });

  /**
   * Owner feedback, 2026-09-09: "fix the styles of the input boxes used, fix
   * the entire styling of the whole page." The Type name/Hierarchy rank
   * inputs and the Workflow select carried NO class at all — bare `<input>`/
   * `<select>` — so they rendered the browser's own chrome (a white box, a
   * black hairline border) against every other field on this product, which
   * is `.gn-field__input`'s cream fill and no border. Asserted here at the
   * COMPONENT level — the CLASS is applied — because `.gn-field__input`'s own
   * box (border, radius, fill, focus ring) is already pinned at the CSS level
   * by `packages/ui/test/components.test.tsx` (13.291, 13.339); a component
   * test asserting the literal box styles a second time would duplicate that
   * coverage rather than close the gap those cases cannot see — that a given
   * screen's inputs use the shared class at all.
   */
  /**
   * 10.77 — the Type name, Hierarchy rank and Workflow controls carry the shared `.gn-field__input` class — all three were bare `<input>`/`<select>` with no class at all before this.
   */
  it('the Type name, Hierarchy rank and Workflow controls carry the shared field-input class', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'task')!);
    expect(await screen.findByRole('textbox', { name: 'Type name' })).toHaveClass('gn-field__input');
    expect(screen.getByRole('spinbutton', { name: 'Hierarchy rank' })).toHaveClass('gn-field__input');
    // Workflow is now the shared searchable Select (Task 7), not a bare
    // `<select>` — `gn-field__input` moved with it, but it now lives on the
    // trigger BOX (select.tsx:201), not on the `<input role="combobox">`
    // inside it (ui.css:677-687 styles the input to blend into that box
    // rather than duplicating the class onto it, which would paint a second
    // border/fill inside the first). So the class check walks up from the
    // accessible combobox to the box that actually carries it.
    const workflowTriggerBox = screen.getByRole('combobox', { name: 'Workflow' }).closest('.gn-select__trigger');
    expect(workflowTriggerBox).not.toBeNull();
    expect(workflowTriggerBox).toHaveClass('gn-field__input');
  });

  /**
   * The same gap, one level down: `FieldsEditor`'s per-row name/type controls
   * were equally bare, and its Remove/Add buttons were plain `<button>`s with
   * no class reaching `.gn-button` at all.
   */
  /**
   * 10.78 — a field row's name and type controls carry `.gn-field__input`, and its Remove/Add controls are real `.gn-button`s — the same gap one level down in `FieldsEditor`.
   */
  it('a field row’s name and type controls carry the shared field-input class, and its buttons are real gn-buttons', async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.click(await screen.findByRole('button', { name: 'Add field' }));
    expect(screen.getByRole('textbox', { name: 'Field name' })).toHaveClass('gn-field__input');
    expect(screen.getByRole('button', { name: /Field type/ })).toHaveClass('gn-field__input');
    expect(screen.getByRole('button', { name: 'Remove field' })).toHaveClass('gn-button');
    expect(screen.getByRole('button', { name: 'Add field' })).toHaveClass('gn-button');
  });
});

/**
 * The field `required` toggle — owner ruling 2026-09-18, decision-list item 1
 * (*"1 - yes"*), unblocking the delta audit's `isTypeEditor` row
 * (`docs/design/prototype-delta-2026-09-18.md:69`), which recorded the flag as a
 * SCHEMA gap rather than a design one.
 *
 * A note on what these cases can and cannot witness. The product does not yet
 * READ the flag — `packages/domain/src/ticket-types.ts`'s `required` docblock
 * names that absence, why it is a capability rather than a wiring job, and its
 * owner — so no case here could assert a refusal, and none pretends to. What is
 * pinned is the part that IS this change: the flag survives a definition being
 * authored, saved, parsed and read back, and never appears as a value nobody
 * chose. The E2E half of that claim lives in `mapTicketTypes`'s own case and in
 * `apps/server`'s projection suite, not here.
 *
 * **The three states are distinct and each case below is one of them**, which is
 * the whole point of `required` being optional rather than `default(false)`:
 * never-said (13.776), said-required (13.777), said-optional (13.778). A schema
 * that defaulted would collapse the first into the third and 13.776's assertion
 * would pass for the wrong reason.
 */
describe('TicketTypeEditorScreen — the `required` field flag', () => {
  /** Fill the two controls the form needs before a field row is meaningful. */
  async function authorForm(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByRole('textbox', { name: 'Type name' }), 'Invoice');
    await pickFromSearchableSelect(
      user,
      screen.getByRole('combobox', { name: 'Workflow' }),
      kanbanPublished.name,
    );
    await user.click(screen.getByRole('button', { name: 'Add field' }));
  }

  /**
   * 13.776 — a field nobody has decided about carries NO `required` key, and its toggle reads "Optional". Absence is not a claim: the recorded definition must not say `false` on the author's behalf.
   */
  it('a newly added field carries no `required` at all, and reads Optional', async () => {
    const user = userEvent.setup();
    const { gateway } = renderEditor(null);
    await authorForm(user);

    // The label is the accessible name AND the state — no `aria-pressed` beside
    // it, per the docblock in `fields-editor.tsx`. Asserted as an exact string
    // rather than by regex, because a regex would pass on "Optional" inside a
    // longer name and the name's exactness is the property under test.
    expect(screen.getByRole('button', { name: 'Optional' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Required' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as TicketTypeDef;
    const authored = payload.fields[0]!;
    // ABSENCE, with its control one case down: 13.777 and 13.778 both prove the
    // key DOES appear once the toggle is pressed, so a green here is a
    // measurement rather than a probe that cannot fire.
    expect('required' in authored).toBe(false);
    expect(authored).toMatchObject({ name: 'New field', type: 'text' });
  });

  /**
   * 13.777 — pressing the toggle writes an explicit `true`, flips the label to "Required", and the flag reaches the submitted `ticket-type.defined` payload.
   */
  it('pressing writes an explicit true, flips the label, and reaches the submitted payload', async () => {
    const user = userEvent.setup();
    const { gateway } = renderEditor(null);
    await authorForm(user);

    await user.click(screen.getByRole('button', { name: 'Optional' }));
    expect(screen.getByRole('button', { name: 'Required' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as TicketTypeDef;

    // The schema's own vocabulary, not the editor's: parsing the authored def is
    // what proves the flag survives `customFieldDefSchema`, whose zod object
    // STRIPS an undeclared key. Without the schema member this assertion fails
    // while the editor still renders "Required" — which is exactly the
    // silent-strip defect class a surface-only test would miss.
    expect(ticketTypeDefSchema.parse(payload).fields[0]!.required).toBe(true);
  });

  /**
   * 13.778 — pressing twice writes an explicit `false`. Never-said and said-optional are DIFFERENT recorded states, which is the reason the schema member is optional rather than defaulted.
   */
  it('pressing twice records an explicit false — never-said and said-optional stay distinct', async () => {
    const user = userEvent.setup();
    const { gateway } = renderEditor(null);
    await authorForm(user);

    await user.click(screen.getByRole('button', { name: 'Optional' }));
    await user.click(screen.getByRole('button', { name: 'Required' }));
    expect(screen.getByRole('button', { name: 'Optional' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as TicketTypeDef;
    const authored = payload.fields[0]!;

    expect('required' in authored).toBe(true);
    expect(authored.required).toBe(false);
  });

  /**
   * 13.779 — the toggle is disabled for a non-author, like every other control in the row.
   *
   * Owner decision, 2026-08-26: a non-author may read the form but not author it.
   * The toggle is a WRITE, so it takes the same gate as the name input and
   * `Remove field` — a disabled-looking control that still accepted a click
   * would be the "looks exactly like static text" defect inverted.
   */
  it('the toggle is disabled for a non-author, like every other control in the row', async () => {
    const taskDef = builtins.find((builtin) => builtin.id === 'task')!;
    // The field rides `initialDef`, which is what the SCREEN edits — the
    // gateway seed only backs the list. Passing the seed alone renders a
    // built-in with `fields: []` and the row never exists to be asserted on.
    renderEditor(
      { ...taskDef, fields: [{ id: newUlid(), name: 'Amount', type: 'number' }] },
      { ticketTypes: [taskDef] },
      { userId: newUlid(), role: 'member' },
    );
    expect(await screen.findByRole('button', { name: 'Optional' })).toBeDisabled();
  });

  /**
   * 13.780 — the toggle is a real `.gn-button`, and its two states are the shared `primary`/`ghost` variants rather than a private colour of its own.
   */
  it('the toggle is a real gn-button whose states are the shared variants', async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await authorForm(user);

    const off = screen.getByRole('button', { name: 'Optional' });
    expect(off).toHaveClass('gn-button');
    expect(off).toHaveClass('gn-button--ghost');
    // The layout class too. It carries no colour (ui.css is sizing only), so
    // nothing else would notice if the component stopped applying it — and the
    // CSS rule itself is pinned by NO test (`.fields-editor__add` and `__row`
    // are in the same position), which `ui.css`'s own docblock now states
    // outright rather than implying coverage.
    expect(off).toHaveClass('fields-editor__required');
    // Colour is NOT this change's to declare: `ui.css`'s `.fields-editor__required`
    // is sizing only, so both states resolve through the variant classes and
    // both grounds are pairs the contrast audit already carries. A `--on` rule
    // restating `--gn-accent` would have passed the assertions above and failed
    // this one.
    expect(off).not.toHaveClass('gn-button--primary');

    await user.click(off);
    const on = screen.getByRole('button', { name: 'Required' });
    expect(on).toHaveClass('gn-button');
    expect(on).toHaveClass('gn-button--primary');
    expect(on).not.toHaveClass('gn-button--ghost');
  });
});

describe('TicketTypeEditorScreen — re-binding a type to a different workflow (owner decision 2026-08-26)', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;
  const bothWorkflows = { workflows: [kanbanPublished, errandPublished] };

  async function rebind(seed: FakeGatewaySeed = {}) {
    const user = userEvent.setup();
    const rendered = renderEditor(task, { ...bothWorkflows, ...seed });
    await pickFromSearchableSelect(user, await screen.findByRole('combobox', { name: 'Workflow' }), errandPublished.name);
    return { user, ...rendered };
  }

  it('says how many tickets stay behind, and names the workflow they stay on', async () => {
    await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    const notice = await screen.findByTestId('workflow-divergence');
    expect(within(notice).getByText('Existing tickets stay where they are')).toBeInTheDocument();
    expect(
      await within(notice).findByText(
        `14 existing tickets of this type stay on "${kanbanPublished.name}". New ones will use "${errandPublished.name}".`,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing stays behind when nothing does — no invented population', async () => {
    await rebind({ typePopulation: { task: { [kanbanPublished.id]: 0 } } });
    expect(
      await screen.findByText(`No tickets of this type are on "${kanbanPublished.name}" — nothing stays behind.`),
    ).toBeInTheDocument();
  });

  it('planted defect: when the count read fails it says so rather than showing zero', async () => {
    await rebind({ typePopulationError: true });
    const notice = await screen.findByTestId('workflow-divergence');
    expect(await within(notice).findByText('ticket count unavailable')).toBeInTheDocument();
    expect(
      within(notice).getByText(
        `Existing tickets of this type stay on "${kanbanPublished.name}" — we could not count how many. New ones will use "${errandPublished.name}".`,
      ),
    ).toBeInTheDocument();
    // The honesty that matters: it never claims a number it does not have.
    expect(within(notice).queryByText(/^0 /)).not.toBeInTheDocument();
  });

  /**
   * 10.60 — rebinding a type to a different workflow follows the SAVED binding and opens only when it actually changed.
   */
  it('the notice appears only when the binding actually changed', async () => {
    const user = userEvent.setup();
    renderEditor(task, { ...bothWorkflows, typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await screen.findByRole('combobox', { name: 'Workflow' });
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
    // …and it goes away again when the admin changes their mind back.
    await pickFromSearchableSelect(user, screen.getByRole('combobox', { name: 'Workflow' }), errandPublished.name);
    expect(await screen.findByTestId('workflow-divergence')).toBeInTheDocument();
    await pickFromSearchableSelect(user, screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.name);
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
  });

  /* 13.310 — the move dialog's buttons carry the REAL workflow names, never the
   * prototype's hard-coded `Move them to Scheduled`. `errandPublished.name` is
   * `Errand` (`test/helpers/seed.ts:18`), not the rejected literal, so this
   * expectation cannot be met by transcribing the prototype. */
  it('will not offer the move until the type is saved — otherwise new and old tickets swap places', async () => {
    const { user } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    const move = await screen.findByRole('button', { name: `Move them to "${errandPublished.name}"…` });
    expect(move).toBeDisabled();
    expect(
      screen.getByText(
        `Save the ticket type first — until it is saved, new tickets would still go to "${kanbanPublished.name}".`,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` })).toBeEnabled();
  });

  it('leaving them is an affirmative choice, not an unclicked button', async () => {
    const { user, gateway } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await user.click(await screen.findByRole('button', { name: `Leave them on "${kanbanPublished.name}"` }));
    expect(
      await screen.findByText(`Left on "${kanbanPublished.name}". They keep their own board columns.`),
    ).toBeInTheDocument();
    expect(gateway.migrations).toEqual([]);
    // Not an error state, not a warning that lingers — a settled decision.
    expect(screen.queryByRole('button', { name: `Move them to "${errandPublished.name}"…` })).not.toBeInTheDocument();
  });

  /**
   * 10.89 — the workflow-rebind dialog's target-state select migrated to the shared Select — a genuinely SEPARATE component that authors a one-shot map between two UNRELATED workflows, never a `stateMapping` keyed inside one workflow's own version chain.
   */
  it('authors one cross-workflow map and hands the server one migration — never a stateMapping', async () => {
    const { user, gateway } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));

    const dialog = await screen.findByRole('dialog', { name: `Move existing tickets to "${errandPublished.name}"` });
    expect(
      within(dialog).getByText(
        `These two workflows share no history, so nothing carries across on its own: every state of "${kanbanPublished.name}" needs a destination in "${errandPublished.name}". Each ticket gets its own recorded move.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Leaving them is a real choice — a type can have tickets on two workflows, and the board shows each ticket under its own workflow's states.",
      ),
    ).toBeInTheDocument();

    // Every state of the OUTGOING workflow needs a destination — an unmapped
    // state would leave its tickets nowhere to go.
    const confirm = within(dialog).getByRole('button', { name: 'Move these tickets' });
    expect(confirm).toBeDisabled();
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'In progress' }));
    }
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(gateway.migrations).toEqual([
      {
        workspaceId: expect.any(String),
        typeId: 'task',
        fromWorkflowId: kanbanPublished.id,
        toWorkflowId: errandPublished.id,
        stateMap: { todo: 'in-progress', doing: 'in-progress', done: 'in-progress' },
      },
    ]);
    // The map rode its own request. It is NOT a stateMapping: nothing about it
    // reached a workflow.defined payload, because across two workflows there is
    // no version chain to key one on (design decision 10).
    expect(gateway.submitted.some((event) => 'stateMapping' in (event.payload as object))).toBe(false);
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();
  });

  /**
   * The gate the plan asked for is "moving existing tickets to a workflow the
   * type is not yet bound to would leave new tickets going to the old workflow
   * while the old tickets went to the new one". `save.phase !== 'saved'` does
   * not implement that sentence: it asks whether the form was EVER saved, which
   * stops being the same question the moment a second re-point happens. Bind
   * A → pick B → Save → pick C, and the phase is still `saved` while the
   * committed binding is B and the combobox reads C — so the move would fire at
   * C, exactly the inversion, and the screen would still be saying it saved.
   */
  it('the move gate follows the SAVED binding, not merely whether anything was ever saved', async () => {
    const user = userEvent.setup();
    const { gateway } = renderEditor(task, {
      workflows: [kanbanPublished, errandPublished, approvalPublished],
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
    });
    const combobox = await screen.findByRole('combobox', { name: 'Workflow' });
    await pickFromSearchableSelect(user, combobox, errandPublished.name);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();

    // A second re-point, with no second save behind it.
    await pickFromSearchableSelect(user, combobox, approvalPublished.name);
    expect((gateway.submitted[0]!.payload as TicketTypeDef).workflowId).toBe(errandPublished.id);
    expect(screen.getByRole('button', { name: `Move them to "${approvalPublished.name}"…` })).toBeDisabled();
    expect(
      screen.getByText(
        `Save the ticket type first — until it is saved, new tickets would still go to "${kanbanPublished.name}".`,
      ),
    ).toBeInTheDocument();
    // …and nothing on screen claims the selected binding was saved.
    expect(screen.queryByText('Ticket type saved.')).not.toBeInTheDocument();
    expect(gateway.migrations).toEqual([]);
  });

  /**
   * The same root cause one step further in: the mapping dialog's target used to
   * be re-derived from the combobox on every render, so re-pointing while the
   * dialog was open silently retargeted it — and the map already filled in was
   * keyed on the OUTGOING workflow's states, which do not change, so the confirm
   * button stayed enabled and posted one workflow's state ids against another's.
   */
  it('a mapping dialog in flight keeps the workflow it was opened for', async () => {
    const user = userEvent.setup();
    const { gateway } = renderEditor(task, {
      workflows: [kanbanPublished, errandPublished, approvalPublished],
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
    });
    const combobox = await screen.findByRole('combobox', { name: 'Workflow' });
    await pickFromSearchableSelect(user, combobox, errandPublished.name);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));

    const dialog = await screen.findByRole('dialog');
    const target = errandPublished.states[0]!;
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: target.name }));
    }
    await pickFromSearchableSelect(user, combobox, approvalPublished.name);

    expect(screen.getByRole('dialog')).toHaveAttribute(
      'aria-label',
      `Move existing tickets to "${errandPublished.name}"`,
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move these tickets' }));
    expect(gateway.migrations).toHaveLength(1);
    expect(gateway.migrations[0]!.toWorkflowId).toBe(errandPublished.id);
  });

  /**
   * A completed move is a record of something that happened. Re-reading the
   * combobox to name its destination let a later re-point rewrite that record
   * into a statement about a migration nobody ran.
   */
  it('the completed move names the workflow it actually moved to, whatever the combobox says later', async () => {
    const user = userEvent.setup();
    renderEditor(task, {
      workflows: [kanbanPublished, errandPublished, approvalPublished],
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
    });
    const combobox = await screen.findByRole('combobox', { name: 'Workflow' });
    await pickFromSearchableSelect(user, combobox, errandPublished.name);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: errandPublished.states[0]!.name }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();

    // Nothing has moved since; the sentence must not follow the combobox.
    await pickFromSearchableSelect(user, combobox, approvalPublished.name);
    expect(screen.getByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();
    expect(screen.queryByText(`14 tickets moved to "${approvalPublished.name}".`)).not.toBeInTheDocument();
  });

  it('once the tickets have moved, the notice stops saying they stayed behind', async () => {
    const { user } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: errandPublished.states[0]!.name }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();

    // The count behind that body was read BEFORE the move and is not re-read, so
    // leaving it on screen printed a contradiction to itself: "14 stay on
    // Simple kanban" beside "14 moved to Errand with waits".
    expect(
      screen.queryByText(
        `14 existing tickets of this type stay on "${kanbanPublished.name}". New ones will use "${errandPublished.name}".`,
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Existing tickets stay where they are')).not.toBeInTheDocument();
  });

  it('renders the server refusal verbatim (planted defect: a state the target workflow does not have)', async () => {
    const reason = 'That is not a state of the workflow these tickets are moving to.';
    const { user } = await rebind({
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
      migrationResults: [{ status: 'refused', rule: 'ticket.workflow-rebound-unknown-state', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'In progress' }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));

    expect(await screen.findByText('The server refused this move.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    // Plan 3 owns the rule id and the wording; this screen owns neither and
    // rephrases neither — it asserts on what came back, not on a literal it chose.
    expect(screen.getByText('rule: ticket.workflow-rebound-unknown-state')).toBeInTheDocument();
  });
});
