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
 * 13.175 — a guest (accountant, seeded with workspace role guest and no project.member_added) sees the Convenience Corner workspace heading but zero occurrences of 'Shop operations', paired with a present link to the workspace they belong to in the same render — absent-with-a-present-sibling, never a bare toHaveCount(0) that would also pass on a blank or redirected page. (The sibling was a `My Work` link until 2026-09-20; Round 19c made `AppNav` contextual, so `/workspaces` with no workspace selected renders the always-tier items only. Measured live; the replacement names the workspace door link.)
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

  // ⚠ THE SIBLING BELOW WAS A `My Work` LINK UNTIL 2026-09-20, and it had gone stale rather than
  // wrong: Round 19c made `AppNav` CONTEXTUAL, so on `/workspaces` — where no workspace is selected
  // — it renders the always-tier items only (Workspaces, Help, Account, Inbox) and no `My Work`
  // link exists to find. The assertion was doing its job as a present-sibling control and the
  // sibling itself had moved, which is the failure mode of every control keyed on a specific
  // element: it reports "the page changed" and reads as "the rule broke".
  //
  // Measured on the live stack as the guest, not inferred. The replacement is the same property
  // with a stronger referent — the guest can still REACH the workspace they belong to (its card is
  // one door link to `/w/<id>`, Round 19c), while `Shop operations` is absent from the same render.
  // "The guest sees nothing at all" still fails this test.
  await expect(page.getByRole('link', { name: 'Convenience Corner' })).toBeVisible();
});
