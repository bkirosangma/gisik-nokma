import { expect, test, type Page } from '@playwright/test';

/**
 * The Playwright smoke: this shell against stubbed routes, no API server and no
 * database.
 *
 * ## EVERY STUB NAMES THE SERVER THAT HOLDS ITS CONTRACT
 *
 * The coordination doc records the failure this rule exists to prevent, by name:
 * `GET /v1/me/workspaces` was served by NO plan, Plan 6's navigation coded
 * against it, and this smoke MOCKED it — so the one test that could have caught
 * the missing route was the thing papering over it. A `page.route` with no named
 * owner is a route that has been invented, and nothing downstream can tell the
 * difference between a stub of something real and a stub of something wished
 * for. Each entry below therefore carries the `apps/server/src/...:line` that
 * registers it, and every one of those was re-derived from the shipped source
 * rather than copied from the plan.
 *
 * ## The body SHAPES are the shipped ones, not the plan's
 *
 * The plan's stub for `/v1/me/workspaces` answers
 * `{workspaces:[{id, name, projects:[…]}]}`. The shipped route answers
 * `{workspaces:[{workspaceId, name, role}]}` and carries no projects at all —
 * which is one of the reasons `mapWorkspaceRefs` REFUSES. Shapes here are taken
 * from `packages/domain/src/read-models.ts` and the route handlers.
 */
const SESSION = {
  user: { id: '01J9USER000000000000000000', name: 'Kiro', email: 'kiro@example.test' },
  session: {
    id: '01J9SESSION0000000000000AB',
    userId: '01J9USER000000000000000000',
    expiresAt: '2027-01-01T00:00:00.000Z',
  },
};

const WS = '01J9WORKSPACE0000000000000';
const PRJ = '01J9PROJECT000000000000000';
const TICKET = '01J9TICKET0000000000000000';
const ANSELMA = '01J9USER000000000000000001';

/** `BoardResponse` — `packages/domain/src/read-models.ts:218`, flat `columns`. */
const BOARD = {
  projectId: PRJ,
  workspaceId: WS,
  columns: [
    {
      workflowId: 'wf-errand',
      workflowName: 'Errand',
      workflowVersion: 1,
      stateId: 'todo',
      name: 'To do',
      category: 'open',
      blocked: false,
      cards: [],
    },
    {
      workflowId: 'wf-errand',
      workflowName: 'Errand',
      workflowVersion: 1,
      stateId: 'doing',
      name: 'Doing',
      category: 'active',
      blocked: false,
      cards: [
        {
          ticketId: TICKET,
          workspaceId: WS,
          projectId: PRJ,
          typeId: 'task',
          parentId: null,
          workflowId: 'wf-errand',
          stateId: 'doing',
          stateCategory: 'active',
          assigneeId: ANSELMA,
          collaboratorIds: [],
          title: 'File the GST return',
          dueDate: null,
          fields: {},
          stateProvenance: {
            actorId: ANSELMA,
            clientTime: '2026-08-19T09:58:12.000Z',
            serverTime: '2026-08-19T10:00:00.000Z',
            cause: null,
          },
          rollup: {
            totalChildren: 8,
            terminalChildren: 5,
            uncategorizedChildren: 0,
            restrictedCount: 2,
          },
        },
      ],
    },
    {
      workflowId: 'wf-errand',
      workflowName: 'Errand',
      workflowVersion: 1,
      stateId: 'done',
      name: 'Done',
      category: 'terminal',
      blocked: false,
      cards: [],
    },
  ],
};

async function stubApi(page: Page): Promise<void> {
  // better-auth's own handler, mounted as a wildcard — apps/server/src/auth/routes.ts:76.
  await page.route('**/api/auth/**', (route) => route.fulfill({ json: SESSION }));

  // GET /v1/projects/:projectId/board — apps/server/src/routes/board.ts:286.
  await page.route(`**/v1/projects/${PRJ}/board`, (route) => route.fulfill({ json: BOARD }));

  // GET /v1/workspaces/:workspaceId/members — apps/server/src/routes/builder-reads.ts:547.
  // The board's roster join reads this on every board load, to turn an actorId
  // into a display name. `MemberListResponse` — read-models.ts.
  await page.route(`**/v1/workspaces/${WS}/members`, (route) =>
    route.fulfill({
      json: {
        workspaceId: WS,
        members: [
          { userId: ANSELMA, displayName: 'Anselma Marak', role: 'member' },
          { userId: SESSION.user.id, displayName: 'Kiro', role: 'admin' },
        ],
      },
    }),
  );

  // GET /v1/projects/:projectId/tickets — apps/server/src/routes/list.ts:480.
  // Stubbed so the List tab makes its request; `getTickets` REFUSES in the
  // client regardless of the body, so this stub cannot make the list render.
  await page.route(`**/v1/projects/${PRJ}/tickets*`, (route) =>
    route.fulfill({ json: { projectId: PRJ, groups: [], nextCursor: null } }),
  );

  // GET /v1/workspaces/:workspaceId/attention — apps/server/src/routes/attention.ts:328.
  await page.route(`**/v1/workspaces/${WS}/attention`, (route) =>
    route.fulfill({ json: { workspaceId: WS, items: [] } }),
  );

  // GET/PUT /v1/me/preferences — apps/server/src/routes/preferences.ts:97 and :114.
  await page.route('**/v1/me/preferences*', (route) =>
    route.fulfill({ json: { version: 1, projects: {}, savedFilters: [] } }),
  );

  // GET /v1/me/workspaces — apps/server/src/routes/workspaces.ts:149. The SHIPPED
  // shape: `workspaceId`, `name`, `role`, and NO projects. This is the route
  // whose absence once hid behind this smoke; it exists now, and the stub is
  // written to the shape it actually serves so that this file cannot be the
  // reason a shape drift goes unnoticed.
  await page.route('**/v1/me/workspaces', (route) =>
    route.fulfill({ json: { workspaces: [{ workspaceId: WS, name: 'Convenience Corner', role: 'admin' }] } }),
  );

  // GET /v1/invites/:token — apps/server/src/routes/invites.ts:378. No session
  // required, deliberately: the token IS the credential.
  await page.route('**/v1/invites/tok_e2e', (route) =>
    route.fulfill({
      json: { workspaceId: WS, workspaceName: 'Convenience Corner', role: 'guest' },
    }),
  );
}

test('sign-in offers all four passwordless methods', async ({ page }) => {
  await stubApi(page);
  await page.goto('/sign-in');
  await expect(page.getByRole('tab', { name: 'Phone' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Email link' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
});

/**
 * THE PLAN'S NAVIGATION STEP IS DROPPED, and this is what replaces it.
 *
 * The plan's second case goes to `/workspaces` and clicks a link named
 * "Registrations". That click can never land: `mapWorkspaceRefs` is an
 * unconditional `throw` — `getMyWorkspaces` is one of the six serving gaps — so
 * `/workspaces` renders the REFUSAL and never draws a project link, whatever
 * body a `page.route` supplies. Stubbing harder cannot fix it, because the
 * refusal is client-side and deliberate. Weakening the mapper to make the click
 * work is the one thing this step is forbidden to do.
 *
 * So the smoke asserts what the page actually does, and asserts the falsehood
 * it must not print: `/workspaces` must not say there are no workspaces, and it
 * must still let a person found one.
 */
test('the workspace list REFUSES out loud, and the founding door is still open', async ({ page }) => {
  await stubApi(page);
  await page.goto('/workspaces');
  await expect(page.getByRole('status')).toContainText('cannot be shown yet');
  await expect(page.getByText('No workspaces yet.')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'New workspace' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create workspace' })).toBeVisible();
});

test('the board renders a card, its restricted-count line, and its attributed provenance', async ({
  page,
}) => {
  await stubApi(page);
  // Reached by URL rather than by the click above, for the reason that case
  // states. The route segments are this app's own (`app/w/[workspaceId]/p/[projectId]`).
  await page.goto(`/w/${WS}/p/${PRJ}`);
  await expect(page.getByRole('region', { name: 'Doing' })).toBeVisible();
  await expect(page.getByText('5 of 8 done · 2 restricted')).toBeVisible();
  await page.getByRole('button', { name: 'who · when' }).click();
  await expect(page.getByText('marked Doing by Anselma Marak on 19 Aug 2026')).toBeVisible();
});

test('an invite link names the workspace and offers the join', async ({ page }) => {
  await stubApi(page);
  await page.goto('/invite/tok_e2e');
  await expect(page.getByText(/invited to join/)).toBeVisible();
  // The plan's assertion here is a bare `getByText('Convenience Corner')`, and
  // RUNNING it is what showed it cannot pass: the name appears twice on this
  // page — once in the sentence and once inside the join button — so Playwright
  // fails it under strict mode as an ambiguous locator, not as a missing
  // element. Scoped to the `<strong>` the page actually renders it in, which is
  // also the more specific claim: the workspace is NAMED, not merely mentioned
  // on a button.
  await expect(page.getByRole('strong').filter({ hasText: 'Convenience Corner' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join Convenience Corner' })).toBeVisible();
});

/**
 * A dead link is the other half of the invite contract, and it is the half a
 * real person is most likely to meet — a forwarded link, a second acceptance, a
 * lapsed one. All four arrive as ONE 404 with one frozen body
 * (`INVITE_NOT_OPENABLE_BODY`, apps/server/src/routes/invites.ts:111), so a
 * holder learns nothing about which.
 */
test('a dead invite link says so, and offers no join', async ({ page }) => {
  await stubApi(page);
  await page.route('**/v1/invites/tok_dead', (route) =>
    route.fulfill({
      status: 404,
      json: {
        error: 'not_found',
        message:
          'This invitation link does not open anything. It may have been used, withdrawn, or lapsed — ask whoever invited you for a new one.',
      },
    }),
  );
  await page.goto('/invite/tok_dead');
  await expect(page.getByText(/does not open anything/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Join / })).toHaveCount(0);
});
