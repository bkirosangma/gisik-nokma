import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent, TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **THE SHEET'S SOFT DELETE — the toast and the Undo, AT THE CALL SITE.**
 *
 * `TicketSheet` emits `ticket.deleted`, closes itself, and hands the committed
 * fact to its host through `onDeleted`. That split is what this file exists to
 * hold: the component's own suite (`packages/app-core/test/views/ticket-sheet.test.tsx`'s
 * `16.84`) proves the sheet EMITS and CLOSES, and **none of it can see whether
 * anything narrates or whether the Undo restores anything.** A production caller
 * that dropped `onDeleted` would leave every assertion over there green while
 * the product silently deleted tickets with no way back — this repository's
 * signature failure, *a mocked contract is the thing that excuses the server
 * from existing*, in its client-side form.
 *
 * So this case renders the REAL page, opens a REAL ticket, presses the REAL
 * button, and asserts the two things that only the call site can answer:
 * **the sentence the reader sees**, and **that the Undo posts `ticket.restored`
 * carrying the id it was offered for**.
 *
 * The `deleted` half is deliberately NOT re-driven through the engine here:
 * the server's refusal, its read filter and its undo are witnessed in
 * `apps/server/test/read/soft-delete.test.ts` against real Postgres.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET00000000000000000';
const ANSELMA = '01J9USER000000000000000000';
const TITLE = 'File the GST return';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  // The ticket is OPEN — this is what mounts the sheet, and therefore what makes
  // the footer's Delete reachable at all.
  useSearchParams: () => new URLSearchParams(`ticket=${TICKET}`),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [] }],
};

function ticketRead(): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id: TICKET,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: WF.id,
    workflowVersion: WF.version,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {
      title: {
        value: TITLE,
        actorId: ANSELMA,
        clientTime: '2026-09-19T07:59:00.000Z',
        serverTime: '2026-09-19T08:00:00.000Z',
      },
    },
    transitions: [],
    closed: null,
    rank: null,
    reopenedAt: null,
    deleted: null,
  };
  return {
    ticket,
    title: TITLE,
    stateProvenance: {
      actorId: ANSELMA,
      actorName: 'Anselma Marak',
      clientTime: '2026-09-19T07:59:00.000Z',
      serverTime: '2026-09-19T08:00:00.000Z',
    },
    assignedProvenance: null,
    // No case here reads the audience, and a fake carries no visibility row.
    visibility: null,
    // A ROOT ticket with no children — the absent half of both refs, and the
    // shape `subtasksIncomplete` reads (`rollup === null` means zero expected).
    parent: null,
    rollup: null,
    // The breadcrumb's two crumb fields (2026-09-20); no case here reads them.
    key: null,
    epic: null,
  };
}

/** Everything the page posts, in order — the only thing these cases read. */
let ingested: SubmittedEvent[][] = [];
/**
 * How many times the LIST read has been asked. The correction a delete makes
 * must not depend on the workspace stream arriving, and this is the only
 * instrument in a jsdom test that can see the page re-asking.
 */
let listCalls = 0;

async function openTheSheet(): Promise<void> {
  const services = stubServices({
    getTickets: async () => {
      listCalls += 1;
      return { projectId: PROJECT, rows: [] };
    },
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: 'Garo Hills Logistics',
        // The ticket key's first half (2026-09-20). REQUIRED: `mapWorkspaceRefs`
        // reads it as a plain string and refuses an absent one, so a stub
        // without it takes the page down and reads as a layout failure.
        prefix: 'GH',
        role: 'owner',
        memberCount: 1,
        nameRestrictedProjectCount: 0,
        projects: [
          {
            id: PROJECT,
            name: 'Errand tracking',
            // The second half, likewise required. `ET` is what this name
            // derives, which is what the product would serve for a project
            // founded without an entered prefix.
            prefix: 'ET',
            archived: false,
            ticketCount: 1,
            blockedCount: 0,
          },
        ],
      },
    ],
    getTicket: async () => ticketRead(),
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getMembers: async () => [{ id: ANSELMA, name: 'Anselma Marak', role: 'owner' }],
  });
  /*
    ⚠ `stubServices`'s own `ingest` is `async () => []` — ZERO results for one
    submitted event, which is the sheet's TRANSPORT-ERROR arm and not a commit.
    Left in place, every case below would drive the "The server did not answer
    this change." branch and the delete would never commit; the assertions would
    then be about a product that never deleted anything. A real commit-shaped
    answer is the honest fixture.
  */
  services.dataSource = {
    ...services.dataSource,
    ingest: async (events) => {
      ingested.push(events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: 1,
        serverTime: '2026-09-20T08:00:00.000Z',
      }));
    },
  };
  // The transition dialog's precheck reads the cache, and `stubServices`
  // supplies a deliberate null-object; a REAL cache is the honest fixture (the
  // same note `evidence-upload.test.tsx` carries for the same field).
  services.cache = createClientStateCache();

  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );

  // The sheet is open — Delete is in its footer, and this is the proof the page
  // actually opened this ticket rather than merely rendering.
  await screen.findByRole('button', { name: 'Delete' });
}

afterEach(() => {
  ingested = [];
  listCalls = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the sheet footer’s Delete — the narration and the Undo, at the call site', () => {
  it('16.84 pressing Delete posts ticket.deleted and names the ticket in the toast', async () => {
    await openTheSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(ingested).toHaveLength(1));
    expect(ingested[0]![0]!.type).toBe('ticket.deleted');
    expect(ingested[0]![0]!.entity).toEqual({ kind: 'ticket', id: TICKET });

    // The SENTENCE, which is the whole reason the host owns this half. Its
    // second clause is the product's own claim about a soft delete — the FAQ's
    // *"Its history is retained, because other events cite it"* — and the
    // subject is the TITLE, not a ticket key: this product has none.
    await waitFor(() =>
      expect(screen.getByText(`${TITLE} deleted · its history is retained`)).toBeInTheDocument(),
    );
    // …and it is UNDOABLE, which is the other half of "history-retaining".
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('16.84 the Undo posts ticket.restored FOR THE ID IT WAS OFFERED', async () => {
    await openTheSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(ingested).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    // A SECOND event, and the inverse of the first — not an optimistic un-hide.
    // The id is the assertion that binds: an Undo that restored some other
    // ticket, or none, would still post a well-formed `ticket.restored`.
    await waitFor(() => expect(ingested).toHaveLength(2));
    expect(ingested[1]![0]!.type).toBe('ticket.restored');
    expect(ingested[1]![0]!.entity).toEqual({ kind: 'ticket', id: TICKET });
    expect(ingested[1]![0]!.payload).toEqual({});

    // The toast goes with the click — a notice still offering an Undo it has
    // already taken would invite a second restore of a live ticket, which the
    // engine refuses (`not-deleted`) and which reads as a fault to the reader.
    await waitFor(() =>
      expect(screen.queryByText(`${TITLE} deleted · its history is retained`)).toBeNull(),
    );
  });

  it('16.84 DISMISSING the toast does not restore — the Undo is the only way back', async () => {
    await openTheSheet();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(ingested).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    await waitFor(() =>
      expect(screen.queryByText(`${TITLE} deleted · its history is retained`)).toBeNull(),
    );
    // Exactly ONE event ever posted: dismissing is not an undo, and the absence
    // is the assertion. Without it, a Dismiss wired to the same handler as the
    // Undo would pass every case above.
    expect(ingested).toHaveLength(1);
  });

  it('16.84 the delete RE-ASKS the list — the correction is not left to the stream', async () => {
    /*
      ⚠ FOUND BY INDEPENDENT REVIEW (2026-09-20), AND THIS CASE IS ITS WITNESS.
      The handler used to only set the notice, while the RESTORE reloaded. With
      the `/v1/stream` socket down the list therefore kept showing a row the
      toast had just said was deleted, and nothing in the tree could see it —
      the stub's list is static, and `useLiveQuery` refetches on a stream frame,
      not on a claim.

      `getTickets` is the instrument: it is asked once on mount, and the
      assertion is that a SECOND ask follows the delete. A page that leaned on
      the socket passes every other case in this file.
    */
    await openTheSheet();
    await waitFor(() => expect(listCalls).toBeGreaterThan(0));
    const before = listCalls;

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(ingested).toHaveLength(1));
    await waitFor(() => expect(listCalls).toBeGreaterThan(before));
  });
});
