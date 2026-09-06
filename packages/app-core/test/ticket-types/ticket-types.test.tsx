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
        gateway={createFakeGateway({ ticketTypes: [...builtins, custom] })}
        onOpen={onOpen}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Invoice')).toBeInTheDocument();
    const epicRow = screen.getByText('Epic').closest('li')!;
    expect(within(epicRow).getByText('Built-in')).toBeInTheDocument();
    const invoiceRow = screen.getByText('Invoice').closest('li')!;
    expect(within(invoiceRow).queryByText('Built-in')).not.toBeInTheDocument();
    expect(within(invoiceRow).getByText('rank 3')).toBeInTheDocument();
    expect(within(invoiceRow).getByText('1 field')).toBeInTheDocument();
    await user.click(within(invoiceRow).getByRole('button', { name: 'Open Invoice' }));
    expect(onOpen).toHaveBeenCalledWith(custom.id);
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
    expect(within(row).getByRole('button', { name: 'Open Rota' })).toBeInTheDocument();
    // It fell back to something drawable rather than rendering an empty glyph.
    expect(row.querySelector('svg.type-icon')?.querySelectorAll('path, circle').length ?? 0).toBeGreaterThan(0);
  });

  it('hides New ticket type from non-authors', async () => {
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
    expect(screen.queryByRole('button', { name: 'New ticket type' })).not.toBeInTheDocument();
  });
});

describe('TicketTypeEditorScreen — creating a custom type', () => {
  it('builds and submits ticket-type.defined from the filled form', async () => {
    const user = userEvent.setup();
    const { gateway, onSaved } = renderEditor(null);
    const nameField = await screen.findByRole('textbox', { name: 'Type name' });
    await user.type(nameField, 'Invoice');
    await user.click(screen.getByRole('button', { name: 'Icon: receipt' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    const fieldName = within(row).getByRole('textbox', { name: 'Field name' });
    await user.clear(fieldName);
    await user.type(fieldName, 'Amount');
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'number');
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'select');

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
});

describe('TicketTypeEditorScreen — re-binding a type to a different workflow (owner decision 2026-08-26)', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;
  const bothWorkflows = { workflows: [kanbanPublished, errandPublished] };

  async function rebind(seed: FakeGatewaySeed = {}) {
    const user = userEvent.setup();
    const rendered = renderEditor(task, { ...bothWorkflows, ...seed });
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Workflow' }),
      errandPublished.id,
    );
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
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), errandPublished.id);
    expect(await screen.findByTestId('workflow-divergence')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
  });

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
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        'in-progress',
      );
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
    await user.selectOptions(combobox, errandPublished.id);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();

    // A second re-point, with no second save behind it.
    await user.selectOptions(combobox, approvalPublished.id);
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
    await user.selectOptions(combobox, errandPublished.id);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));

    const dialog = await screen.findByRole('dialog');
    const target = errandPublished.states[0]!;
    for (const state of kanbanPublished.states) {
      await user.selectOptions(within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }), target.id);
    }
    await user.selectOptions(combobox, approvalPublished.id);

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
    await user.selectOptions(combobox, errandPublished.id);
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        errandPublished.states[0]!.id,
      );
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();

    // Nothing has moved since; the sentence must not follow the combobox.
    await user.selectOptions(combobox, approvalPublished.id);
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
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        errandPublished.states[0]!.id,
      );
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
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        'in-progress',
      );
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));

    expect(await screen.findByText('The server refused this move.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    // Plan 3 owns the rule id and the wording; this screen owns neither and
    // rephrases neither — it asserts on what came back, not on a literal it chose.
    expect(screen.getByText('rule: ticket.workflow-rebound-unknown-state')).toBeInTheDocument();
  });
});
