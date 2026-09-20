import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { AttachmentListEntry, TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **THE ATTACHMENTS READ, AT THE CALL SITE THAT WAS MISSING.**
 *
 * `TicketSheetProps.attachments` has existed since Plan 6 and this page never
 * passed it, because nothing served it: `listTicketAttachments` was written and
 * tested by Plan 7 with zero production callers. The sheet's attachment list
 * could therefore only ever be empty — and an empty list draws NOTHING
 * (`AttachmentList` returns `null`, "must not promise there are none"), so the
 * missing read presented as "this ticket has no files" rather than as a gap.
 *
 * ## Why this file exists when the sheet's own suite already covers both arms
 *
 * `ticket-sheet.test.tsx` case 16.57 proves the component draws the entries and
 * the failure sentence. **Both arms are green against a stub** — which is this
 * repository's signature failure: *a mocked contract is the thing that excuses
 * the server from existing.* So this case does not re-test the component. It
 * renders the REAL page, opens a REAL ticket, and asserts the production caller
 * asks the REAL question — the same shape, and for the same reason, as
 * `evidence-upload.test.tsx` beside it. Delete the read from the page and this
 * case reddens while 16.57 stays green, which is exactly why 16.57 could not
 * have caught it.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET00000000000000000';
const ANSELMA = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  // The ticket is OPEN — `?ticket=` is what mounts the sheet, and therefore what
  // makes the page's attachments read run at all.
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
        value: 'File the GST return',
        actorId: ANSELMA,
        clientTime: '2026-09-19T07:59:00.000Z',
        serverTime: '2026-09-19T08:00:00.000Z',
      },
    },
    transitions: [],
    closed: null,
  };
  return {
    ticket,
    title: 'File the GST return',
    stateProvenance: {
      actorId: ANSELMA,
      actorName: 'Anselma Marak',
      clientTime: '2026-09-19T07:59:00.000Z',
      serverTime: '2026-09-19T08:00:00.000Z',
    },
    assignedProvenance: null,
    parent: null,
    rollup: null,
  };
}

const ENTRY: AttachmentListEntry = {
  kind: 'upload',
  attachmentId: '01J9GATA000000000000000000',
  filename: 'gst-receipt.pdf',
  mime: 'application/pdf',
  size: 48211,
  sha256: null,
};

/**
 * Render the page with the ticket open and the attachments read answering
 * whatever the arm under test hands it. The read is the REAL one from
 * `stubServices`' point of view — a function the page calls — so what is
 * asserted is the page's own composition rather than a re-render of the sheet.
 */
function openTheTicket(read: () => Promise<AttachmentListEntry[]>) {
  const asked: Array<[string, string]> = [];
  const services = stubServices({
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: 'Garo Hills Logistics',
        prefix: 'GH',
        role: 'owner',
        memberCount: 1,
        nameRestrictedProjectCount: 0,
        projects: [
          {
            id: PROJECT,
            name: 'Errand tracking',
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
    getTicketAttachments: async (workspaceId, ticketId) => {
      asked.push([workspaceId, ticketId]);
      return read();
    },
  });
  // A REAL cache: `Providers` reads it, and a null-object one throws inside the
  // create-ticket flow's pre-check (see `evidence-upload.test.tsx`, which hit
  // exactly that).
  services.cache = createClientStateCache();

  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );
  return asked;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('16.58 the page asks the attachments read for the OPEN ticket', () => {
  it('16.58 passes the entries through, and passes a failure through as a sentence', async () => {
    // ARM ONE — the entries. Also the control for the call assertion below: the
    // page must ask at all before "it asked with the right arguments" means
    // anything.
    const asked = openTheTicket(async () => [ENTRY]);
    await waitFor(() => expect(screen.getByText('gst-receipt.pdf')).toBeInTheDocument());
    // THE ARGUMENTS, which is the half the sheet's own suite cannot see: a page
    // that read attachments for some OTHER ticket would draw a plausible list
    // and pass every screen-level assertion in 16.57.
    expect(asked).toEqual([[WORKSPACE, TICKET]]);
    expect(screen.queryByTestId('sheet-attachments-unavailable')).toBeNull();
    cleanup();

    // ARM TWO — the read FAILS. The page must hand the reason down rather than
    // dropping to `attachments={undefined}`, which draws the same nothing an
    // empty list does: the two states have to stay apart all the way to the
    // screen, and this is the last hop where they could collapse.
    const reason = 'HTTP 404 for /v1/workspaces/ws/tickets/tk/attachments';
    openTheTicket(async () => {
      throw new Error(reason);
    });
    const notice = await screen.findByTestId('sheet-attachments-unavailable');
    expect(notice).toHaveTextContent(reason);
    expect(screen.queryByText('gst-receipt.pdf')).toBeNull();
  });
});
