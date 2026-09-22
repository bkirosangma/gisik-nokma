import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **THE SHEET'S BREADCRUMB LINKS — THE HREFS AND THE ROUTER, AT THE CALL SITE.**
 *
 * `TicketSheet` renders the workspace and the project crumbs as `<a href>`
 * whenever its host passes `workspaceHref`/`projectHref`, and decides what a
 * click does from `onNavigate` (owner request, 2026-09-22: *"the workspace and
 * the project should also be clickable from the breadcrumb"*). The component's
 * own suite (`packages/app-core/test/views/ticket-sheet.test.tsx`'s `13.1317`
 * and `13.1318`) proves the MARKUP and the CLICK RULES against hand-passed
 * props. **None of it can see whether the product passes them at all**, which is
 * this repository's signature failure in its client-side form — *a mocked
 * contract is the thing that excuses the server from existing* — and it is
 * exactly the shape this page has already been caught in: the sheet accepted
 * `uploadEvidence` all along and THIS CALL SITE never passed it, so every
 * `require-evidence` transition was refused with no way to satisfy it.
 *
 * So this case renders the REAL page, opens a REAL ticket and reads the REAL
 * bar, because the three things only the call site can answer are:
 *
 *   1. the HREFS the two crumbs get (`/w/<workspaceId>` and
 *      `/w/<workspaceId>/p/<projectId>`), which no component test can invent;
 *   2. that clicking the PROJECT crumb pushes the page's own path — the
 *      sheet-closing navigation `closeTicket` already makes (`page.tsx:1278`);
 *   3. and that this navigation does NOT SCROLL the page to the top, which is
 *      the owner's report and Next 15's `router.push` default (see the note on
 *      the assertion below).
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET00000000000000000';
const PARENT = '01J9PARENT00000000000000000';
const ANSELMA = '01J9USER000000000000000000';
const TITLE = 'File the GST return';
const WORKSPACE_NAME = 'Garo Hills Logistics';
const PROJECT_NAME = 'Errand tracking';

/**
 * `vi.hoisted`, not a bare `const` — `vi.mock` is hoisted above every import and
 * every top-level statement, so a factory closing over an ordinary `const`
 * would read it in its temporal dead zone. The same note
 * `account-page.test.tsx` and `sign-in.test.tsx` carry for theirs.
 */
const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  // The ticket is OPEN — this is what mounts the sheet, and therefore what
  // makes its breadcrumb reachable at all.
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

/**
 * A ticket WITH a parent, which `sheet-delete.test.tsx`'s own fixture
 * deliberately does not have. The parent crumb is the control this case needs:
 * it is the one crumb in the bar that stays a `<button>`, because opening it
 * needs a server lookup first — so a version that made the whole bar anchors
 * would redden here rather than pass on the two arms that were asked for.
 */
function ticketRead(): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id: TICKET,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    typeId: 'task',
    parentId: PARENT,
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
    visibility: null,
    parent: { kind: 'ticket', id: PARENT, title: 'Registrations' },
    rollup: null,
    key: null,
    epic: null,
  };
}

async function openTheSheet(): Promise<void> {
  const services = stubServices({
    getTickets: async () => ({ projectId: PROJECT, rows: [] }),
    getMyWorkspaces: async () => [
      {
        id: WORKSPACE,
        name: WORKSPACE_NAME,
        // The ticket key's first half. REQUIRED: `mapWorkspaceRefs` reads it as
        // a plain string and refuses an absent one, so a stub without it takes
        // the page down and reads as a layout failure.
        prefix: 'GH',
        role: 'owner',
        memberCount: 1,
        nameRestrictedProjectCount: 0,
        projects: [
          {
            id: PROJECT,
            name: PROJECT_NAME,
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
  // A REAL cache, not `stubServices`'s deliberate null-object: the transition
  // dialog's precheck reads it, and a null-object here would be a failure
  // dressed as a fixture.
  services.cache = createClientStateCache();

  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );

  // The bar itself, which is stronger than waiting for the sheet: the two names
  // arrive from an async read, so a case that only waited for the sheet would
  // race the crumbs into existence.
  await screen.findByRole('navigation', { name: 'Ticket location' });
}

afterEach(() => {
  push.mockClear();
  // The workspace name is MODULE-cached (`use-workspace-name.ts`), and jsdom
  // modules are shared across the cases in one file — a cached name would make
  // the second case's crumbs appear synchronously and hide any regression in
  // the read the names actually come from.
  clearWorkspaceNameCache();
});

describe('13.1320 the sheet’s workspace and project crumbs, at the page', () => {
  it('13.1320 the page passes both hrefs, and the project crumb closes the sheet without scrolling', async () => {
    const user = userEvent.setup();
    await openTheSheet();

    const nav = screen.getByRole('navigation', { name: 'Ticket location' });
    const workspaceLink = within(nav).getByRole('link', { name: WORKSPACE_NAME });
    expect(workspaceLink).toHaveAttribute('href', `/w/${WORKSPACE}`);
    const projectLink = within(nav).getByRole('link', { name: PROJECT_NAME });
    expect(projectLink).toHaveAttribute('href', `/w/${WORKSPACE}/p/${PROJECT}`);

    // THE CONTROL — the PARENT crumb is still a BUTTON, in the same run. It is
    // the one crumb in this bar that cannot be an address: opening it needs a
    // server lookup first (`openParentTicket` → `ticketLocation.locate`), since
    // a parent may sit in another project. Without this arm a version that
    // turned every crumb into an anchor — including making the parent one,
    // which it cannot honour — would pass everything above.
    expect(within(nav).getByRole('button', { name: 'Registrations' })).toBeInTheDocument();

    // THE PROJECT CRUMB — the sheet-closing navigation. `closeTicket`
    // (`page.tsx:1278`) pushes exactly this path, and it is the same page the
    // reader is already on: the sheet is mounted by `?ticket=`, so leaving that
    // param off is what closes it.
    push.mockClear();
    await user.click(projectLink);
    expect(push).toHaveBeenCalledTimes(1);
    // ⚠ `{ scroll: false }` IS THE OWNER'S OTHER REPORT, and it is asserted
    // rather than left to the default. Next 15's `router.push(href)` scrolls to
    // the top; measured in the running app, `scrollY` went 600 → 0 on a default
    // push and 600 → 600 with this option. Closing the sheet is a same-page
    // navigation, so scrolling is a jump to the top of the page the reader was
    // already reading.
    expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/p/${PROJECT}`, { scroll: false });

    // THE WORKSPACE CRUMB — a DIFFERENT page, so the default stands: a reader
    // who follows it is landing somewhere new, and a new page opening at its
    // top is what they expect. Both arms in one case so neither can be satisfied
    // by the option being hard-coded.
    push.mockClear();
    await user.click(workspaceLink);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}`, { scroll: true });
  });
});
