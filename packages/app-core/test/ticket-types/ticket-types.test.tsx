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
  it('locks the rank of a built-in type and says why', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'epic')!);
    const rankField = await screen.findByRole('spinbutton', { name: 'Hierarchy rank' });
    expect(rankField).toBeDisabled();
    expect(screen.getByText('Built-in type — its place in the hierarchy is fixed.')).toBeInTheDocument();
  });

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
