import { ulid } from 'ulidx';

declare const brandSymbol: unique symbol;

/** Nominal typing helper: Brand<string, 'Ulid'> is assignable to string, never the reverse. */
export type Brand<T, B extends string> = T & { readonly [brandSymbol]: B };

/** Crockford base32, 26 chars; first char 0-7 because the 48-bit timestamp bounds it. */
export const ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export type Ulid = Brand<string, 'Ulid'>;

export function newUlid(): Ulid {
  return ulid() as Ulid;
}

export function isUlid(value: string): value is Ulid {
  return ULID_REGEX.test(value);
}
