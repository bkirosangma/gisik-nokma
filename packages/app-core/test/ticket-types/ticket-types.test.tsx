import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no
// default export that survives `verbatimModuleSyntax` — the same fix already
// settled at test/views/board.test.tsx and test/workflow-builder/canvas.test.tsx.
// The plan's Task 11 snippet still carries the default spelling, which passes
// vitest and fails `turbo run typecheck` — so vitest green is not the check.
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  builtinTicketTypeDefs,
  CUSTOM_FIELD_KINDS,
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

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

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
    // NO "the even rows number two" assertion here, deliberately. It would be
    // arithmetic off `toHaveLength(5)` two lines up — a control that cannot fail
    // independently of the assertion beside it. The parity itself is not this
    // half's to measure: it is read out of `ui.css` in
    // `packages/ui/test/tokens.test.ts`, which is the only place it can be
    // falsified.
  });
});

/**
 * The ↑/↓ reorder controls — Task 6+7 of the settings-workflows plan, lifted by
 * the owner 2026-09-19. Case block `13.928`–`13.935`.
 *
 * THE DOOR IS NOT NEW. `ticket-type-list-screen.tsx:43-59` measured this on
 * 2026-09-18 and it is still true: no route and no gateway op is needed,
 * (Re-pointed from `:38-54` when Task 8's docblock edit shifted the file by five
 * lines at that point. Both citations are in files this change touches, which is
 * the test the repo's own note in `test-cases/13-settings-and-workflows.md`
 * sets for rewriting one rather than recording it.)
 * because `onSave` already authors a `ticket-type.defined` event carrying the
 * whole definition — `rank` included — through `gateway.submit`. A reorder is
 * "assign a different rank and submit". **No case here may assert that a rule
 * or a string exists in source** — that is the shape this repo keeps
 * re-finding, and the dispatch says so explicitly.
 *
 * The fixture is `4 built-ins (ranks 1–4) + Invoice (5) + Errand (6)`, in that
 * order. It is chosen so that ONE row has a control that can actually move:
 * Invoice sits between a built-in above it and Errand below it.
 */
describe('TicketTypeListScreen — the ↑/↓ reorder (Tasks 6+7, lifted 2026-09-19)', () => {
  const invoice: TicketTypeDef = {
    id: newUlid(),
    name: 'Invoice',
    icon: 'receipt',
    rank: 5,
    workflowId: kanbanPublished.id,
    fields: [],
  };
  const errand: TicketTypeDef = {
    id: newUlid(),
    name: 'Errand',
    icon: 'bell',
    rank: 6,
    workflowId: kanbanPublished.id,
    fields: [],
  };

  function renderReorderableList(seed: FakeGatewaySeed = {}) {
    const gateway = createFakeGateway({
      workflows: [kanbanPublished],
      ticketTypes: [...builtins, invoice, errand],
      ...seed,
    });
    const { container } = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    return { gateway, container };
  }

  /** The row texts in rendered order — what a reader actually sees. */
  function renderedOrder(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.ticket-type-list__rows > li')).map(
      (li) => li.querySelector('.ticket-type-list__name')?.textContent ?? '',
    );
  }

  /**
   * 13.928 — every row carries both controls, and each is a SIBLING of the row
   * door rather than a child of it.
   *
   * The row is one `<button aria-label="Edit …">` (`:392-421` — and the verb BRANCHES
 * since E4-34: a non-author's row reads `Open …`). A control
   * nested inside it would be a button inside a button — an invalid tree that
   * jsdom will happily render, which is exactly why this is asserted on the
   * DOM containment rather than on the fact that a control exists.
   */
  it('13.928 every row carries ↑ and ↓ controls, and they are siblings of the row door, not inside it', async () => {
    const { container } = renderReorderableList();
    await screen.findByText('Invoice');

    const rows = Array.from(container.querySelectorAll('.ticket-type-list__rows > li'));
    expect(rows).toHaveLength(6);

    const up = screen.getByRole('button', { name: 'Move Invoice up' });
    const down = screen.getByRole('button', { name: 'Move Invoice down' });
    expect(up.tagName).toBe('BUTTON');
    expect(down.tagName).toBe('BUTTON');

    const door = screen.getByRole('button', { name: 'Edit Invoice' });
    expect(door).not.toContainElement(up);
    expect(door).not.toContainElement(down);
    // …and the door is still the door: the control did not replace it.
    expect(door).toContainElement(screen.getByText('Invoice'));
  });

  /**
   * 13.929 — the ends are disabled, asserted on the RENDERED control, and the
   * same assertion names a control that is NOT disabled.
   *
   * The second half is not decoration. A screen that disabled every control
   * would satisfy the first half perfectly, so the pair is what makes this
   * falsifiable — the shape this repo catalogues as a check that cannot fail.
   */
  it('13.929 the ends are disabled and a movable control is not — asserted on the rendered controls', async () => {
    renderReorderableList();
    await screen.findByText('Invoice');

    // First row: nowhere above it to go.
    expect(screen.getByRole('button', { name: `Move ${builtins[0]!.name} up` })).toBeDisabled();
    // Last row: nowhere below it to go.
    expect(screen.getByRole('button', { name: 'Move Errand down' })).toBeDisabled();

    // The control: Invoice sits between a built-in and Errand, so it can move
    // down. Without this line, "everything is disabled" passes this test.
    expect(screen.getByRole('button', { name: 'Move Invoice down' })).toBeEnabled();
    // And the first row's ↓ is NOT the disabled one — ends are the assertion,
    // not the whole control set.
    expect(screen.getByRole('button', { name: `Move ${builtins[0]!.name} down` })).toBeDisabled();
  });

  /**
   * 13.930 — a swap goes through the EXISTING door, and it is a real swap.
   *
   * Two events, not one: `IngestResult` is per-event, so a single re-rank would
   * leave the moved type TIED with its neighbour, and the server's read orders
   * `BY rank, type_id` — a tie is broken by an id, which is to say by nothing a
   * person can see. The assertion is on the submitted payloads' ranks, which is
   * a computed value, not on the presence of a call.
   */
  it('13.930 a swap submits two ticket-type.defined events through the existing door, exchanging the two ranks', async () => {
    const user = userEvent.setup();
    const { gateway } = renderReorderableList();
    await screen.findByText('Invoice');

    await user.click(screen.getByRole('button', { name: 'Move Invoice down' }));

    expect(gateway.submitted).toHaveLength(2);
    const payloads = gateway.submitted.map(
      (event) => event.payload as TicketTypeDef,
    );
    const byName = new Map(payloads.map((payload) => [payload.name, payload]));
    // Invoice took Errand's rank and Errand took Invoice's — a swap, so the two
    // ranks remain distinct and the order is total.
    expect(byName.get('Invoice')?.rank).toBe(6);
    expect(byName.get('Errand')?.rank).toBe(5);
    // Everything else about the two types is carried through untouched: this is
    // a re-rank, not a redefinition.
    expect(byName.get('Invoice')?.id).toBe(invoice.id);
    expect(byName.get('Errand')?.id).toBe(errand.id);
    expect(byName.get('Invoice')?.fields).toEqual(invoice.fields);
    // The "no new door" half of this case is STRUCTURAL — it lives in the diff,
    // not in a runtime assertion: no gateway method was added and the builder
    // used is the editor's own. An earlier draft closed with
    // `expect(document.body).toBeTruthy()`, which asserts nothing at all;
    // removed on review rather than left as decoration.
  });

  /**
   * 13.931 — a swap that would MOVE A BUILT-IN is not attempted.
   *
   * `rule-engine/checks/ticket-type.ts:60-62` refunds `type.builtin-rank`, so
   * the built-in's own event would be refused while its neighbour's commits —
   * and the two would then share a rank, which is the broken order 13.930
   * exists to prevent. The control therefore ANTICIPATES the refusal rather
   * than discovering it: the arrow pointing at a built-in is disabled.
   */
  it('13.931 the arrow that would move a built-in is disabled, on both sides of a built-in', async () => {
    renderReorderableList();
    await screen.findByText('Invoice');

    // Invoice's ↑ would swap it with the built-in directly above it.
    const up = screen.getByRole('button', { name: 'Move Invoice up' });
    expect(up).toBeDisabled();
    // And the reason is ATTACHED to it, not only hoverable: a disabled button is
    // out of the focus order, so its `title` reaches a mouse user and nobody
    // else. `aria-describedby` must resolve to a node carrying the sentence.
    const describedBy = up.getAttribute('aria-describedby');
    expect(describedBy).not.toBeNull();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Built-in types keep their rank.');

    // The same rule read from the other side: the bottom built-in's ↓ would
    // move it, so it is disabled — while its ↑, pointing at another built-in,
    // is also disabled.
    const lastBuiltin = builtins[builtins.length - 1]!;
    expect(screen.getByRole('button', { name: `Move ${lastBuiltin.name} down` })).toBeDisabled();
    expect(screen.getByRole('button', { name: `Move ${lastBuiltin.name} up` })).toBeDisabled();
  });

  /**
   * 13.932 — a refusal the client did not predict is SURFACED, not swallowed.
   *
   * The guard in 13.931 is the client's prediction; the server is the
   * authority, and it can refuse for a reason this screen does not model. The
   * failure this guards against is the quiet one — a control that appears to do
   * nothing, which a reader cannot distinguish from a click that worked.
   */
  it('13.932 a server refusal is shown with its reason rather than silently doing nothing', async () => {
    const user = userEvent.setup();
    const { container } = renderReorderableList({
      submitResults: [
        { status: 'refused', eventId: newUlid(), rule: 'type.builtin-rank', reason: 'built-in ranks are fixed' },
        { status: 'refused', eventId: newUlid(), rule: 'type.builtin-rank', reason: 'built-in ranks are fixed' },
      ],
    });
    await screen.findByText('Invoice');
    const before = renderedOrder(container);

    await user.click(screen.getByRole('button', { name: 'Move Invoice down' }));

    // The server's own words reach the reader…
    expect(await screen.findByText(/built-in ranks are fixed/)).toBeInTheDocument();
    // …and the list did NOT move. Asserted on the RENDERED ORDER, not on the
    // presence of a row: "Invoice is somewhere on the page" is true before and
    // after a re-order, so it could not fail — found by review, and replaced.
    expect(renderedOrder(container)).toEqual(before);
    expect(renderedOrder(container).slice(4)).toEqual(['Invoice', 'Errand']);
  });

  /**
   * 13.934 — a viewer gets no reorder control.
   *
   * The reorder is a WRITE, and every other write affordance on this screen is
   * author-gated (`"New type"`, `:261`). A control that renders for a role the
   * server would refuse is not a control, it is a trap — and the asset list
   * here is the same one `New type` is hidden behind, so the two must agree.
   */
  it('13.934 a non-author gets no reorder controls, matching the New type gate', async () => {
    render(<TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, invoice, errand] })}
        onOpen={() => {}}
        onNew={() => {}}
      />);
    await screen.findByText('Invoice');

    expect(screen.queryByRole('button', { name: 'New type' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Invoice down' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move Invoice up' })).toBeNull();
    // The control on that assertion: the same query on an AUTHOR finds it, so
    // the nulls above are the gate and not a misspelt name. The author here is
    // an OWNER, not an admin, on purpose — `canAuthorRole` is `owner || admin`,
    // so an admin control would pass equally under a gate that tested for
    // `'admin'` alone, and would be a control that cannot discriminate. Found by
    // review: with an admin, this case passed under that mutation.
    render(<TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'owner' }}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, invoice, errand] })}
        onOpen={() => {}}
        onNew={() => {}}
      />);
    expect(await screen.findAllByRole('button', { name: 'Move Invoice down' })).not.toHaveLength(0);
  });

  it('E4-34 a non-author is offered a door that says Open, not Edit', async () => {
    render(<TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, invoice, errand] })}
        onOpen={() => {}}
        onNew={() => {}}
      />);
    await screen.findByText('Invoice');
    // The read-only banner sits directly above these rows and says "You can look,
    // not touch". A row named "Edit Invoice" contradicts it in the same viewport,
    // and it is the verb a screen reader hears.
    expect(screen.queryByRole('button', { name: 'Edit Invoice' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open Invoice' })).not.toBeNull();
    // Control on the same instrument: the AUTHOR's row still says Edit, so the
    // null above is the verb branch and not a misspelt name.
    render(<TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'owner' }}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, invoice, errand] })}
        onOpen={() => {}}
        onNew={() => {}}
      />);
    expect(await screen.findAllByRole('button', { name: 'Edit Invoice' })).not.toHaveLength(0);
  });

  it('E5-14 the page says why the arrows are disabled, not only in a hover title', async () => {
    render(<TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'owner' }}
        gateway={createFakeGateway({ workflows: [kanbanPublished], ticketTypes: [...builtins, invoice, errand] })}
        onOpen={() => {}}
        onNew={() => {}}
      />);
    await screen.findByText('Invoice');
    const note = await screen.findByTestId('ticket-type-reorder-note');
    // The reason all ten arrows are dead, as VISIBLE text. It lived only in each
    // button's `title` attribute, which a phone cannot show and a keyboard cannot
    // reach — so a reader met ten dead controls with no explanation on the page.
    expect(note.textContent).toContain(
      'Built-in types keep their rank; custom types reorder among themselves.',
    );
    // And the other half of the finding: the shipped seed already puts two types
    // at rank 3, and the sentence says how a tie is drawn rather than leaving a
    // reader to infer precedence from two rows that both read "rank 3".
    expect(note.textContent).toContain('Two types that share a rank are drawn in id order.');
  });

  /**
   * 13.935 — a second click cannot land while the first swap is still in flight.
   *
   * Found by review, and it was a REAL defect. `moveType` read a render-scope
   * snapshot and applied its result to that snapshot, so a second click before
   * the first `submit` resolved computed from the PRE-swap array and overwrote
   * it. Probed through this harness, two clicks in one tick folded to `Alpha:6`
   * and `Charlie:6` on the server — a TIE, the exact thing the two-event swap
   * exists to prevent — while the screen rendered `rank 5` for a type it had
   * submitted as 6. Against the real door the window is a whole round-trip.
   *
   * The guard is asserted AS the guard: while a swap is in flight, every arrow
   * is disabled and a second click submits nothing.
   */
  it('13.935 every arrow is disabled while a swap is in flight, and a second click submits nothing', async () => {
    const user = userEvent.setup();
    const base = createFakeGateway({
      workflows: [kanbanPublished],
      ticketTypes: [...builtins, invoice, errand],
    });
    // A door that stays open long enough to click through. This is the ONLY
    // difference from the fake — `submit` is the real one once it resolves.
    let release: (() => void) | null = null;
    const slow = {
      ...base,
      submit: async (events: Parameters<typeof base.submit>[0]) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return base.submit(events);
      },
    };
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={slow}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    await screen.findByText('Invoice');

    const click = user.click(screen.getByRole('button', { name: 'Move Invoice down' }));
    // In flight: nothing else may be started. `waitFor` rather than a bare
    // assertion because the click is deliberately NOT awaited — awaiting it would
    // wait for the door to close, which is the window under test.
    //
    // The condition waited on is `Move Invoice down` ON PURPOSE. An earlier draft
    // waited on `Move Invoice up`, which is disabled in EVERY state (a built-in
    // sits above it), so it returned instantly and asserted nothing — this repo's
    // "check that cannot fail" shape, in the test that exists to catch a
    // concurrency bug. `Invoice down` is enabled before the click and disabled
    // only while a swap is in flight, so it discriminates.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Move Invoice down' })).toBeDisabled();
    });
    expect(screen.getByRole('button', { name: 'Move Invoice up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Errand up' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Move Errand up' }));
    release!();
    await click;
    // Exactly ONE swap reached the door — the second click submitted nothing.
    expect(base.submitted).toHaveLength(2);
  });

  /**
   * 13.933 — after a committed swap the rows are in the new order.
   *
   * Asserted on the RENDERED order, which is the only thing a person sees. The
   * fake gateway serves its seed unchanged, so a screen that re-read instead of
   * applying what it just committed would show the old order here — which is
   * exactly the defect this pins.
   */
  it('13.933 a committed swap re-orders the rendered rows', async () => {
    const user = userEvent.setup();
    const { container } = renderReorderableList();
    await screen.findByText('Invoice');
    expect(renderedOrder(container).slice(4)).toEqual(['Invoice', 'Errand']);

    await user.click(screen.getByRole('button', { name: 'Move Invoice down' }));

    expect(renderedOrder(container).slice(4)).toEqual(['Errand', 'Invoice']);
  });
});

describe('TicketTypeListScreen — the `"N tickets"` segment (Task 8, built 2026-09-19)', () => {
  const invoice: TicketTypeDef = {
    id: 'invoice-type',
    name: 'Invoice',
    icon: 'receipt',
    rank: 5,
    workflowId: kanbanPublished.id,
    fields: [],
  };

  function renderWithCounts(seed: FakeGatewaySeed = {}) {
    const gateway = createFakeGateway({
      workflows: [kanbanPublished],
      ticketTypes: [...builtins, invoice],
      ...seed,
    });
    const { container } = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    return { gateway, container };
  }

  /** One row's meta line as text — the line a reader sees, not a node lookup. */
  function metaOf(container: HTMLElement, name: string): string {
    const row = Array.from(container.querySelectorAll('.ticket-type-list__rows > li')).find(
      (li) => li.querySelector('.ticket-type-list__name')?.textContent === name,
    );
    return row?.querySelector('.ticket-type-list__meta')?.textContent ?? '';
  }

  /**
   * 13.952 — the segment renders the type's OWN count, and the seed makes the two
   * reads DISAGREE so that "which one is on screen" is the question.
   *
   * `invoice-type` is seeded as pinned 7 tickets to the workflow it is bound to,
   * while its workspace-wide count is 3. A screen that rendered the pinned number
   * passes any assertion written against a seed where the two agree — which is
   * why they do not agree here. The seed fields being separate is the fake's own
   * design note (`fake-gateway.ts`, `typeCounts`): deriving one from the other
   * would make this case impossible to write.
   */
  it('13.952 renders the type’s own workspace-wide count — not the number pinned to its workflow — and renders it last', async () => {
    const { container } = renderWithCounts({
      typePopulation: { 'invoice-type': { [kanbanPublished.id]: 7 } },
      typeCounts: { 'invoice-type': 3 },
    });
    await screen.findByText('Invoice');
    await waitFor(() => {
      expect(metaOf(container, 'Invoice')).toContain('3 tickets');
    });
    // The pinned number is nowhere on the screen.
    expect(metaOf(container, 'Invoice')).not.toContain('7 tickets');
    // And the segment is LAST, after the workflow name — the prototype's own
    // order (`desktop.dc.html:3156`, `fields · wf · N tickets`).
    expect(metaOf(container, 'Invoice').trimEnd().endsWith('3 tickets')).toBe(true);
  });

  /**
   * 13.953 — a failed read says so in words. The assertion that matters is the
   * NEGATIVE one: `0 tickets` is a real answer for a type that holds nothing,
   * and a screen that printed it here would be inventing a number on the
   * strength of a request that never came back. This is the same refusal the
   * editor screen's `divergenceBody` makes, and the reason the gateway's
   * docblock says the caller must not substitute a zero.
   */
  it('13.953 a failed count read renders “tickets unavailable” — never a 0 — and the list still renders', async () => {
    const { container } = renderWithCounts({ typeCountsError: true });
    await screen.findByText('Invoice');
    await waitFor(() => {
      expect(metaOf(container, 'Invoice')).toContain('tickets unavailable');
    });
    expect(metaOf(container, 'Invoice')).not.toContain('0 tickets');
    // The list is not collateral: the counts are one segment of one meta line,
    // and their read is a separate promise precisely so a failure cannot take
    // the screen down to "Loading ticket types…" for ever.
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
    expect(screen.getByText('Invoice')).toBeTruthy();
    // The rest of the meta line is untouched by the failure.
    expect(metaOf(container, 'Invoice')).toContain('rank 5');
    expect(metaOf(container, 'Invoice')).toContain('0 fields');
  });

  /**
   * 13.954 — the two edges the count can land on: exactly one, and a type the
   * read does not mention at all.
   *
   * `builtins` are in the list but absent from the seeded `typeCounts` map, so
   * they exercise the `?? 0` path — and `0 tickets` there is a real answer,
   * unlike the `unavailable` of 13.953. The singular is the prototype's own
   * omission (`used + " tickets"`), and this screen already handles singular for
   * fields, so it handles it here rather than writing "1 tickets".
   */
  it('13.954 says “1 ticket”, says “0 tickets” for a type the read omits, and holds no segment while the read is in flight', async () => {
    const { container } = renderWithCounts({ typeCounts: { 'invoice-type': 1 } });
    await screen.findByText('Invoice');
    await waitFor(() => {
      expect(metaOf(container, 'Invoice')).toContain('1 ticket');
    });
    expect(metaOf(container, 'Invoice')).not.toContain('1 tickets');
    // Absent from the map is a REAL zero, not an unknown: the type is in the
    // list, so the screen knows it exists and knows it holds nothing.
    expect(metaOf(container, builtins[0]!.name)).toContain('0 tickets');

    // And while the read is in flight the segment is ABSENT rather than showing
    // a number nobody has yet — or a `·` with nothing after it.
    const stalled = createFakeGateway({
      workflows: [kanbanPublished],
      ticketTypes: [...builtins, invoice],
    });
    const never = { ...stalled, getTicketCountsByType: () => new Promise<Record<string, number>>(() => {}) };
    const pending = render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={never}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    await screen.findByText('Invoice');
    expect(metaOf(pending.container, 'Invoice')).toContain('rank 5');
    expect(metaOf(pending.container, 'Invoice')).not.toContain('ticket');
  });
});

describe('TicketTypeEditorScreen — creating a custom type', () => {
  it('E4-29 an empty form names the FIELDS it is about, not the library default', async () => {
    renderEditor(null);
    // `freshDef()` starts `name` and `workflowId` at `''` and the schema is
    // `z.string().min(1)` on both, so exactly two issues render.
    await waitFor(() =>
      expect(document.querySelectorAll('.ticket-type-editor__issues li')).toHaveLength(2),
    );
    const items = Array.from(document.querySelectorAll('.ticket-type-editor__issues li')).map(
      (li) => li.textContent,
    );
    expect(items).toEqual(['Name is required', 'Workflow is required']);
    // The library's own phrasing must not reach the screen: it named no field, so
    // a reader was told twice that something was wrong and never what.
    expect(document.body.textContent).not.toContain('String must contain');
  });

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
    await pickFromSelect(user, within(row).getByRole('button', { name: /Field type/ }), 'Number');
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
   * 13.922 — the Implications card is the prototype's three-item list
   * (`desktop.dc.html:949-953`), and the workspace-derived hierarchy sentence
   * is its MIDDLE item rather than something the port replaced.
   *
   * The assertion is on the rendered list, in order, because the failure it
   * has to catch is a port that swaps the derived sentence out for the two
   * constant ones: that would still render an "Implications" card, would still
   * show both prototype strings, and would have silently deleted the only line
   * on this screen computed from the workspace's own types. Two of the three
   * items are constants; the test exists to say which one is not.
   */
  it('renders the prototype’s three implications, keeping the derived one in the middle', async () => {
    renderEditor(null);
    const list = await screen.findByTestId('rank-implications-list');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Two pickers will re-order: the board’s New ticket menu and MCP’s create_ticket.',
      'Can sit under: Epic, Story · or at the project root.',
      'Published workflows are versioned — nothing already recorded is rewritten.',
    ]);
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
    await pickFromSelect(user, within(row).getByRole('button', { name: /Field type/ }), 'Select');

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
   * 10.120 — E6-3 (release 2026-09-22, B12): re-ranking a custom type does
   * not move or re-check the tickets already placed under the old rank — the
   * rank invariants are write-time invariants and occupancy is never an
   * engine input (owner, 2026-08-26), so the engine ACCEPTS the re-rank and
   * the ledger then holds placements the write doors refuse to reproduce
   * (`packages/rule-engine/test/ticket-type-rerank.test.ts`, 5.76). The
   * editor says so at the moment the rank is changed, so the admin decides
   * with the consequence in front of them; the note is absent while the rank
   * still reads the saved value, and absent on a new type, which has nothing
   * placed yet.
   */
  it('tells the admin that tickets already placed keep their place, the moment a custom type\'s rank is changed', async () => {
    const invoice: TicketTypeDef = { id: newUlid(), name: 'Invoice', icon: 'receipt', rank: 3, workflowId: kanbanPublished.id, fields: [] };
    renderEditor(invoice, { ticketTypes: [...builtins, invoice] });
    const rankField = await screen.findByRole('spinbutton', { name: 'Hierarchy rank' });
    expect(rankField).toHaveValue(3);
    expect(screen.queryByTestId('rank-divergence')).not.toBeInTheDocument();

    // `fireEvent.change` rather than `user.clear` + `user.type`: the field's
    // onChange coerces an empty value to 1, so a cleared-then-typed "2" reads
    // "12" — a keystroke sequence, not the rank an admin means.
    fireEvent.change(rankField, { target: { value: '2' } });
    expect(rankField).toHaveValue(2);
    expect(screen.getByTestId('rank-divergence')).toHaveTextContent(
      'Tickets already placed keep their place — re-ranking does not move or re-check them. The new rank applies to tickets created or moved from now on, so a ticket moved out of a placement the new rank no longer allows cannot be put back there.',
    );

    // Back to the saved rank: nothing diverges, so nothing is said.
    fireEvent.change(rankField, { target: { value: '3' } });
    expect(rankField).toHaveValue(3);
    expect(screen.queryByTestId('rank-divergence')).not.toBeInTheDocument();
  });

  it('says nothing about placed tickets on a NEW type, whose rank has no saved value to diverge from', async () => {
    renderEditor(null);
    const rankField = await screen.findByRole('spinbutton', { name: 'Hierarchy rank' });
    fireEvent.change(rankField, { target: { value: '2' } });
    expect(rankField).toHaveValue(2);
    expect(screen.queryByTestId('rank-divergence')).not.toBeInTheDocument();
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

  /**
   * 13.923 — the notice carries the prototype's own sentence about the two
   * choices: *"Neither choice is recommended over the other — leaving them is a
   * decision, not a deferral."* (`desktop.dc.html:937`).
   *
   * The product already HELD that position — the source says "Staying put is a
   * decision, not the absence of one" as a comment beside the Leave button —
   * and a comment is not something an admin deciding this can read. The delta
   * audit measured the sentence at 0 hits across `apps/` and `packages/`, which
   * is exactly the shape a position the product takes only in its own source
   * makes. The assertion is on the rendered node because that is the claim:
   * the admin is told, not the reader of the file.
   */
  it('tells the admin that staying put is a decision, in the prototype’s own words', async () => {
    await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    const notice = await screen.findByTestId('workflow-divergence');
    expect(
      within(notice).getByText(
        'Neither choice is recommended over the other — leaving them is a decision, not a deferral.',
      ),
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
   * 10.112 — a rejected migration REQUEST is not a refusal. The server said
   * nothing about the move, so the mapping the admin just authored is the only
   * copy of that work that exists anywhere, and the control that reopens the
   * dialog is the only route back to it. The dialog therefore stays mounted
   * through the in-flight phase: a remount would reset its local `stateMap` to
   * `{}`, which is the loss this asserts against — the confirm button is
   * enabled again only if every row still carries its destination.
   */
  it('keeps the authored mapping when the migration request is rejected', async () => {
    const { user } = await rebind({
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
      migrationError: true,
    });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));

    const dialog = await screen.findByRole('dialog', {
      name: `Move existing tickets to "${errandPublished.name}"`,
    });
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'In progress' }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));

    // The transport's own sentence, inside the surface the admin is looking at
    // — never the server-refusal slot, which reports an adjudication nobody made.
    expect(await within(dialog).findByText(/We could not reach the server for this move/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Move these tickets' })).toBeEnabled();
    // …and the control that reopens the mapping is not stranded disabled, which
    // is what a phase left on `migrating` would have done.
    expect(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` })).toBeEnabled();
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

/**
 * Task 5b — the five items `docs/design/prototype-delta-2026-09-18.md` recorded
 * as NOT ported. Three of the five are rules rather than builds (recorded in the
 * source and the catalogue, pinned where a test can pin them); the two builds are
 * 13.924 and 13.925.
 */
describe('TicketTypeEditorScreen — the five NOT-ported items (Task 5b)', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;
  const bothWorkflows = { workflows: [kanbanPublished, errandPublished] };
  const UI_CSS = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
  /**
   * `.gn-type-editor-header` lives in the WEB stylesheet, not `ui.css` — the same
   * split `builder-css-binding.test.tsx` already reads across (`WEB_CSS_PATH`).
   * It is read here because 13.924's claim is *one ROW*, and row-ness is a
   * LAYOUT property: it lives in this file and in no DOM assertion.
   */
  const WEB_CSS = readFileSync(join(REPO_ROOT, 'apps/web/app/globals.css'), 'utf8');

  /** One rule's body, comments stripped — the selector must match a real block. */
  function ruleBody(css: string, selector: string): string {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    // The prefix is `}`, whitespace or start-of-input rather than `}` alone: a
    // rule may sit directly under a docblock's `*/`, which `.gn-type-editor-
    // header__actions` does (it is appended at the end of `globals.css`).
    const match = new RegExp(`(?:^|[}\\s])\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      withoutComments,
    );
    if (match === null) throw new Error(`no rule for ${selector}`);
    return match[1]!;
  }

  function renderWithCancel(initialDef: TicketTypeDef | null, seed: FakeGatewaySeed = {}) {
    const gateway = createFakeGateway({
      workflows: [kanbanPublished, errandPublished],
      ticketTypes: builtins,
      ...seed,
    });
    const onSaved = vi.fn();
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDef={initialDef}
        onSaved={onSaved}
        cancel={<a href="/w/1/settings/ticket-types">Cancel</a>}
      />,
    );
    return { gateway, onSaved };
  }

  /**
   * 13.924 — the prototype puts `Cancel` and `Save type` in the SAME ROW as the
   * type's name (`desktop.dc.html@6d7b67c0a52c:874-880`); the product rendered
   * the name + Cancel in a row at `2.125rem` and the Save at the form's foot.
   *
   * The assertion is on the ROW, not on three elements existing: the defect this
   * replaces is precisely that all three existed and the Save was in a different
   * place. `toHaveLength(1)` is the other half — a port that ADDS a header Save
   * without moving the foot one would satisfy a naive presence check and leave
   * two controls for one action.
   */
  it('13.924: the name, Cancel and Save are one row, and Save moved rather than multiplied', async () => {
    renderWithCancel(task);
    const row = await screen.findByTestId('type-editor-header');
    expect(within(row).getByRole('heading', { name: task.name })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Cancel' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Save ticket type' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save ticket type' })).toHaveLength(1);
  });

  /**
   * The other half of 13.924, and the half a placement test cannot see: the
   * header Save is the FORM'S control, not a second button that looks like one.
   * A save button that is always enabled would report a def the schema refuses.
   */
  it('13.924: the header Save is the form’s own control — disabled exactly when the def is invalid', async () => {
    const user = userEvent.setup();
    renderWithCancel(task);
    const name = await screen.findByRole('textbox', { name: 'Type name' });
    await user.clear(name);
    expect(within(await screen.findByTestId('type-editor-header')).getByRole('button', { name: 'Save ticket type' })).toBeDisabled();
    await user.type(name, 'Site inspection');
    expect(within(screen.getByTestId('type-editor-header')).getByRole('button', { name: 'Save ticket type' })).toBeEnabled();
  });

  /**
   * 13.924, THE HALF A CONTAINMENT ASSERTION CANNOT SEE, and it was found by
   * mutation, not by reading: deleting `display: flex` from
   * `.gn-type-editor-header` leaves the case above GREEN, because "all three are
   * inside `[data-testid="type-editor-header"]`" is satisfied by a block-layout
   * STACK. Row-ness is a layout property; it lives in a stylesheet the DOM
   * assertion never reads, so the claim "they are ONE ROW" was passing for a
   * reason unrelated to row-ness — this repo's signature defect class.
   *
   * The instrument is the one `builder-css-binding.test.tsx` already built for
   * this exact blind spot, read across the same package boundary (`WEB_CSS_PATH`).
   */
  it('13.924: the row really is a row — the containment check alone cannot see layout', () => {
    const header = ruleBody(WEB_CSS, '.gn-type-editor-header');
    expect(header).toContain('display: flex');
    expect(header).toContain('justify-content: space-between');
    // …and the two ends are the name and the actions, in that order.
    expect(header).toContain('flex-wrap: wrap');
    expect(ruleBody(WEB_CSS, '.gn-type-editor-header__actions')).toContain('display: flex');
    // The prototype's OWN scale for this row (`:875`), not `.gn-page-title`'s 34px.
    // A regression to the page-title size would satisfy every DOM assertion here.
    expect(ruleBody(WEB_CSS, '.gn-type-editor-header__title')).toContain('font-size: 1.375rem');
  });

  /**
   * 13.924 — the heading is bound to the LIVE name, which the prototype does
   * (`editTypeName`, `:876`) and the product's pane did not: it rendered the name
   * it had FETCHED, so typing left the heading on the old one until a save.
   *
   * Pinned because the claim is otherwise only true by construction: mutating
   * `name={def.name}` to `name={props.initialDef?.name ?? ''}` reddens nothing
   * without this case.
   */
  it('13.924: the heading tracks the LIVE name, not the one that was fetched', async () => {
    const user = userEvent.setup();
    renderWithCancel(task);
    const name = await screen.findByRole('textbox', { name: 'Type name' });
    await user.clear(name);
    await user.type(name, 'Site inspection');
    const row = screen.getByTestId('type-editor-header');
    expect(within(row).getByRole('heading', { name: 'Site inspection' })).toBeInTheDocument();
    // The control: the FETCHED name is still in scope here, so a heading frozen at
    // first render would go on reading it and fail the line above.
    expect(within(row).queryByRole('heading', { name: task.name })).not.toBeInTheDocument();
  });

  /**
   * 13.924 — the header renders in the LOADING arm too. The pane used to draw the
   * name and Cancel from its own fetch while the screen showed "Loading ticket
   * types…"; folding the header into the screen would have blanked it during
   * every load if the early return had stayed bare. Nothing exercised that branch
   * until this case: deleting `{header}` from it reddens nothing else.
   */
  it('13.924: the header renders while the screen is still loading, not only once the reads land', async () => {
    const gateway = createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins });
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={{ ...gateway, listWorkflows: () => new Promise(() => {}) }}
        initialDef={task}
        cancel={<a href="/back">Cancel</a>}
      />,
    );
    const row = await screen.findByTestId('type-editor-header');
    expect(within(row).getByRole('heading', { name: task.name })).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('Loading ticket types…')).toBeInTheDocument();
  });

  /**
   * 13.925 — the divergence notice moves OUT of the Workflow card and into the
   * right-hand column, above Implications, as a `--tintWarning` card: the
   * prototype's own annotation for this block reads *"the bordered + left-ruled
   * box becomes a warning-tinted fill"* (`desktop.dc.html@6d7b67c0a52c:924`).
   *
   * Asserted as DOCUMENT ORDER inside the aside, not as a distance — "above
   * Implications" is a fact about the tree, and a DOM-order assertion is the one
   * that survives every styling change.
   */
  it('13.925: the divergence notice renders in the right column, above the Implications card', async () => {
    const user = userEvent.setup();
    renderWithCancel(task, { typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await pickFromSearchableSelect(user, await screen.findByRole('combobox', { name: 'Workflow' }), errandPublished.name);
    const notice = await screen.findByTestId('workflow-divergence');
    const aside = notice.closest('.ticket-type-editor__aside');
    expect(aside, 'the notice is not inside the right-hand column').not.toBeNull();
    const titles = within(aside as HTMLElement)
      .getAllByRole('heading')
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['Existing tickets stay where they are', 'Implications']);
  });

  /**
   * 13.925's measured half. `--gn-tint-warning` is an ALPHA role whose
   * documented correctness is a condition on its GROUND, so the fill and the
   * ground are one fact and the ground is re-established, never inherited:
   * the aside sets no background, so the composite here is over `--gn-surface`,
   * the same ground `packages/ui/test/tokens.test.ts` already asserts
   * `text`/`textMuted` against (measured minimum 8.23 across all six
   * style×theme combinations).
   *
   * The border assertion is the prototype's own recorded transition. It is NOT a
   * contrast change: no ledger row covers this element (`hig-per-screen/7a`/`8a`
   * rule on `.gn-attention` and `.gn-state-node`), and the 3px marker is replaced
   * by the wash that says the same thing — the treatment `.gn-invitations` and
   * `.gn-attention` already took.
   */
  it('13.925: the notice is the tintWarning wash, not the raised surface, and its 3px marker is gone', () => {
    const body = ruleBody(UI_CSS, '.ticket-type-editor__divergence');
    expect(body).toContain('background: var(--gn-tint-warning)');
    expect(body).not.toContain('--gn-surface-raised');
    expect(body).not.toMatch(/border-left\s*:/);
    // The negative control: the rule was FOUND, so an empty body would have
    // thrown above rather than passing quietly.
    expect(body).toContain('border-radius');
  });

  /**
   * 13.926 — the prototype's `Choose again` control re-opens a completed move
   * (`desktop.dc.html@6d7b67c0a52c:930`, the `strandedDone` card). The rule is
   * NOT BUILT: no reopen door exists on the gateway, and a button with no door
   * is the defect this repo keeps re-finding. What is asserted is that the
   * migrated branch stays TERMINAL — the sentence stands and offers no way back
   * it cannot honour.
   */
  it('13.926: a completed move is terminal — no reopening control is offered', async () => {
    const user = userEvent.setup();
    renderWithCancel(task, { typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await pickFromSearchableSelect(user, await screen.findByRole('combobox', { name: 'Workflow' }), errandPublished.name);
    await user.click(await screen.findByRole('button', { name: 'Save ticket type' }));
    await user.click(await screen.findByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.click(within(dialog).getByRole('button', { name: new RegExp(`Send them to — ${state.name}`) }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'In progress' }));
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose again/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reopen/i })).not.toBeInTheDocument();
    // …and it offers no SECOND move either: the notice is retired, not re-armed.
    expect(screen.queryByRole('button', { name: `Move them to "${errandPublished.name}"…` })).not.toBeInTheDocument();
  });

  /**
   * 13.927 — the field kinds. The prototype offers `Text/Date/Number/Attachment`
   * and shows them CAPITALISED; the product rendered the wire values as raw
   * lowercase labels.
   *
   * The rule is "do not change the VOCABULARY", and this asserts both halves at
   * once: the LABEL is the prototype's, and the VALUE a pick produces is still
   * `CUSTOM_FIELD_KINDS`' lowercase member. A rename would pass the first
   * assertion and fail the second — which is why they are one test and not two.
   */
  it('13.927: the kind labels are the prototype’s, and the value picked is still the wire vocabulary', async () => {
    const user = userEvent.setup();
    const { onSaved } = renderWithCancel(task);
    // The built-in seeds carry no fields, so the row under test is a fresh one.
    await user.click(await screen.findByRole('button', { name: 'Add field' }));
    const row = await screen.findByTestId('field-row-0');
    const trigger = within(row).getByRole('button', { name: /Field type/ });
    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Text',
      'Number',
      'Date',
      'Select',
      'Person',
    ]);
    await user.click(within(listbox).getByRole('option', { name: 'Number' }));
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    const saved = onSaved.mock.calls[0]?.[0] as TicketTypeDef;
    expect(saved.fields[0]?.type).toBe('number');
    expect(CUSTOM_FIELD_KINDS).toContain(saved.fields[0]?.type);
  });
});

describe('A rejected ticket-type read is an error, not an eternal load (E2-20)', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;

  /**
   * 13.1110 — E2-20. The `Promise.all` at the top of the list screen's effect had
   * no rejection arm, and the screen gated its whole render on the loaded state, so
   * a rejected read was drawn as `Loading ticket types…` on a screen that would
   * never load. The file's own docblock at the SIBLING promise names that exact
   * failure — *"leave the screen on "Loading ticket types…" for ever"* — while
   * leaving it present in the `Promise.all` the sentence talks about.
   *
   * Asserted on the pair that makes the fix real: the error sentence is present
   * AND the loading sentence is gone. Either alone passes on a screen that renders
   * both — and a reader cannot tell the two apart, which is the whole defect.
   */
  it('13.1110 a rejected ticket-type read renders the load-error sentence, never “Loading ticket types…” for ever', async () => {
    const gateway = {
      ...createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins }),
      listTicketTypes: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/ws/ticket-types')),
    };
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Could not load ticket types — reload to try again.')).toBeTruthy();
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
  });

  /**
   * 13.1111 — E2-20, the editor half. Same missing arm, same gate. The header is
   * asserted here for the reason case 13.924 records for the loading arm: the pane
   * draws the name and Cancel from its own fetch, and an error arm that dropped the
   * header would blank the row it belongs to at the moment a person needs to see
   * which type they were editing.
   */
  it('13.1111 the editor screen says the same thing on a rejected read, and keeps its header', async () => {
    const gateway = {
      ...createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins }),
      listWorkflows: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/ws/workflows')),
    };
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDef={task}
      />,
    );
    expect(await screen.findByText('Could not load ticket types — reload to try again.')).toBeTruthy();
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
    expect(screen.getByTestId('type-editor-header')).toBeTruthy();
  });
});

describe('E5-15 — the OTHER half of each ticket-type tuple rejects', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;

  /**
   * 13.1114 — E5-15, filed independently against the same two screens as E2-20
   * (*"A refused or failed ticket-types read leaves Settings on 'Loading ticket
   * types…' for ever"*), and it exercises the rejecter the E2-20 cases do NOT.
   *
   * Each screen loads its environment through `Promise.all([A, B])`, and a tuple
   * rejects if EITHER element does. `13.1110` rejects `listTicketTypes` on the list
   * screen and `13.1111` rejects `listWorkflows` on the editor; this case rejects
   * the OTHER promise at each site. **That is not a duplicate of the same
   * assertion** — it is the half that a fix threaded onto one specific promise
   * would miss, and a handler attached to the wrong element of the tuple is exactly
   * the shape a `Promise.all` defect takes. Both halves are asserted in ONE case
   * because they are one property measured at two sites, the way this file's
   * sibling already batches arms of one property.
   *
   * Each arm asserts the pair — the sentence present AND `Loading ticket types…`
   * absent — because the two live in one branch and a case asserting only the
   * sentence passes on a screen that draws both.
   */
  it('13.1114 a rejected listWorkflows on the LIST screen, and a rejected listTicketTypes on the EDITOR, are both the load-error arm', async () => {
    // ARM ONE — the list screen, `listWorkflows` rejecting.
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={{
          ...createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins }),
          listWorkflows: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/ws/workflows')),
        }}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Could not load ticket types — reload to try again.')).toBeTruthy();
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
    cleanup();

    // ARM TWO — the editor, `listTicketTypes` rejecting.
    render(
      <TicketTypeEditorScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={{
          ...createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins }),
          listTicketTypes: () => Promise.reject(new Error('HTTP 500 for /v1/workspaces/ws/ticket-types')),
        }}
        initialDef={task}
      />,
    );
    expect(await screen.findByText('Could not load ticket types — reload to try again.')).toBeTruthy();
    expect(screen.queryByText('Loading ticket types…')).toBeNull();
  });
});
