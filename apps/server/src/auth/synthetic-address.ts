/**
 * The synthetic address better-auth's phone plugin mints, and the ONE place that
 * fact is spelled.
 *
 * ## Why this module exists rather than a literal at the call site
 *
 * `user."email"` is `NOT NULL UNIQUE` (`migrations/1787927101493_auth-tables.sql:19`)
 * because the library requires an address, so **every phone-only sign-up gets a
 * synthetic one**. Its column comment has said so since the table was created:
 * *"a phone-only sign-up is given a synthetic address at
 * phone.gisik-nokma.invalid … the invalid TLD guarantees nothing can be delivered
 * to it."*
 *
 * That address is not a contact detail — but it **encodes one**: the local part
 * is the phone number with every non-digit stripped. So any read that carries
 * `user."email"` verbatim carries a phone number wearing a non-contactable
 * domain, which is the shape that is easy to leak and hard to notice.
 *
 * The roster read is the first consumer that had to decide about it, and the
 * owner's instruction (*"if the name is absent, show the email instead"*) is
 * coherent because the two populations **as this product creates them** do not
 * overlap: a phone sign-up's `name` is the phone itself (`auth.ts`'s
 * `getTempName`), so a row with a synthetic address **always has a name and never
 * reaches the fallback**. (A magic-link sign-up on that domain is accepted by
 * better-auth's `z.email()` and does reach it — measured, benign, and the reason
 * this says "as this product creates them" rather than "always".) The
 * omission this module enables therefore costs no behaviour — and it is made
 * deliberately, in one named predicate, so that the next read to carry an
 * address has a sentence to find rather than rediscovering the reasoning.
 *
 * The builder and the test below are kept in one module on purpose: a domain
 * string that is spelled twice can drift, and the drift would be silent in
 * exactly the direction that matters — an address that stops being recognised as
 * synthetic starts being sent.
 */
export const SYNTHETIC_PHONE_EMAIL_DOMAIN = 'phone.gisik-nokma.invalid';

/**
 * The address this product gives a phone-only sign-up.
 *
 * The `replace` is better-auth's own (`signUpOnVerification.getTempEmail`),
 * preserved exactly: it is the input to the identity of every phone user, so a
 * "tidier" version here would mint a different address than the one already in
 * the table.
 */
export function syntheticPhoneEmail(phone: string): string {
  return `${phone.replace(/[^0-9]/g, '')}@${SYNTHETIC_PHONE_EMAIL_DOMAIN}`;
}

/**
 * Is this address one this product invented?
 *
 * Compared on the domain taken from the LAST `@`, case-insensitively, because the
 * domain half of an address is case-insensitive. **Measured against the
 * `endsWith('@' + domain)` alternative rather than argued from it:** the two are
 * equivalent on every input EXCEPT case-folding — both withhold a malformed
 * `a@b@phone.gisik-nokma.invalid`, and neither withholds
 * `someone@phone.gisik-nokma.invalid.example.com`. An earlier version of this
 * sentence claimed they differed on the first of those, which they do not; the
 * predicate was always at least as strict as it claimed, and only the prose was
 * wrong. What actually decides the choice is case: `PHONE.GISIK-NOKMA.INVALID` is
 * a domain this product would have minted, and this predicate's answer decides
 * whether a phone number goes onto the wire.
 */
export function isSyntheticPhoneEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false;
  return email.slice(at + 1).toLowerCase() === SYNTHETIC_PHONE_EMAIL_DOMAIN;
}
