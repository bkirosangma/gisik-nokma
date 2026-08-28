import { ulid } from 'ulidx';

declare const brandSymbol: unique symbol;

/** Nominal typing helper: Brand<string, 'Ulid'> is assignable to string, never the reverse. */
export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

/** Crockford base32, 26 chars; first char 0-7 because the 48-bit timestamp bounds it. */
export const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

/**
 * The composite entity id of a membership: `${workspaceId}:${userId}`, two
 * ULIDs joined by a colon. `membership` is the ONE entity kind whose id is not
 * a bare ULID (coordination decision 5, owner-ratified 2026-08-28): grant →
 * revoke → re-grant must share one entity stream, and a replica has to be able
 * to mint that id from `(workspaceId, userId)` without a read-before-write, so
 * an opaque fresh ULID cannot serve.
 *
 * Composed from `ULID_REGEX`'s OWN SOURCE rather than spelled a second time. A
 * hand-written `[0-7][0-9A-HJKMNP-TV-Z]{25}` here would be a second statement
 * of what a ULID is, free to drift from the first — the same discipline
 * `ulidString` states about itself in envelope.ts. `membershipId()` in
 * entity-state.ts writes the string this pattern reads; they are one
 * convention seen from its two sides.
 */
const ULID_BODY = ULID_REGEX.source.replace(/^\^/, '').replace(/\$$/, '');
export const MEMBERSHIP_ID_REGEX = new RegExp(`^${ULID_BODY}:${ULID_BODY}$`);

export type Ulid = Brand<string, 'Ulid'>;

export function newUlid(): Ulid {
  return ulid() as Ulid;
}

export function isUlid(value: string): value is Ulid {
  return ULID_REGEX.test(value);
}
