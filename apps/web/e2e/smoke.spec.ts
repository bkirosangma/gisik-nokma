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
 * rather than copied from the plan. **⚠ That sentence was false of two of the
 * ten stubs when it was written, and they were the two whose contracts had
 * changed:** `workspaces.ts` and `my-invitations.ts` carried the file and no
 * line. Both carry one now — `:177` and `:184`, read off the shipped route
 * handlers — so the rule is true of all ten, measured rather than assumed:
 * `grep -c 'page.route('` answers 10 and the citations carrying a line answer 10.
 * **Five of the eight that DID carry a line had drifted off the registration**, which is
 * what a citation into a growing file does: four pointed at docblock prose and the fifth
 * at a BLANK line inside its file, which reads as a citation that resolves until it is
 * opened. Every line below was re-read at the `app.get` and now names the
 * line the PATH is on, which is the line a reader wants — a registration is a path, and
 * the path is what has to be found.
 *
 * ## The body SHAPES are the shipped ones, not the plan's
 *
 * The plan's stub for `/v1/me/workspaces` answers
 * `{workspaces:[{id, name, projects:[…]}]}`. The shipped route answers
 * `{workspaces:[{workspaceId, name, role}]}` and carries no projects at all —
 * which is one of the reasons `mapWorkspaceRefs` **used to** REFUSE. **⚠ CORRECTED
 * 2026-09-20: this was present tense, and the refusal is gone — rulings P32/P38
 * served `getMyWorkspaces` and the register has been empty since 2026-09-19.** The
 * route still carries no `projects`, which is why the STUB below still has to
 * supply them. Shapes here are taken
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

  // GET /v1/projects/:projectId/board — apps/server/src/routes/board.ts:312.
  await page.route(`**/v1/projects/${PRJ}/board`, (route) => route.fulfill({ json: BOARD }));

  // GET /v1/workspaces/:workspaceId/members — apps/server/src/routes/builder-reads.ts:660.
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

  // GET /v1/projects/:projectId/tickets — apps/server/src/routes/list.ts:505.
  // Stubbed so the List tab makes its request. The body is deliberately a
  // groupless one: `mapListView` maps it (it REFUSED outright until ruling P25
  // clause 1) and answers zero rows, so this stub still cannot make the list
  // render tickets — it only proves the request is made.
  await page.route(`**/v1/projects/${PRJ}/tickets*`, (route) =>
    route.fulfill({ json: { projectId: PRJ, groups: [], nextCursor: null } }),
  );

  // GET /v1/workspaces/:workspaceId/attention — apps/server/src/routes/attention.ts:362.
  await page.route(`**/v1/workspaces/${WS}/attention`, (route) =>
    route.fulfill({ json: { workspaceId: WS, items: [] } }),
  );

  // GET/PUT /v1/me/preferences — apps/server/src/routes/preferences.ts:97 and :114.
  await page.route('**/v1/me/preferences*', (route) =>
    route.fulfill({ json: { version: 1, projects: {}, savedFilters: [] } }),
  );

  // GET /v1/me/workspaces — apps/server/src/routes/workspaces.ts:177. This is the
  // route whose absence once hid behind this smoke, and the stub is written to
  // the shape it actually serves so that this file cannot be the reason a shape
  // drift goes unnoticed.
  //
  // **That claim had already stopped being true, and this is the correction.**
  // The stub said "`workspaceId`, `name`, `role`, and NO projects", which was
  // the shape before rulings P32/P38 added a visibility-scoped `projects` — and
  // `mapWorkspaceRefs` REQUIRES that key (an absent one means the route did not
  // answer the question; `[]` is a different claim). This spec is not in the
  // turbo gate, so nothing went red when the two drifted apart. Task 16 adds
  // `memberCount` and the per-project `{archived, ticketCount, blockedCount}`,
  // and both halves of the drift are closed here rather than one.
  //
  // The values are an ADMIN's, matching `role` below: an admin is served every
  // count. A guest is served this object with the three count keys ABSENT,
  // which is what `WorkspaceRef`'s `number | null` means (cases 13.366, 13.372).
  // GET /v1/me/invitations — apps/server/src/routes/my-invitations.ts:184 (Task
  // 17). The `/workspaces` banner reads it, so leaving it unstubbed would let
  // this spec measure whichever stack happens to be up. `{invitations: []}` is
  // the case whose layout the smoke is about: the banner renders nothing.
  await page.route('**/v1/me/invitations', (route) =>
    route.fulfill({ json: { invitations: [] } }),
  );

  await page.route('**/v1/me/workspaces', (route) =>
    route.fulfill({
      json: {
        workspaces: [
          {
            workspaceId: WS,
            name: 'Convenience Corner',
            // The ticket key's first half (2026-09-20), and REQUIRED like the
            // count below: `mapWorkspaceRefs` reads it as a plain string and
            // throws on an absent key. ⚠ THIS STUB WAS STALE FOR A DAY BEFORE
            // ANYTHING SAID SO — it was already missing `description` on the
            // project below, added 2026-09-19, because `apps/web/e2e` is on NO
            // GATE. The mapper only ever reports the FIRST missing key, so the
            // older omission stayed invisible behind the newer one.
            prefix: 'CC',
            role: 'admin',
            memberCount: 3,
            // Task 18, and REQUIRED on the wire for every caller — an admin
            // here, but a guest body would carry it too. `mapWorkspaceRefs`
            // throws on an absent one, so a stub that omitted it would take
            // this whole page down and read as a layout failure.
            nameRestrictedProjectCount: 0,
            projects: [
              {
                projectId: PRJ,
                name: 'Shop operations',
                // The second half of the key, and again required.
                prefix: 'SO',
                archived: false,
                // Door A (2026-09-19) and required-with-a-null-spelling: the
                // mapper refuses a project row that omits the key rather than
                // reading the omission as "not described".
                description: null,
                ticketCount: 2,
                blockedCount: 0,
              },
            ],
          },
        ],
      },
    }),
  );

  // GET /v1/invites/:token — apps/server/src/routes/invites.ts:399. No session
  // required, deliberately: the token IS the credential.
  await page.route('**/v1/invites/tok_e2e', (route) =>
    route.fulfill({
      json: { workspaceId: WS, workspaceName: 'Convenience Corner', role: 'guest' },
    }),
  );
}

/**
 * RENAMED AND AMENDED, and the old name is the finding.
 *
 * It was `sign-in offers all four passwordless methods`, and it asserted the two
 * that could not work: `Continue with Google` rendered while `GOOGLE_CLIENT_ID`
 * was unset, and `Sign in with a passkey` could not work for any user anywhere
 * because no registration flow existed ANYWHERE IN APP CODE at the time.
 * **A test whose NAME asserts a property is a test that defends it**, and this
 * one was defending the defect.
 *
 * **The passkey half of that history ENDED with the account/help-screens plan's
 * Task 8**, which built registration on `/account` — so the button is back and
 * the assertion at the foot of this case is now a positive one. The name of this
 * case still holds, and holds better: the methods that can work are offered, and
 * a passkey can now work.
 *
 * This file is Playwright and is NOT in the turbo gate, so it stayed green
 * through the whole change and only turned red when someone ran it directly —
 * which is exactly how a suite outside the gate fails: silently, until it does
 * not. Recorded rather than just fixed.
 *
 * `stubApi` does not stub `/v1/auth/methods`, so the page's availability request
 * goes unanswered here and no social button renders — and, since round 2c, no
 * phone tab either: an unanswered request leaves availability `null`, which the
 * page reads as "cannot work" for every GATED method. That is the honest
 * expectation for a run with no server behind it, and it is what makes the
 * passkey button's presence below discriminating rather than incidental — it is
 * the one method NOT gated on that answer, because it needs no provider.
 * The BOTH-DIRECTIONS property lives in `apps/web/test/sign-in.test.tsx`
 * (13.326), where the answer can be driven, and in
 * `e2e-viewport/responsive.spec.ts` (13.292).
 */
test('sign-in offers the methods that can work, and no control that cannot', async ({ page }) => {
  await stubApi(page);
  await page.goto('/sign-in');
  /* Email, not the tabs — and this file is WHY that matters. `smoke.spec.ts` is
   * Playwright and is NOT in the turbo gate, so when the previous round removed
   * the passkey button this file went on asserting it and stayed green through
   * the entire change, turning red only when someone ran it by hand. The same
   * trap was set here for the Phone tab: `stubApi` does not stub
   * `/v1/auth/methods`, the request goes unanswered, availability stays `null`,
   * and a `null` answer now means NO phone tab — so these two lines would have
   * failed, silently, until a human ran the file. Updated in the same change
   * set as the behaviour, deliberately, because the gate will not do it. */
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Sign-in method' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Phone' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
  /* THE SAME TRAP, SPRUNG IN THE OPPOSITE DIRECTION — and it caught this file a
   * SECOND time, exactly as the docblock above predicted it would.
   *
   * This line read `…'Sign in with a passkey' }).toHaveCount(0)` until the
   * account/help-screens plan's Task 8 put the button back (registration now
   * exists on `/account`, so the offer has a population it can serve). Nothing
   * in the turbo gate would have reddened for it: this file is Playwright,
   * outside the gate, and the previous round's docblock says so in as many
   * words. It was found by grepping `apps/web/e2e/` for `passkey` while
   * auditing what a visible new control on `/sign-in` touches — not by a test
   * run. **Updated in the same change set as the behaviour, deliberately,
   * because the gate will not do it.**
   *
   * The assertion is now the sharpest one this file can make about the button,
   * and it is not merely the negation of what was here. `stubApi` leaves
   * `/v1/auth/methods` UNANSWERED, so availability stays `null` and every
   * method gated on the server's answer vanishes — the tablist, the Phone tab
   * and both social marks, all asserted absent immediately above. The passkey
   * button surviving that is the whole property: **a passkey needs no provider
   * and no server capability check, so it is deliberately NOT gated on that
   * answer** — and this is the only place it is witnessed in a real browser
   * rather than in jsdom. */
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
});

/**
 * THE PLAN'S NAVIGATION STEP IS DROPPED, and this is what replaces it.
 *
 * **THE CLAIM INVERTED, AND THE CASE WAS PASSING FOR THE WRONG REASON.** This
 * docblock read: *"`mapWorkspaceRefs` is an unconditional `throw` —
 * `getMyWorkspaces` is one of the six serving gaps — so `/workspaces` renders
 * the REFUSAL and never draws a project link, whatever body a `page.route`
 * supplies."* Rulings P32/P38 closed that refusal: the mapper answers, and the
 * page renders the list.
 *
 * The case stayed green anyway, and the reason is the finding. This file's own
 * `/v1/me/workspaces` stub had gone stale in the same direction — it carried no
 * `projects` key, which `mapWorkspaceRefs` REQUIRES — so the page really did
 * render a refusal, from a `MappingError` about a malformed stub rather than
 * from the serving gap this case names. **A green tick over the right screen
 * for the wrong reason**, and it survived because this suite is on no gate.
 * Task 16 fixed the stub (it had to, to add the counts), which is what turned
 * the case red and exposed both halves.
 *
 * So the smoke asserts what the page NOW does — it lists the workspace the stub
 * serves — plus the falsehood it must never print and the door it must keep
 * open: `/workspaces` must not say there are no workspaces, and it must still
 * let a person found one.
 */
/**
 * 3.137 — The plan's dropped-and-replaced /workspaces navigation lists the served workspace (never 'no workspaces yet') while still offering the founding door, proven against Playwright/Chromium.
 */
test('the workspace list RENDERS what it is served, and the founding door is still open', async ({
  page,
}) => {
  await stubApi(page);
  await page.goto('/workspaces');
  // The workspace the stub serves, by its own card hook — not by text, which
  // 'Convenience Corner' also matches inside the invite screen's copy.
  await expect(page.getByTestId(`workspace-card-${WS}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible();
  await expect(page.getByText('No workspaces yet.')).toHaveCount(0);
  // The founding door is the header's Create workspace button; the form is behind it (22.151).
  await expect(page.getByRole('button', { name: 'Create workspace' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await page.getByRole('button', { name: /^Moved to Doing by/ }).click();
  await expect(page.getByText('Moved to Doing by Anselma Marak on 19 Aug 2026')).toBeVisible();
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
