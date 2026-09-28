import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **THE EVIDENCE UPLOAD, AT THE CALL SITE THAT WAS MISSING.**
 *
 * `require-evidence` is a rule an admin can author from a SHIPPED screen, the
 * engine enforces it, and until this change **no surface in the product could
 * satisfy it** — so a transition into or out of a guarded state was refused
 * with no way for anyone to clear it. A rule that permanently blocks work.
 *
 * ## Why this file exists when the dialog's own suite already covers both branches
 *
 * `packages/app-core/test/views/transition-dialog.test.tsx` proves the dialog
 * renders a file input when `uploadEvidence` is supplied and the dead-end
 * sentence when it is not. **Both halves were green while the defect was live.**
 * The dialog was proven against a `vi.fn()` stub and the production caller never
 * supplied the real one — which is this repository's signature failure: *a
 * mocked contract is the thing that excuses the server from existing.*
 *
 * So this case deliberately does NOT re-test the dialog. It renders the REAL
 * page, opens a REAL ticket, drives the REAL dialog, and asserts that the
 * production caller now supplies an uploader **that reaches the shipped door
 * with the right ticket**. Delete `uploadEvidence` from the page and this case
 * reddens; the dialog's suite stays green, which is exactly why it could not
 * have caught this.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET00000000000000000';
const ANSELMA = '01J9USER000000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  // The ticket is OPEN — this is what mounts the sheet, and therefore what
  // makes the transition dialog reachable at all.
  useSearchParams: () => new URLSearchParams(`ticket=${TICKET}`),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ANSELMA, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

/** The workflow whose ONE transition carries the rule that blocks everything. */
const WF: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  // `require-evidence`, authored from a shipped screen — the rule that had no
  // satisfier anywhere in the product before this change.
  transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'require-evidence' }] }],
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
    // As in `description-editable.test.tsx`: nothing here reads the audience,
    // and a fake carries no visibility row.
    visibility: null,
    parent: null,
    rollup: null,
    // The breadcrumb's two crumb fields (2026-09-20); no case here reads them.
    key: null,
    epic: null,
  };
}

const UPLOADED = {
  attachmentId: '01J9GATA000000000000000000',
  url: `/v1/attachments/01J9GATA000000000000000000`,
  mime: 'application/pdf',
  filename: 'receipt.pdf',
  size: 5,
  sha256: 'a'.repeat(64),
};

/** Every request the shipped upload client makes, captured. */
let fetchCalls: Array<{ url: string; init: RequestInit }>;

beforeEach(() => {
  fetchCalls = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true, status: 201, json: async () => UPLOADED };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openTheBlockedTransition(): Promise<void> {
  const services = stubServices({
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: 'Garo Hills Logistics',
        prefix: 'GH',
        role: 'owner',
        archived: false,
        memberCount: 1,
        nameRestrictedProjectCount: 0,
        projects: [{ id: PROJECT, name: 'Errand tracking', prefix: 'ET', archived: false, ticketCount: 1, blockedCount: 0 }],
      },
    ],
    getTicket: async () => ticketRead(),
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getMembers: async () => [{ id: ANSELMA, name: 'Anselma Marak', role: 'owner' }],
  });
  /*
    ⚠ `stubServices` supplies a deliberate NULL-OBJECT cache — its own comment
    says "read only by CreateTicketFlow's instant pre-check, which no case
    opens." **This case is the first to open a TRANSITION DIALOG, and that
    dialog's precheck reads the cache.** Left null it throws
    `Cannot read properties of null (reading 'getTicket')` as an unhandled
    rejection: the two cases below still PASS while the run reports
    `Errors 2` and exits 1, which would redden the gate with a fixture fault
    wearing the shape of a product fault. A REAL cache is the honest fixture,
    and it is the same one `providers.tsx` builds for itself.
  */
  services.cache = createClientStateCache();

  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );

  // The sheet — proof the page actually opened this ticket.
  await userEvent.click(await screen.findByRole('button', { name: 'Move…' }));
  // The dialog then opens with its OWN destination select, which has to be
  // opened before a listbox exists at all — the same two-step the dialog's own
  // suite takes (`transition-dialog.test.tsx`).
  await userEvent.click(await screen.findByRole('button', { name: /Move to/ }));
  await userEvent.click(
    within(await screen.findByRole('listbox')).getByRole('option', { name: 'Done' }),
  );
}

describe('the evidence upload — the call site that made a rule permanently blocking', () => {
  it('16.31 the page supplies an uploader, so the dead end is GONE', async () => {
    await openTheBlockedTransition();

    // ⚠ THE ASSERTION THAT NAMES THE DEFECT, and it is an ABSENCE. While the
    // page passed no `uploadEvidence`, this sentence rendered and the dialog's
    // Move button was disabled forever — a rule an admin can author with no way
    // for anyone to satisfy it.
    expect(screen.queryByText(/Evidence upload is not available/)).toBeNull();
    expect(screen.getByLabelText('Evidence (required by this transition)')).toBeInTheDocument();
  });

  it('16.31 the upload reaches the SHIPPED door, scoped to THIS ticket, and unblocks the move', async () => {
    await openTheBlockedTransition();

    const moveButton = screen.getByRole('button', { name: 'Move' });
    // The blocked state first, so "it unblocked" is a change this case saw
    // rather than a condition it assumed.
    expect(moveButton).toBeDisabled();

    await userEvent.upload(
      screen.getByLabelText('Evidence (required by this transition)'),
      new File(['bytes'], 'receipt.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    // The SHIPPED route — not a second door, and not a client invented here.
    expect(fetchCalls[0]!.url).toBe('/v1/attachments');
    expect(fetchCalls[0]!.init.method).toBe('POST');
    // ⚠ AND THE TICKET IS THE ONE THE SHEET IS OPEN ON. This is what a
    // `Board`-style capability could get wrong (one capability object serves
    // every card); the evidence gate admits an upload only when the id AND the
    // ticket match (`gates/evidence-gate.ts:44-50`), so a wrong ticket would
    // not mis-file the bytes — it would refuse the very move it was meant to
    // unblock, with `attachment.evidence-unknown`.
    const form = fetchCalls[0]!.init.body as FormData;
    expect(form.get('ticketId')).toBe(TICKET);

    await waitFor(() => expect(moveButton).toBeEnabled());
  });
});
