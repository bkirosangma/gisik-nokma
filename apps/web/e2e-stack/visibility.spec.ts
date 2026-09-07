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

/**
 * 13.175 — a guest (accountant, seeded with workspace role guest and no project.member_added) sees the Convenience Corner workspace heading but zero occurrences of 'Shop operations', paired with a present My Work link in the same render — absent-with-a-present-sibling, never a bare toHaveCount(0) that would also pass on a blank or redirected page.
 */
test('a guest sees the workspace and NOT its projects — the partial workspace, from a browser', async ({
  page,
}) => {
  await signIn(page, ACCOUNTANT_EMAIL);
  await page.goto('/workspaces');

  // POSITIVE CONTROL FIRST. Without it every negative below passes on a blank
  // page, a 500 or a redirect, and the spec would be measuring nothing.
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({
    timeout: 20_000,
  });

  // THE NARROWING, and it is what "exactly what is shared" means here. MEASURED
  // rather than assumed: the first version of this spec expected the guest to
  // reach "Shop operations" and it does not exist on their page at all. The
  // seed makes the accountant a WORKSPACE member with role `guest` plus
  // explicit visibility on four TICKETS; it never emits `project.member_added`
  // for them, and `eff.projects` is built from that event and nowhere else. So
  // an empty project list is the product working — ruling P38's "a partial
  // workspace is the correct answer", seen from a browser for the first time.
  //
  // Asserted as ABSENT-WITH-A-PRESENT-SIBLING, never as a bare toHaveCount(0):
  // the workspace heading above is visible in the same render, so "the guest
  // sees nothing at all" fails this test rather than passing it.
  await expect(page.getByText('Shop operations')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'My Work' })).toBeVisible();
});
