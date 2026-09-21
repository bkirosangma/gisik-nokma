/**
 * What a viewer is in one workspace, said ONCE for every surface that asks.
 *
 * Task 18 wrote this reasoning at `app/workspaces/page.tsx`, where it had one
 * caller. Task 19's workspace home is the second, and a second copy would have
 * been the exact defect the original docblock argues against — two places
 * deciding "may this person be told numbers", free to drift apart, with the
 * `/workspaces` card and the workspace home disagreeing about the same person.
 * It is EXTRACTED rather than re-derived: the two functions below are Task 18's
 * verbatim, moved, and `test/workspaces-cards.test.tsx` (13.380/13.381) goes on
 * driving them through the card exactly as before.
 *
 * ## ONE role value, and every affordance reads the SAME one
 *
 * Two decisions come out of this: what sentence to greet the viewer with, and
 * whether numbers may be printed at all. **Both read `role` and nothing else.**
 * The second source that suggests itself is `memberCount === null` — the
 * server's own withholding — and it is a different fact that happens to agree
 * today: it means *this number was withheld*, not *you are a guest*. Case
 * 13.381 seeds the one body where they disagree (a guest served counts, which
 * the shipped server never sends) and dies if a chip stops reading the role.
 *
 * ## An unknown role is greeted, not gated open
 *
 * `WorkspaceRef.role` is a `string` on the wire, not a union — the server sends
 * `proj_memberships.role` verbatim. So a role this build has never heard of is
 * reachable, and the two answers pull opposite ways: the SENTENCE falls back to
 * something true and vague, and `countsWithheld` falls back to **true**.
 * Withholding from a role we cannot place is the conservative direction, and it
 * is the only one where being wrong is recoverable.
 *
 * ## `clause`, added Round 19b — the SAME role value, a second English shape
 *
 * The home page's header meta line reads *"N members · M active projects ·
 * you're an owner"* — the role sitting mid-sentence rather than opening one, so
 * it needs a CLAUSE ("an owner") rather than the card's full SENTENCE ("You're
 * an owner here."). Both come out of one `viewerOf(role)` call, which is what
 * "ONE source — the card's sentence and this clause cannot disagree" means:
 * there is no second read of `role` anywhere that could drift from this one.
 */
export type CardViewer = { sentence: string; clause: string; countsWithheld: boolean };

const ROLE_SENTENCES: Record<string, string> = {
  owner: "You're an owner here.",
  admin: "You're an admin here.",
  member: "You're a member here.",
  guest: "You're a guest here.",
};

const ROLE_CLAUSES: Record<string, string> = {
  owner: 'an owner',
  admin: 'an admin',
  member: 'a member',
  guest: 'a guest',
};

export function viewerOf(role: string): CardViewer {
  const sentence = ROLE_SENTENCES[role];
  const clause = ROLE_CLAUSES[role];
  return {
    sentence: sentence ?? `Your role here is ${role}.`,
    clause: clause ?? `a ${role}`,
    countsWithheld: sentence === undefined || role === 'guest',
  };
}

/**
 * May this viewer archive a project, restore one, or found one? (Task 19.)
 *
 * **This is a DISPLAY decision and it is not enforcement**, which is the whole
 * reason it is named for what it gates rather than for what it knows. The
 * server decides the same question again and independently, out of
 * `resolveEffectiveRole` (`apps/server/src/permissions/check-permission.ts`,
 * `ADMIN_ONLY_TYPES` — `project.created`, `project.archived`, `project.restored`
 * are all three in it), and that second answer is the one that binds: hiding a
 * control removes a temptation, never a capability. Case 13.388 drives a plain
 * member's three mutations at the real door with no UI in the picture at all,
 * precisely so this function's correctness is never what the refusal rests on.
 *
 * It reads the SAME served `role` `viewerOf` reads, and that agreement is
 * deliberate: one value off the wire, two questions asked of it, so a viewer
 * cannot be greeted as one thing and gated as another.
 *
 * **`owner` and `admin`, and no project-level widening.** A project admin runs
 * their project's roster and their tickets' visibility; retiring a project is
 * the workspace's decision. That is the server's own boundary
 * (`hasProjectAdminRights` is deliberately NOT what gates the archive pair
 * there), restated here so the two doors answer alike rather than by accident.
 */
export function mayAdminister(role: string): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * *"1 project · name restricted"* — or nothing at all.
 *
 * Zero renders NOTHING, and that is the same rule the invitation banner keeps:
 * a person with nothing withheld from them must not be told about withholding.
 * *"0 projects · name restricted"* would be a sentence announcing an absence
 * nobody asked about, and it would appear on every owner's card, where the
 * count is zero by construction.
 *
 * ONE interpolation, not three — React renders each JSX interpolation as its
 * own text node, so a sentence assembled out of several is split in the
 * accessibility tree and in every `getByText` that looks for it.
 */
export function restrictedLine(count: number): string | null {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? 'project' : 'projects'} · name restricted`;
}

/**
 * *"2 projects"* — the card's meta line, and the count is `live.length` ALONE.
 *
 * The tempting sum is `live.length + nameRestrictedProjectCount`, and it is
 * wrong. `apps/server/src/read/workspace-counts.ts:259-265` states that the
 * restricted count **is never split by `archived` and cannot be** — a project
 * whose name is withheld has no `archived` flag as far as this caller is
 * concerned, because that flag is served only alongside the name it rides
 * with. Adding an archived-UNKNOWN count to an archived-EXCLUDED one produces
 * a number that counts nothing. The restricted projects keep their own
 * sentence (`restrictedLine` above), which is why that sentence exists apart
 * from this one.
 *
 * Zero SAYS SO rather than rendering nothing (E5-36, 2026-09-21). This used to
 * return `null` on the strength of the `restrictedLine` rule above, and that
 * rule's reason does not reach here: it is about a person with NOTHING WITHHELD
 * being told about withholding, and this line carries no withholding at all.
 * What `null` bought instead was a founder's fresh workspace card — avatar, name,
 * chips, *"You're an owner here."* — with no mention of projects and no pointer to
 * the **New project** form, which `docs/manual.md:174` already sends an owner to
 * as the only control that makes a workspace usable. So the card now says the
 * absence, which is the manual's own convention for one.
 *
 * A WITHHELD viewer still never sees this line: the one caller gates it on
 * `!viewer.countsWithheld`, so `0` cannot reach a guest. The rule that mattered
 * is kept where it was doing work — at the caller — rather than borrowed by a
 * function whose subject has nothing to do with withholding.
 */
export function projectCountLine(liveCount: number): string {
  if (liveCount <= 0) return 'No projects yet';
  return `${liveCount} ${liveCount === 1 ? 'project' : 'projects'}`;
}

/**
 * How many project names the card prints before it stops naming them.
 *
 * A COUNT, deliberately, and not a CSS line-clamp. A clamp truncates whatever
 * overflows — including the "+N more" suffix itself, which would hide the very
 * number the suffix exists to give. Three names is CHOSEN as what should fit
 * the prototype's ~280px card on two lines at 15px — not measured against a
 * render.
 */
export const PROJECT_LINE_CAP = 3;

/**
 * *"Delivery · Site readiness · Winter stock · +1 more"* — the prototype's
 * single project line, truncated.
 *
 * `names` is the LIVE, NAMED projects: archived ones never reach this card,
 * and name-restricted ones are absent from the served array by construction.
 * An empty list renders nothing rather than an empty line, and the
 * name-restricted sentence covers the case where that emptiness is the point.
 *
 * ## The suffix has two forms, and the reason is a test's name
 *
 * `test/workspaces-cards.test.tsx`'s 13.380 is *"a guest card shows one
 * 'Restricted' chip and **no number outside the owner-ruled restricted
 * sentence**"* (retitled, whole-branch review Minor 2 — the card's own "1
 * project · name restricted" is a number, so the original "no number
 * anywhere" title was false; the test strips that exact sentence before its
 * digit scan). A guest still sees the
 * project names — their set is exactly the errands handed to them by name —
 * so the line renders; but "+1 more" is a number, so a withheld viewer gets
 * "and more" instead. Both forms read `countsWithheld`, which the caller took
 * from `viewerOf(role)`: there is no second read of the role here.
 *
 * ONE interpolation, not several — React renders each as its own text node,
 * and a sentence split across nodes is split in the accessibility tree and in
 * every `getByText` that looks for it.
 */
export function projectLine(
  names: readonly string[],
  countsWithheld: boolean,
): string | null {
  if (names.length === 0) return null;
  const shown = names.slice(0, PROJECT_LINE_CAP).join(' · ');
  const hidden = names.length - PROJECT_LINE_CAP;
  if (hidden <= 0) return shown;
  return `${shown} · ${countsWithheld ? 'and more' : `+${hidden} more`}`;
}
