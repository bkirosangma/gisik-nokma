import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { domainRegistry, type NoteDetail, type SubmittedEvent } from '@gisik-nokma/domain';
import type { RosterMember } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Cases 18.192–18.196 — Create, its Scope control, and the byline's ScopeEditor
 * (Plan 5 of 6, spec §9.3).
 *
 * **What these cases are really guarding.** A create dialog's failure mode is
 * not a missing control — it is a control that OFFERS something the door will
 * refuse. `inherit` without a ticket has nothing to inherit from and the payload
 * schema rejects the claim outright; `project` scope on a workspace-level home
 * is the second refine in `noteCreatedPayload`. Both are refused by the DOMAIN,
 * and both are shapes this dialog must not be able to author — so the assertions
 * are about what the option lists contain, and the mutations are "offer it
 * anyway".
 */
/** Shared, so 18.194's third arm can assert the PAGE's navigation. */
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/notes',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { CreateNoteDialog } from '../src/notes/create-note-dialog.js';
import { NotesPage } from '../src/notes/notes-page.js';
import { ScopeEditor } from '../src/notes/scope-editor.js';

const WS_A = '01J9WSLOGISTICS000000000000';
const WS_B = '01J9WSQUIET0000000000000000';
const P_COLD = '01J9PCOLDROOM00000000000000';
const P_FREEZER = '01J9PFREEZER000000000000000';
const NOTE = '01J9NOTECOLDROOM000000000000';
const TICKET = '01J9TICKET00000000000000000';

function project(id: string, name: string): ProjectRef {
  return { id, name, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0 };
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

/** Two workspaces, one of them PROJECTLESS — 18.192's control. */
const WS_A_REF = workspace({
  id: WS_A,
  name: 'Garo Hills Logistics',
  projects: [project(P_COLD, 'Cold room'), project(P_FREEZER, 'Freezer')],
});
const WS_B_REF = workspace({ id: WS_B, name: 'Quiet Corner', projects: [] });
const WORKSPACES = [WS_A_REF, WS_B_REF];

const MEMBERS: RosterMember[] = [
  { id: 'u_kiro', name: 'Kiro', role: 'owner' },
  { id: 'u_ana', name: 'Anselma Marak', role: 'member' },
  { id: '01M1V035TASFV2G9WPWFV9QDVW', name: '', email: 'accountant@e2e.gisik-nokma.local', role: 'guest' },
];

const NOTE_DETAIL: NoteDetail = {
  noteId: NOTE,
  workspaceId: WS_A,
  homeProjectId: P_COLD,
  authorId: 'u_kiro',
  title: 'Cold compressor log',
  scope: { mode: 'private' },
  attachedTickets: [],
  deleted: false,
  createdAt: '2026-09-23T09:00:00.000Z',
  updatedAt: '2026-09-23T09:00:00.000Z',
  body: { type: 'doc', content: [] },
  schemaVersion: 2,
};

/**
 * The option labels of a `Select`, read through its own listbox.
 *
 * Opens the trigger only when nothing is open, and deliberately does NOT close
 * it afterwards. `Escape` is what a person would press, and it is exactly what
 * this must not do: a `Select` inside a `Dialog` sends its Escape to the
 * dialog's own document listener, which closes the DIALOG — so a helper that
 * tidied up with Escape would unmount the surface the next assertion reads.
 */
async function optionsOf(
  user: ReturnType<typeof userEvent.setup>,
  label: string | RegExp,
): Promise<string[]> {
  if (screen.queryByRole('listbox') === null) {
    await user.click(screen.getByRole('button', { name: label }));
  }
  const listbox = await screen.findByRole('listbox');
  return within(listbox)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('18.11 The Notes page — creating a note', () => {
  /**
   * 18.192 — the Home select's OPTIONS, which is where "you can create a note
   * anywhere you belong" is actually decided.
   *
   * The control is `Quiet Corner`: a workspace with no projects contributes its
   * own option and no project rows, so a dialog that flattened the tree would
   * be missing it and one that rendered the first workspace's projects under
   * every workspace would grow two extra options here.
   */
  it('18.192 lists every workspace and every project, defaulting to defaultHome', async () => {
    const user = userEvent.setup();
    render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: P_COLD }}
          onCreated={vi.fn()}
        />
      </Providers>,
    );

    const labels = await optionsOf(user, /Home/);
    expect(labels).toContain('Garo Hills Logistics — workspace');
    expect(labels).toContain('Garo Hills Logistics / Cold room');
    expect(labels).toContain('Garo Hills Logistics / Freezer');
    // CONTROL: the projectless workspace is offered, and contributes no project.
    expect(labels).toContain('Quiet Corner — workspace');
    expect(labels.filter((label) => label.startsWith('Quiet Corner /'))).toHaveLength(0);

    // The default is the home it was opened with, shown on the closed trigger.
    expect(screen.getByRole('button', { name: /Home/ })).toHaveTextContent('Cold room');
  });

  /**
   * 18.193 — the Scope select's options are a function of the HOME and of
   * whether the dialog came from a ticket.
   *
   * Three arms, each with its own home or caller, because the rule is a pair of
   * conditions and a single fixture can only exercise one.
   */
  it('18.193 offers project only for a project home, inherit only from a ticket, and explicit reveals the picker', async () => {
    const user = userEvent.setup();
    const armOne = render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: P_COLD }}
          onCreated={vi.fn()}
        />
      </Providers>,
    );

    // ARM ONE — a project home, no ticket: project yes, inherit no.
    let scopeLabels = await optionsOf(user, /Scope/);
    expect(scopeLabels).toContain('Private');
    expect(scopeLabels).toContain('Workspace');
    expect(scopeLabels).toContain('This project');
    expect(scopeLabels).not.toContain('Same as the ticket');
    armOne.unmount();

    // ARM TWO — a WORKSPACE home: `project` must go, because the payload's own
    // refine refuses `project` scope on `homeProjectId: ''`.
    const armTwo = render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_B, projectId: '' }}
          onCreated={vi.fn()}
        />
      </Providers>,
    );
    scopeLabels = await optionsOf(user, /Scope/);
    expect(scopeLabels).toContain('Private');
    expect(scopeLabels).toContain('Workspace');
    expect(scopeLabels).not.toContain('This project');
    armTwo.unmount();

    // ARM THREE — from a ticket: `inherit` appears AND is preselected.
    render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: P_COLD }}
          attachTicket={{ workspaceId: WS_A, ticketId: TICKET, projectId: P_COLD }}
          onCreated={vi.fn()}
        />
      </Providers>,
    );
    scopeLabels = await optionsOf(user, /Scope/);
    expect(scopeLabels).toContain('Same as the ticket');
    expect(screen.getByRole('button', { name: /Scope/ })).toHaveTextContent('Same as the ticket');

    // `explicit` reveals the roster, through the extracted `PeoplePicker`.
    // The listbox is already open from `optionsOf` above — clicking the trigger
    // again would CLOSE it, so the option is picked from what is on screen.
    await user.click(await screen.findByRole('option', { name: 'Specific people' }));
    // The nameless member is offered by EMAIL — the label rule is the picker's,
    // and this arm is what proves the dialog really renders THAT component.
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', { name: 'accountant@e2e.gisik-nokma.local' }),
      ).toBeInTheDocument(),
    );
  });

  /**
   * 18.194 — the claim, and the refusal.
   *
   * The refused arm is the one that matters for the dialog's own survival: the
   * reason must be SHOWN and the dialog must STAY OPEN, because the alternative
   * is a person losing the title they just typed with nothing to read.
   */
  it('18.194 writes one note.created in the chosen workspace, then reports the id; a refusal stays open with the reason', async () => {
    const user = userEvent.setup();
    const ingested: SubmittedEvent[] = [];
    const onCreated = vi.fn();
    const services = stubServices({ getMembers: async () => MEMBERS });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T14:00:00.000Z',
      }));
    };
    const view = render(
      <Providers services={services}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: P_COLD }}
          attachTicket={{ workspaceId: WS_A, ticketId: TICKET, projectId: P_COLD }}
          onCreated={onCreated}
        />
      </Providers>,
    );

    await user.type(screen.getByLabelText('Title'), 'Cold room audit');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(ingested).toHaveLength(1));
    const created = ingested[0]!;
    expect(created.type).toBe('note.created');
    expect(created.workspaceId).toBe(WS_A);
    expect(created.entity.kind).toBe('note');
    expect(created.payload).toEqual({
      title: 'Cold room audit',
      homeProjectId: P_COLD,
      // Selected on the trigger, so the claim carries what the trigger SHOWED.
      scope: { mode: 'inherit' },
      attachTicketId: TICKET,
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created.entity.id, WS_A));
    view.unmount();

    // ARM TWO — the refusal. The dialog stays, and says why.
    const refused = stubServices({ getMembers: async () => MEMBERS });
    refused.dataSource.ingest = async (events: SubmittedEvent[]) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'permission.note',
        reason: 'A guest cannot create a note here.',
      }));
    const onCreatedRefused = vi.fn();
    render(
      <Providers services={refused}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: P_COLD }}
          onCreated={onCreatedRefused}
        />
      </Providers>,
    );
    await user.type(screen.getByLabelText('Title'), 'Cold room audit');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('A guest cannot create a note here.')).toBeInTheDocument();
    // MUTATION TARGET: navigating before the ingest resolves would call this.
    expect(onCreatedRefused).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Title')).toHaveValue('Cold room audit');
    view.unmount?.();
  });

  /**
   * 18.194, ARM THREE — the PAGE's half: the Create button opens this dialog
   * and a created note NAVIGATES to it.
   *
   * Asserted through `NotesPage` rather than through the dialog's `onCreated`
   * prop, because "navigates to `/notes/<id>`" is the wiring between the two and
   * a dialog that reported the id to nobody would satisfy every arm above. The
   * id compared is the one the LEDGER received, so a page that navigated to a
   * freshly-minted id of its own would fail: the note it opened would not exist.
   */
  it('18.194 the page opens the dialog and navigates to the id the ledger received', async () => {
    const user = userEvent.setup();
    routerPush.mockClear();
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({
      getMyWorkspaces: async () => WORKSPACES,
      getNotes: async () => [],
      getDeletedNotes: async () => [],
      getMembers: async () => MEMBERS,
    });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T14:00:00.000Z',
      }));
    };
    render(
      <Providers services={services}>
        <NotesPage />
      </Providers>,
    );

    await user.click(await screen.findByRole('button', { name: 'New note' }));
    await user.type(await screen.findByLabelText('Title'), 'Cold room audit');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(ingested).toHaveLength(1));
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith(`/notes/${ingested[0]!.entity.id}`),
    );
  });

  /**
   * 18.195 — the scope CHIP on the byline, and the reader's version of it.
   *
   * The control is the reader arm: a chip that opened its editor for everyone
   * would pass the first arm and is precisely what the mutation names.
   */
  it('18.195 shows the mode on the chip, edits for an editor, and is static text for a reader', async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({ getMembers: async () => MEMBERS });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T14:00:00.000Z',
      }));
    };
    const view = render(
      <Providers services={services}>
        <ScopeEditor note={NOTE_DETAIL} members={MEMBERS} canEdit onChanged={onChanged} />
      </Providers>,
    );

    // The chip names the CURRENT mode, in the product's words rather than the
    // wire's.
    const chip = screen.getByTestId('note-scope');
    expect(chip).toHaveTextContent('Private');

    // An editor opens it by activating the chip, and a change writes
    // `note.scope_set` against the NOTE.
    await user.click(chip);
    const chosen = await optionsOf(user, /Scope/);
    expect(chosen).toContain('Workspace');
    await user.click(await screen.findByRole('option', { name: 'Workspace' }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]!.type).toBe('note.scope_set');
    expect(ingested[0]!.entity).toEqual({ kind: 'note', id: NOTE });
    // FLAT — `note.scope_set`'s payload IS the scope (`noteScopePayload`), unlike
    // `note.created`, which carries it under a `scope` key. The expectation used
    // to read `{ scope: { mode } }` and agreed with a caller that built the same
    // wrong shape; case 18.430 runs it through the real schema instead.
    expect(ingested[0]!.payload).toEqual({ mode: 'workspace' });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    view.unmount();

    // CONTROL / MUTATION TARGET: a reader gets no editor at all.
    render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <ScopeEditor note={NOTE_DETAIL} members={MEMBERS} canEdit={false} onChanged={vi.fn()} />
      </Providers>,
    );
    expect(screen.getByTestId('note-scope').tagName).not.toBe('BUTTON');
    await user.click(screen.getByTestId('note-scope'));
    expect(screen.queryByRole('option')).toBeNull();
  });

  /**
   * 18.430 — what the scope editor SENDS is what the domain schema ACCEPTS.
   *
   * The editor once built `{ scope: { mode } }` for `note.scope_set` while
   * `noteScopeSetPayload` wants `{ mode }` — and 18.195 asserted `toEqual` on
   * the stubbed `ingest`, so the test and the caller shared one wrong guess and
   * the door's `invalid-payload` was first seen in a browser. This runs the
   * event the editor really built through the registry's own schema, for BOTH
   * arms (a mode that writes on choose, and `explicit`, which writes on Save).
   */
  it('18.430 the events the scope editor builds pass the note.scope_set payload schema', async () => {
    const user = userEvent.setup();
    const ingested: SubmittedEvent[] = [];
    const services = stubServices({ getMembers: async () => MEMBERS });
    services.dataSource.ingest = async (events: SubmittedEvent[]) => {
      ingested.push(...events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-23T14:00:00.000Z',
      }));
    };
    const schema = domainRegistry.get('note.scope_set', 1)!.payloadSchema;

    // Arm 1: a mode that writes on choose.
    const first = render(
      <Providers services={services}>
        <ScopeEditor note={NOTE_DETAIL} members={MEMBERS} canEdit onChanged={vi.fn()} />
      </Providers>,
    );
    await user.click(screen.getByTestId('note-scope'));
    await optionsOf(user, /Scope/);
    await user.click(await screen.findByRole('option', { name: 'Workspace' }));
    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(schema.safeParse(ingested[0]!.payload).success).toBe(true);
    first.unmount();

    // Arm 2: `explicit` — the picker gathers the audience, Save submits it.
    render(
      <Providers services={services}>
        <ScopeEditor note={NOTE_DETAIL} members={MEMBERS} canEdit onChanged={vi.fn()} />
      </Providers>,
    );
    await user.click(screen.getByTestId('note-scope'));
    await optionsOf(user, /Scope/);
    await user.click(await screen.findByRole('option', { name: 'Specific people' }));
    await user.click(await screen.findByRole('checkbox', { name: /Anselma Marak/ }));
    await user.click(screen.getByRole('button', { name: 'Save audience' }));
    await waitFor(() => expect(ingested).toHaveLength(2));
    expect(ingested[1]!.payload).toEqual({ mode: 'explicit', userIds: ['u_ana'] });
    expect(schema.safeParse(ingested[1]!.payload).success).toBe(true);

    // CONTROL: the schema is not a rubber stamp — the nested shape the editor
    // used to send is refused by the very same parse.
    expect(schema.safeParse({ scope: { mode: 'workspace' } }).success).toBe(false);
  });

  /**
   * 18.196 — the SCOPE EDITOR's own `inherit` rule, which is a different rule
   * from the dialog's: an existing note may inherit exactly when it has an
   * attachment, and that is state the note carries rather than a caller's flag.
   */
  it('18.196 offers inherit in the scope editor only while the note has an attached ticket', async () => {
    const user = userEvent.setup();
    const view = render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <ScopeEditor note={NOTE_DETAIL} members={MEMBERS} canEdit onChanged={vi.fn()} />
      </Providers>,
    );
    await user.click(screen.getByTestId('note-scope'));
    let labels = await optionsOf(user, /Scope/);
    expect(labels).not.toContain('Same as the ticket');
    view.unmount();

    render(
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <ScopeEditor
          note={{
            ...NOTE_DETAIL,
            attachedTickets: [{ ticketId: TICKET, projectId: P_COLD, key: 'CCSO-1183', title: 'Renew the trade licence' }],
          }}
          members={MEMBERS}
          canEdit
          onChanged={vi.fn()}
        />
      </Providers>,
    );
    await user.click(screen.getByTestId('note-scope'));
    labels = await optionsOf(user, /Scope/);
    expect(labels).toContain('Same as the ticket');
  });

  /**
   * 18.433 — the dialog re-seeds on OPEN, not on a parent re-render. `NotesPage`
   * passes `defaultHome` as an inline object, so every page re-render hands the
   * dialog a fresh one; keyed on identity, that re-render emptied the title a
   * person was typing (seen as an intermittent browser-run failure: Create stayed
   * disabled after the title was filled). Mutation: put `defaultHome` back in the
   * effect's deps and this fails on the empty value.
   */
  it('18.433 a parent re-render with an equal defaultHome keeps the typed title', async () => {
    const user = userEvent.setup();
    const ui = () => (
      <Providers services={stubServices({ getMembers: async () => MEMBERS })}>
        <CreateNoteDialog
          open
          onClose={vi.fn()}
          workspaces={WORKSPACES}
          defaultHome={{ workspaceId: WS_A, projectId: '' }}
          onCreated={vi.fn()}
        />
      </Providers>
    );
    const view = render(ui());
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Typed title');
    view.rerender(ui());
    expect((screen.getByRole('textbox', { name: 'Title' }) as HTMLInputElement).value).toBe('Typed title');
  });
});
