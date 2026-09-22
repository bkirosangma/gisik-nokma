import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { ListRow, TicketListView, TicketRead } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * **THE OWNER'S REQUEST, 2026-09-22 — OPENING OR CLOSING THE SHEET MUST NOT
 * MOVE THE PAGE.**
 *
 * > *"currently, opening a ticket, in the board and on the list, the page gets
 * > scrolled to the top. it should not scroll."*
 *
 * ## The cause, and why the witness is the ROUTER CALL and not `scrollY`
 *
 * The ticket sheet is not a route. It is a `?ticket=` query parameter on the
 * project page the reader is already on, and every door into it is a
 * `router.push(url)` with **no options** in
 * `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`. `router.push`'s
 * `options.scroll` defaults to `true`, which scrolls the window to the top on
 * EVERY navigation — including one that only adds or removes `?ticket=` on the
 * page the reader is standing on. Measured in the running dev stack
 * (2026-09-22, `3fcd94ff`): List tab, document scrolled to `scrollY` 600, a
 * click on a row → `0`, sheet open; Close → `0` again. In the same run
 * `window.next.router.push(sameUrl, { scroll: false })` held `600` on both, and
 * a control default push went back to `0`.
 *
 * **jsdom has no layout and does not scroll**, so no render here could observe
 * a `scrollY`. The thing that was WRONG is the shape of the argument list, so
 * that is what is asserted — `toHaveBeenCalledWith(url, { scroll: false })`,
 * never `toHaveBeenCalled()` and never `expect.anything()` for the options:
 * either of those would pass on today's one-argument call and report a fix that
 * is not there.
 *
 * ## The three doors, and the one that keeps the default
 *
 * `openTicket` and `closeTicket` both stay on this page, so both push
 * `{ scroll: false }`. `openParentTicket` is the third and DIFFERENT: a parent
 * may live in ANOTHER project (case 6.57 records that nothing refuses one), and
 * then the reader really is leaving the page and the default scroll is the
 * right one. So its options are an EXPRESSION of the two locations, and 13.1324
 * witnesses BOTH arms in one case — a blanket `{ scroll: false }` there would
 * strand the reader mid-page on the project they just arrived at.
 */
const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';
/** The parent's project when the locator places it somewhere else. */
const OTHER_PROJECT = '01J9OTHERPROJECT0000000000';
const TICKET = '01J9TICKET00000000000000000';
const PARENT = '01J9PARENTTICKET00000000000';
const TITLE = 'File the GST return';
const PARENT_TITLE = 'Close the September books';

/**
 * ⚠ THE QUERY IS MUTABLE BECAUSE THE TWO FILTERS ARE. 13.1322 attends on the
 * project page with no sheet open and 13.1323/13.1324 mount with
 * `ticket=<TICKET>`; a `vi.mock` factory is hoisted and static, so a frozen
 * `new URLSearchParams(...)` would make one of the three impossible to write.
 * `vi.hoisted` is the same shape `settings-page.test.tsx` uses for its own
 * per-case query.
 */
const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE, projectId: PROJECT }),
  usePathname: () => `/w/${WORKSPACE}/p/${PROJECT}`,
  useSearchParams: () => query.current,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } },
      isPending: false,
    }),
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
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
  ],
};

const provenance = {
  actorId: '01J9USER000000000000000000',
  actorName: 'Anselma Marak',
  clientTime: '2026-09-19T07:59:00.000Z',
  serverTime: '2026-09-19T08:00:00.000Z',
};

/** A `ListRow` exactly as `view-types.ts` declares it — the List needs one to draw a door. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  return {
    ticketId: TICKET,
    title: TITLE,
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: provenance,
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    priority: { value: 'P2', claim: provenance },
    fields: { title: { value: TITLE, ...provenance } },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
    ...overrides,
  };
}

/**
 * The ticket the sheet is open on. `parent` is the field 13.1324 turns on: a
 * ticket ref renders the `sheet-crumb-parent` BUTTON, and `null` renders no
 * crumb at all.
 */
function ticketRead(parent: TicketRead['parent']): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket',
    id: TICKET,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    typeId: 'task',
    parentId: parent === null || parent.kind !== 'ticket' ? null : parent.id,
    workflowId: WF.id,
    workflowVersion: WF.version,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: { value: TITLE, ...provenance } },
    transitions: [],
    closed: null,
    rank: null,
    reopenedAt: null,
    deleted: null,
  };
  return {
    ticket,
    title: TITLE,
    stateProvenance: provenance,
    assignedProvenance: null,
    visibility: null,
    parent,
    rollup: null,
    key: null,
    epic: null,
  };
}

function servedWorld(
  options: {
    rows?: ListRow[];
    parent?: TicketRead['parent'];
    locate?: (workspaceId: string, ticketId: string) => Promise<{ projectId: string } | null>;
  } = {},
) {
  return stubServices(
    {
      getTickets: async (): Promise<TicketListView> => ({
        projectId: PROJECT,
        rows: options.rows ?? [],
      }),
      getMyWorkspaces: async () => [
        {
          id: WORKSPACE,
          name: 'Garo Hills Logistics',
          // REQUIRED: `mapWorkspaceRefs` reads it as a plain string and refuses
          // an absent one (sheet-delete's own note for the same field).
          prefix: 'GH',
          role: 'owner' as const,
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
      getTicket: async () => ticketRead(options.parent ?? null),
      getWorkflowDef: async () => WF,
      getTicketHistory: async () => [],
      getTicketTypes: async () => [
        { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: WF.id, fields: [] },
      ],
      getMembers: async () => [],
    },
    {
      /*
        ⚠ THE LOCATOR IS STUBBED IN EVERY CASE, and in 13.1322 and 13.1323 with
        a refusal rather than a placement. `stubServices`'s unstubbed gateway
        REJECTS, and a rejection is the locator's transport arm — the sheet would
        draw a notice. Neither of those two cases opens a parent, so the honest
        fixture is a locator that is never asked.
      */
      ticketLocation: {
        locate: async (_workspaceId: string, ticketId: string) => {
          if (options.locate === undefined) {
            throw new Error('this case did not open a parent');
          }
          const placed = await options.locate(_workspaceId, ticketId);
          return placed === null ? null : { workspaceId: WORKSPACE, projectId: placed.projectId };
        },
      },
    },
  );
}

afterEach(() => {
  query.current = new URLSearchParams();
  push.mockClear();
});

describe('13.1322 opening a ticket from the List does not scroll the page', () => {
  it('pushes the ticket query with { scroll: false }', async () => {
    render(
      <Providers services={servedWorld({ rows: [row()] })}>
        <ProjectPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await userEvent.click(await screen.findByRole('button', { name: TITLE }));

    // EXACTLY ONCE, and with the options object — `toHaveBeenCalled()` would
    // pass on the shipped one-argument call, which is the whole defect.
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/p/${PROJECT}?ticket=${TICKET}`, {
      scroll: false,
    });
  });
});

describe('13.1323 closing the sheet does not scroll the page', () => {
  it('pushes the bare project path with { scroll: false }', async () => {
    query.current = new URLSearchParams(`ticket=${TICKET}`);

    render(
      <Providers services={servedWorld({ rows: [row()] })}>
        <ProjectPage />
      </Providers>,
    );

    // The sheet is OPEN — this is the proof the page mounted it rather than
    // merely rendering under a query it ignored.
    await userEvent.click(await screen.findByRole('button', { name: 'Close sheet' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/w/${WORKSPACE}/p/${PROJECT}`, { scroll: false }),
    );
    expect(push).toHaveBeenCalledTimes(1);
  });
});

describe('13.1324 the parent crumb scrolls only when the parent is in another project', () => {
  it('keeps the page still in this project, and takes the default when the parent lives elsewhere', async () => {
    const parentRef = { kind: 'ticket' as const, id: PARENT, title: PARENT_TITLE };

    // ── ARM 1 — the parent is in THIS project: the reader stays on the page.
    query.current = new URLSearchParams(`ticket=${TICKET}`);
    const here = render(
      <Providers
        services={servedWorld({
          rows: [row()],
          parent: parentRef,
          locate: async () => ({ projectId: PROJECT }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByTestId('sheet-crumb-parent'));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/p/${PROJECT}?ticket=${PARENT}`,
        { scroll: false },
      ),
    );

    // ⚠ THE CONTROL IS IN THE SAME `it`, NOT A SIBLING — a blanket
    // `{ scroll: false }` on `openParentTicket` passes arm 1 and would leave the
    // reader stranded mid-page on a project they have just arrived at. A sibling
    // `it` would let that variant report green on the arm that matters.
    here.unmount();
    push.mockClear();
    query.current = new URLSearchParams(`ticket=${TICKET}`);

    const elsewhere = render(
      <Providers
        services={servedWorld({
          rows: [row()],
          parent: parentRef,
          locate: async () => ({ projectId: OTHER_PROJECT }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    await userEvent.click(await screen.findByTestId('sheet-crumb-parent'));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        `/w/${WORKSPACE}/p/${OTHER_PROJECT}?ticket=${PARENT}`,
        { scroll: true },
      ),
    );
    elsewhere.unmount();
  });
});
