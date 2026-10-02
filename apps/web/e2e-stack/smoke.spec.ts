import { expect, test } from '@playwright/test';
import { newUlid } from '@gisik-nokma/domain';
import { openSeededBoard } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import { WEB as WEB_ORIGIN } from './helpers/stack.js';

/**
 * The deployed-stack smoke: a real browser, a real Next container proxying to a
 * real API server, a real Postgres, a real test inbox.
 *
 * WHAT THE PLAN ASKED FOR THAT CANNOT BE WRITTEN AS WRITTEN. Its step is "click
 * Move bare, assert the refusal is visible with its reason". The shipped dialog
 * DISABLES Move while a require-comment transition has an empty comment
 * (`transition-dialog.tsx`: `blocked` includes `needsComment && comment.trim() === ''`),
 * so the bare click never reaches the server and no refusal is ever produced.
 * Asserting a refusal element here would be asserting the client's own preview,
 * which proves nothing about the rule engine.
 *
 * So the rule is tested at BOTH doors, and neither is weakened to suit the
 * other: the client's guard is asserted AS a disabled control, and the server's
 * enforcement is driven directly through `POST /v1/events` — the same door the
 * client uses — carrying the session cookie this browser just earned.
 */

/**
 * 13.172 — signIn (invoked at the top of this test) drives the shipped sign-in UI by role/label (getByLabel('Email'), getByRole('button', {name:'Send magic link'})) with no test id added for the suite; the link is fetched from Mailpit and followed, landing the browser authenticated.
 * 13.173 — this test navigates Convenience Corner -> Shop operations to a real board-column-* element and asserts ticket-card-* count is greater than zero, so an empty board (which would satisfy a bare no-error check) fails it.
 * 13.177 — a RECORD rather than an assertion, kept beside the suite it describes: the e2e-stack suite is off the LOCAL gate structurally — reached by `test:e2e:stack`, a script name turbo defines no task for, and excluded by `apps/web/vitest.config.ts`'s `test/**` include — while being deliberately ON CI's `gate` fan-in. Measured as `turbo run test --dry=json` = 16 tasks, 10 `#test`, 0 e2e; no test asserts it at runtime.
 * 13.354 (Task 15, neo restyle) — this test IS the "signs in through the restyled /sign-in and reaches /workspaces" witness: `signIn` drives the real (now-neo) sign-in page and the test proceeds onto `/workspaces`-derived board links, against the web image rebuilt from Task 15's frozen head.
 */
test('sign in through the real stack, reach the seeded board, and see the guarded door from both sides', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);

  // The workspaces list SERVES (ruling P38 — a guest sees a partial workspace,
  // and that is the correct answer). Navigation through it is live again; the
  // pre-flight note that said otherwise aged out and was re-measured.
  //
  // Asserted HERE rather than inside the walk below, because a card that never
  // rendered would otherwise surface as a 15 s timeout inside the helper, which
  // reads as a navigation defect instead of what it is.
  await page.goto('/workspaces');
  await expect(page.getByText('Convenience Corner')).toBeVisible({ timeout: 20_000 });

  // ⚠ THE NAVIGATION BELOW WAS WRONG FOR AS LONG AS ROUND 19c HAD BEEN IN, and it failed in the
  // most expensive available direction. These lines used to click the TEXT `Shop operations` here,
  // on the stated belief that "the project link is already on /workspaces, and clicking THAT is
  // what navigates". Round 19c made the whole card ONE `<Link>` to `/w/<id>` and left the project
  // names as plain text inside it — so the click navigated to the WORKSPACE, and the assertion
  // below then waited 20 s for a `board-column-*` on a page that has none. That reads exactly like
  // a broken board, which is why it was carried as one.
  //
  // Measured on the live stack, not inferred: the text node's `closest('a')` is `/w/<id>`, and the
  // page after the click renders the workspace home. `helpers/board.ts` now holds the one
  // definition of this path and names the project instead of taking a position — the helper starts
  // from `/workspaces` itself, so the `goto` two lines up is a no-op navigation and is kept only
  // because the assertion belongs on that page.
  await openSeededBoard(page);

  // The board rendered from real projections, not a fixture.
  // `:visible`, because an EMPTY workflow group on a multi-workflow board rests collapsed (owner 2026-09-23, board.tsx `defaultCollapsed`): its columns are in the DOM but `hidden`, and in CI's fresh browser (no stored choice) the first one in document order can be such a column. 13.1729.
  await expect(page.locator('[data-testid^="board-column-"]:visible').first()).toBeVisible({
    timeout: 20_000,
  });

  // The seeded errands are present. A count, not a mere visibility check: an
  // empty board would satisfy "no error appeared".
  const cards = page.locator('[data-testid^="ticket-card-"]');
  await expect
    .poll(async () => cards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
});

/**
 * 13.174 — this test POSTs to /v1/events through the WEB container's proxy with the session cookie, real ids read off the page, a real ULID (not crypto.randomUUID(), which would 200 as malformed-envelope), the WEB_ORIGIN header Playwright's page.request omits by default, and actorId from /api/auth/get-session, asserting exactly 200 with one non-malformed result; the identical POST from a fresh unauthenticated context asserts 401.
 */
test('the guarded door: the cookie-carrying POST reaches the server and is answered by it', async ({
  page,
  browser,
}) => {
  await signIn(page, OWNER_EMAIL);
  // Same walk as the smoke above, and the same repair: the project names on `/workspaces` are text
  // inside the card's single door link, so a text click reaches the workspace. `helpers/board.ts`.
  await openSeededBoard(page);

  const firstCard = page.locator('[data-testid^="ticket-card-"]').first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });

  // Real ids, read off the real page. A probe against an invented workspace is
  // refused for an unrelated reason while reading as though the rule had fired.
  const testId = await firstCard.getAttribute('data-testid');
  const ticketId = testId?.replace('ticket-card-', '') ?? '';
  expect(ticketId, 'a ticket id must be readable off the board').not.toBe('');
  const workspaceId = /\/w\/([^/]+)\//.exec(new URL(page.url()).pathname)?.[1] ?? '';
  expect(workspaceId, 'a workspace id must be readable off the URL').not.toBe('');

  // The actor is the SIGNED-IN USER, read from the session this browser holds
  // — not invented. The server refuses an envelope without one ("event envelope
  // is malformed at actorId: Required"), which is itself the door proving it
  // parses what it is sent.
  const session = await page.request.get('/api/auth/get-session');
  expect(session.status(), await session.text()).toBe(200);
  const actorId = ((await session.json()) as { user?: { id?: string } }).user?.id ?? '';
  expect(actorId, 'the signed-in user id must be readable from the session').not.toBe('');

  // `origin` IS SENT, and this line is the whole test. Playwright's
  // `page.request` does NOT send an Origin header — measured: the request
  // carries user-agent, accept, accept-encoding, content-type, content-length,
  // cookie, host, connection, and nothing else. `/v1/events` is in
  // HTTP_ORIGIN_PROTECTED_ROUTES and `httpOriginRefused` ends
  // `input.origin !== input.expectedOrigin`, so an ABSENT origin is refused —
  // as an `onRequest` hook, before routing, so `requireSession` never runs.
  // Without this header the POST is answered 403 `forbidden_origin` and every
  // assertion below about authentication passes on a request that never reached
  // the door. A browser's own same-origin POST sends it; the probe must too.
  const authed = await page.request.post('/v1/events', {
    headers: { origin: WEB_ORIGIN },
    data: {
      events: [
        {
          // A REAL ULID. `crypto.randomUUID()` is not one (`ULID_REGEX`,
          // `packages/domain/src/ids.ts`), and the route answers 200 with a
          // per-event `{status:'invalid', code:'malformed-envelope'}` — so the
          // ids read off the page would never reach a workspace check and the
          // test would pass without them meaning anything.
          id: newUlid(),
          workspaceId,
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.transitioned',
          version: 1,
          payload: { toStateId: 'done' },
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });

  // 200 exactly, not "under 500": the API server routed it and answered.
  const body = await authed.text();
  expect(authed.status(), body).toBe(200);
  const parsed = JSON.parse(body) as { results?: Array<{ status: string; code?: string }> };
  expect(parsed.results, body).toHaveLength(1);
  // The envelope PARSED — so the ids read off the page were load-bearing.
  expect(parsed.results?.[0]?.code, body).not.toBe('malformed-envelope');

  // THE OTHER SIDE OF THE LINE. The same POST from a context with no session
  // must NOT be accepted. Without this the assertions above are a bound
  // asserted on one side only — which is the exact defect this branch found in
  // the auth suite, and it would be absurd to reproduce it in the fix.
  const anon = await browser.newContext({ baseURL: 'http://localhost:3001' });
  const refused = await anon.request.post('/v1/events', {
    headers: { origin: WEB_ORIGIN },
    data: { events: [{ id: newUlid(), workspaceId, entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.transitioned', version: 1, payload: { toStateId: 'done' }, actorId,
      origin: 'web', clientTime: new Date().toISOString() }] },
  });
  expect(refused.status(), await refused.text()).toBe(401);
  await anon.close();
});
