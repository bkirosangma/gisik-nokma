/**
 * What to CALL a person in the shell — exec4 E4-33.
 *
 * ## The defect
 *
 * The product's default sign-up is an email magic link, and the sign-in form
 * asks for no name, so `magic-link sign-up creates name: ''` — the members page
 * has documented that since (`members/page.tsx:635-638`). The shell read
 * `user.name` directly in two places, so for those people:
 *
 * - `/workspaces`' `<h1>` read **`"Workspaces — "`** — a heading ending in an em
 *   dash and nothing;
 * - the nav button's accessible name read **`"Account menu for "`** — a name
 *   ending in a preposition;
 * - the monogram was a **`?`** with an empty `title` and an empty `aria-label`.
 *
 * **MEASURED** on the painted app as the seeded guest
 * `accountant@e2e.gisik-nokma.local`; the signed-in owner paints
 * `Workspaces — Kiro` / `Account menu for Kiro` / `KI` on the same elements.
 * These are the two labels EVERY signed-in screen carries, and they are the
 * person's own — which is why this is the shell and not a picker (exec 5's
 * E5-4) or provenance (E4-6, where `provenance.ts` records a RULED decision to
 * fall back to the raw actor id rather than a name or an address).
 *
 * ## Why one module rather than a `||` at each site
 *
 * `name || email` written twice is two answers to one question, and the two
 * labels are read side by side on every screen. The empty case is the one that
 * matters: an address is not guaranteed either (`useCurrentUser` types `email`
 * as `string | null`), and a caller that concatenates a suffix onto an empty
 * string produces exactly the dangling punctuation this finding is about.
 * **So the contract here is that the empty string means NO LABEL, and every
 * caller omits its suffix for it** — the h1 and the button both do.
 */

/** The shape both callers have: a display name, and an address that may be absent. */
export type DisplayIdentity = { name: string; email?: string | null };

function trimmedOrEmpty(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The person's name for the shell: their display name, or their email address,
 * or `''` when they have neither.
 *
 * A whitespace-only name is treated as NO name, the reading the ledger's own
 * `displayName` refine takes (`packages/domain`'s blank-name rule refuses
 * `'   '`), so a name of spaces cannot become a heading of spaces.
 *
 * **An email is a worse label than a name and a far better one than silence** —
 * it is what the person signed in with, it identifies them uniquely, and it is
 * already on screen in the account menu's own header.
 */
export function displayLabelOf(person: DisplayIdentity): string {
  const name = trimmedOrEmpty(person.name);
  if (name !== '') return name;
  return trimmedOrEmpty(person.email);
}

/**
 * What the MONOGRAM draws from: the name, or the email's LOCAL PART when there
 * is none.
 *
 * The local part rather than the whole address, because the address's domain is
 * the same for everyone on a hosted service and would put the same letters in
 * every monogram. `initialsOf` reduces a single word to its first two
 * characters, so `accountant` draws `AC` where the whole address would have
 * drawn the same `AC` — the difference shows on addresses whose local part is
 * one character, where the domain would otherwise be quoted as the person's own
 * initials.
 *
 * `''` for an address with no local part (`@x.co`), which reaches `initialsOf`'s
 * own documented answer for an empty name — `?`. That fallback is NOT changed
 * here: a person with neither a name nor a usable address has no handle to draw
 * from, and the `?` is the honest answer rather than an invented one.
 */
export function avatarNameOf(person: DisplayIdentity): string {
  const name = trimmedOrEmpty(person.name);
  if (name !== '') return name;
  const email = trimmedOrEmpty(person.email);
  const at = email.indexOf('@');
  return at > 0 ? email.slice(0, at) : '';
}
