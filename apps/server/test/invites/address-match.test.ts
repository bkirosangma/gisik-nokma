import { describe, expect, it } from 'vitest';
import { addressMatchesAccount, maskAddress } from '../../src/invites/address-match.js';

const account = (over: Partial<Parameters<typeof addressMatchesAccount>[2]> = {}) => ({
  email: 'Rina@Example.com', emailVerified: true, phoneNumber: '+919001400001', phoneNumberVerified: true, ...over,
});

describe('6.260 addressMatchesAccount', () => {
  it('6.260 email case-insensitive + trimmed, phone digits-only, unverified never; CONTROL: exact self-match', () => {
    expect(addressMatchesAccount('email', 'Rina@Example.com', account())).toBe(true); // control
    expect(addressMatchesAccount('email', '  rina@example.COM ', account())).toBe(true);
    expect(addressMatchesAccount('email', 'rina@example.com', account({ emailVerified: false }))).toBe(false);
    expect(addressMatchesAccount('phone', '+91 90014-00001', account())).toBe(true);
    expect(addressMatchesAccount('phone', '919001400001', account())).toBe(true);
    expect(addressMatchesAccount('phone', '+919001400001', account({ phoneNumberVerified: false }))).toBe(false);
    expect(addressMatchesAccount('phone', '+919001400001', account({ phoneNumberVerified: null }))).toBe(false);
    expect(addressMatchesAccount('phone', '+919001400001', account({ phoneNumber: null }))).toBe(false);
    // A different number, and an address with no digits at all, never match.
    expect(addressMatchesAccount('phone', '+919001400002', account())).toBe(false);
    expect(addressMatchesAccount('phone', 'call me', account({ phoneNumber: '' }))).toBe(false);
    // A phone user's synthetic email is never a match for an EMAIL invite, even
    // when the invite names that synthetic address exactly and the flag is set.
    expect(addressMatchesAccount('email', '919001400001@phone.gisik-nokma.invalid',
      account({ email: '919001400001@phone.gisik-nokma.invalid' }))).toBe(false);
    // An email invite is not matched through the phone, nor a phone invite through the email.
    expect(addressMatchesAccount('email', '+919001400001', account())).toBe(false);
    expect(addressMatchesAccount('phone', 'rina@example.com', account())).toBe(false);
  });
});

describe('6.264 maskAddress', () => {
  it('6.264 email first char + ••• + domain, phone ••• + last two; CONTROL: a one-char local part', () => {
    expect(maskAddress('email', 'bkirosangma@gmail.com')).toBe('b•••@gmail.com');
    expect(maskAddress('phone', '+919001400001')).toBe('•••01');
    expect(maskAddress('phone', '+91 90014-00001')).toBe('•••01');
    expect(maskAddress('email', 'a@x.test')).toBe('a•••@x.test'); // control: never the whole address
    // The mask never carries more of the local part than its first character, nor more of a phone than two digits.
    expect(maskAddress('email', 'bkirosangma@gmail.com')).not.toContain('kiro');
    expect(maskAddress('phone', '+919001400001')).not.toContain('1400001');
    // No `@` at all: nothing of the value survives.
    expect(maskAddress('email', 'not-an-address')).toBe('•••');
  });
});
