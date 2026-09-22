/**
 * The label a person is shown and named by: **name, then email, then id**, in
 * that order, resolved in ONE place.
 *
 * The owner's instruction (2026-09-22): *"Everywhere for id, show the Name; if
 * name is empty/blank, show the email."*
 *
 * ## Why this is a function rather than an expression at each call site
 *
 * It began as three inline `member.name` reads on the members screen — the
 * monogram, the name cell, and the role control's `aria-label` — and they all
 * broke together for the same population. better-auth's magic-link plugin
 * creates a user with `name: name || ""` and our sign-in page sends no name
 * (`apps/web/app/sign-in/page.tsx`), so **an email sign-up has `name === ''`**:
 * the cell rendered empty, the disc rendered blank, and the control announced
 * `"Role for "` — an accessible name that identifies nobody. Three reads of one
 * possibly-empty string is how a cell and an accessible name come to disagree;
 * one resolved label cannot. It was then copied a second time as `pickerLabel`
 * in `views/visibility-editor.tsx`, with the same order and the same
 * blank-is-absent rule written out again — two copies of a rule, free to drift.
 *
 * ## Blank is ABSENT at both steps
 *
 * A whitespace-only name is not a name and an empty address is not an address,
 * so each step is tested after `trim()`. The id floor is what a row with neither
 * degrades to, rather than to an empty cell and a nameless control — and the id
 * is a fact the server sent.
 *
 * ## The structure is the point: ANY caller can pass its own member shape
 *
 * The parameter is STRUCTURAL rather than `RosterMember`, so the roster type
 * passes straight in and a wire `WorkspaceMember` passes as
 * `{ id: m.userId, name: m.displayName, email: m.email }`. A surface that holds
 * a roster member — a picker option, an assignee chip, a mention list — has no
 * reason to reach past this function to `.name`.
 *
 * ## Where the two populations this product CREATES differ, and why that matters
 *
 * `email` is withheld by the server for a phone-only sign-up, whose
 * `displayName` IS the phone (`apps/server/src/routes/builder-reads.ts`: *"The
 * owner's instruction is if the name is absent, show the email instead"*). So
 * the second step fires exactly for genuine addresses and never for a phone.
 * No client special-cases phones, and none should: the server's withholding IS
 * the case distinction, and re-deriving it here would be a second copy of it.
 *
 * **The disjointness is a fact about what this product MINTS, not an invariant,
 * and the difference is reachable.** better-auth's magic-link request schema is
 * `z.email()`, whose pattern ACCEPTS `fake@phone.gisik-nokma.invalid` (measured),
 * and the sign-in page passes the address straight through — so a person who
 * signs in by magic link on the synthetic domain gets `name === ''` AND a
 * withheld address, and the third step is what names them. Benign, but the step
 * is not unreachable, and an earlier version of this reasoning said it was.
 *
 * ## `actorLabel` is NOT this function, and it sits AFTER it
 *
 * `provenance.ts`'s `actorLabel(actorId, actorName)` is the ATTRIBUTION
 * renderer, and its order is different on purpose: the reserved
 * `SYSTEM_ACTOR_NAMES` lookup FIRST, then the given label if non-blank, then the
 * id. **The system step has to be first there and would be wrong here:** a
 * roster row that happened to carry `SYSTEM_ACTOR_AUTO_CLOSE`'s id must not be
 * able to rename a decision no person made, and auto-close must never be given
 * an email. It also keeps no email step, because it is handed a claim's
 * `{actorId, actorName}` and not a roster row — the email step reaches it by
 * riding the roster JOIN's VALUE (`rosterByActorId`, `online/mappers.ts`), which
 * is built with THIS function. So the chain, end to end, is:
 * `memberLabel` names the member; the join carries that name; `actorLabel` puts
 * a system actor in front of it and floors at the id.
 */
export function memberLabel(member: { id: string; name: string; email?: string }): string {
  const name = member.name.trim();
  if (name.length > 0) return name;
  const email = member.email?.trim() ?? '';
  if (email.length > 0) return email;
  return member.id;
}
