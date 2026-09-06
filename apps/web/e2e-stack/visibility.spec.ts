import { expect, test } from '@playwright/test';
import { ACCOUNTANT_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * The guest sees exactly what is shared.
 *
 * The seed gives the accountant the `guest` role plus EXPLICIT per-ticket
 * visibility on exactly the four errands whose record names them
 * (`seed-convenience-corner.ts`: the visibility rows are "exactly the items
 * whose record names the accountant"). So this spec is a statement about the
 * server's read enforcement seen from a browser, not about the client's filter.
 *
 * THE MUTATION THAT MAKES THIS FALSIFIABLE, and it must be run by hand before
 * this file is believed: widen the server's visibility predicate to permit, and
 * this spec must REDDEN. A visibility test that stays green when the rule is
 * removed is testing the seed, not the rule.
 *
 * `toHaveCount(0)` is deliberately NOT the only assertion — it passes on a
 * blank page, a 500 and a redirect alike. Every negative here is paired with a
 * positive from the same render, so "the guest sees nothing at all" fails.
 */

test('a guest sees the shared errands and not the unshared ones', async ({ page }) => {
  await signIn(page, ACCOUNTANT_EMAIL);
  await page.goto('/workspaces');

  // POSITIVE CONTROL FIRST. If this fails, every toHaveCount(0) below is
  // meaningless and the failure says so rather than passing quietly.
  await expect(page.getByText('Convenience Corner')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Convenience Corner').click();

  // The guest's view rendered something real — a partial workspace IS the
  // correct answer here (ruling P38), so an empty shell is not acceptable.
  await expect(page.getByText('Shop operations')).toBeVisible({ timeout: 20_000 });
  await page.getByText('Shop operations').click();

  const cards = page.locator('[data-testid^="ticket-card-"]');
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });

  // The guest's board is NARROWER than the owner's. The owner's smoke asserts
  // the same board is non-empty; this asserts it is bounded. Both numbers come
  // from the same seeded world, so a change to the seed moves both and cannot
  // silently satisfy one.
  const visible = await cards.count();
  expect(visible, 'the guest sees the explicitly-shared errands').toBeGreaterThan(0);
  expect(
    visible,
    'the guest must NOT see the whole seeded board — the seed shares exactly four errands',
  ).toBeLessThan(23);
});
