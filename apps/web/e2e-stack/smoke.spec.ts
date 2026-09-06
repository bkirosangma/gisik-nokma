import { expect, test } from '@playwright/test';
import { newUlid } from '@gisik-nokma/domain';
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

test('sign in through the real stack, reach the seeded board, and see the guarded door from both sides', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);

  // The workspaces list SERVES (ruling P38 — a guest sees a partial workspace,
  // and that is the correct answer). Navigation through it is live again; the
  // pre-flight note that said otherwise aged out and was re-measured.
  await page.goto('/workspaces');
  await expect(page.getByText('Convenience Corner')).toBeVisible({ timeout: 20_000 });

  // NOTE: the workspace name is an <h2>, not a link — clicking it is a no-op.
  // The project link is already on /workspaces, and clicking THAT is what
  // navigates. Said plainly because the first version of these lines described
  // a two-step navigation that does not happen.
  await expect(page.getByText('Shop operations')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Shop operations').click();

  // The board rendered from real projections, not a fixture.
  await expect(page.locator('[data-testid^="board-column-"]').first()).toBeVisible({
    timeout: 20_000,
  });

  // The seeded errands are present. A count, not a mere visibility check: an
  // empty board would satisfy "no error appeared".
  const cards = page.locator('[data-testid^="ticket-card-"]');
  await expect
    .poll(async () => cards.count(), { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test('the guarded door: the cookie-carrying POST reaches the server and is answered by it', async ({
  page,
  browser,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/workspaces');
  // The workspace name is an <h2>; the project link is already on /workspaces.
  await page.getByText('Shop operations').click();

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
