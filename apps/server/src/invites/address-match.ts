import { isSyntheticPhoneEmail } from '../auth/synthetic-address.js';

type Account = {
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean | null;
};

const digits = (s: string): string => s.replace(/[^0-9]/g, '');

/**
 * Is this account the one an invitation was addressed to (R4, owner ruling
 * 2026-09-29: an invitation link opened by any other account is REFUSED)?
 *
 * Email: verified, equal case-insensitively after trimming — the banner door's
 * comparison (`routes/my-invitations.ts`). A phone user's synthetic email is
 * this product's own invention and names nobody's inbox, so it never matches.
 * Phone: verified, equal on digits alone, because the mint stores the address
 * exactly as typed (FD4) and `syntheticPhoneEmail` normalises the same way.
 */
export function addressMatchesAccount(channel: 'email' | 'phone', address: string, account: Account): boolean {
  if (channel === 'email') {
    if (!account.emailVerified || isSyntheticPhoneEmail(account.email)) return false;
    return account.email.trim().toLowerCase() === address.trim().toLowerCase();
  }
  if (account.phoneNumber === null || account.phoneNumberVerified !== true) return false;
  const want = digits(address);
  return want !== '' && digits(account.phoneNumber) === want;
}

/**
 * The address as the refusal may say it: enough to recognise, not enough to
 * learn. An email keeps its first character and its whole domain; a phone keeps
 * its last two digits. A value with no `@` (or one that starts with it) keeps
 * nothing.
 */
export function maskAddress(channel: 'email' | 'phone', address: string): string {
  if (channel === 'phone') return `•••${digits(address).slice(-2)}`;
  const at = address.lastIndexOf('@');
  if (at <= 0) return '•••';
  return `${address.slice(0, 1)}•••${address.slice(at)}`;
}
