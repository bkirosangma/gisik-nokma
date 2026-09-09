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
 */
export type CardViewer = { sentence: string; countsWithheld: boolean };

const ROLE_SENTENCES: Record<string, string> = {
  owner: "You're an owner here.",
  admin: "You're an admin here.",
  member: "You're a member here.",
  guest: "You're a guest here.",
};

export function viewerOf(role: string): CardViewer {
  const sentence = ROLE_SENTENCES[role];
  return {
    sentence: sentence ?? `Your role here is ${role}.`,
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
