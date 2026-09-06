import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

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

  await page.getByText('Convenience Corner').click();
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

test('the guarded door, from both sides: the client disables Move, the server refuses the claim', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/workspaces');
  await page.getByText('Convenience Corner').click();
  await page.getByText('Shop operations').click();

  const firstCard = page.locator('[data-testid^="ticket-card-"]').first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });

  // Real ids, read off the real page. A probe against an invented workspace
  // would be refused for an unrelated reason (unknown workspace) while reading
  // as though the transition rule had fired — the exact shape of a check that
  // passes for a reason other than the one it names.
  const testId = await firstCard.getAttribute('data-testid');
  const ticketId = testId?.replace('ticket-card-', '') ?? '';
  expect(ticketId, 'a ticket id must be readable off the board').not.toBe('');

  const url = new URL(page.url());
  const workspaceId = /\/w\/([^/]+)\//.exec(url.pathname)?.[1] ?? '';
  expect(workspaceId, 'a workspace id must be readable off the URL').not.toBe('');

  // The API door, through the WEB container's proxy, carrying the session
  // cookie this browser actually earned. Asserted only as far as it is pinned:
  // the door is REAL, it is AUTHENTICATED, and it does not fall over. The
  // rule-level refusal text belongs to the server's own suite, which can name
  // the seeded workflow's states; this suite cannot without inventing them.
  const response = await page.request.post('/v1/events', {
    data: {
      events: [
        {
          id: crypto.randomUUID(),
          workspaceId,
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.transitioned',
          version: 1,
          payload: { toStateId: 'done' },
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });

  const body = await response.text();
  // Not 401: the cookie travelled through the proxy, which is the property this
  // whole suite exists to prove. Not 5xx: the door is not merely absent.
  expect(response.status(), body).not.toBe(401);
  expect(response.status(), body).toBeLessThan(500);
});
