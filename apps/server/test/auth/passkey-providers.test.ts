import { describe, expect, it } from 'vitest';
import { providerOf, UNKNOWN_PROVIDER } from '../../src/auth/passkey-providers.js';

describe('6.324 AAGUID → provider', () => {
  it.each([
    ['fbfc3007-154e-4ecc-8c0b-6e020557d7bd', 'iCloud Keychain'],
    ['ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Google Password Manager'],
    ['08987058-cadc-4b81-b6e1-30de50dcbe96', 'Windows Hello'],
    ['bada5566-a7aa-401f-bd96-45619a55120d', '1Password'],
    ['d548826e-79b4-db40-a3d8-11116f7e8349', 'Bitwarden'],
    ['531126d6-e717-415c-9320-3d9aa6981239', 'Dashlane'],
    ['adce0002-35bc-c60a-648b-0b25f1f05503', 'Chrome on Mac'],
  ])('6.324 %s → %s', (aaguid, label) => {
    expect(providerOf(aaguid)).toBe(label);
    // The table is case-blind: the plugin stores the AAGUID as the authenticator sent it.
    expect(providerOf(aaguid.toUpperCase())).toBe(label);
  });

  it('6.324 control: anything else, the all-zero AAGUID and null read "Security key or other" - never a UUID', () => {
    for (const x of ['00000000-0000-0000-0000-000000000000', '12345678-1234-1234-1234-123456789abc', '', null]) {
      const label = providerOf(x);
      expect(label).toBe(UNKNOWN_PROVIDER);
      expect(label).toBe('Security key or other');
      expect(label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    }
    // and a known one is not the fallback, so the assertions above are not satisfied by a constant function
    expect(providerOf('fbfc3007-154e-4ecc-8c0b-6e020557d7bd')).not.toBe(UNKNOWN_PROVIDER);
  });
});

describe('6.342 AAGUID lookup tolerates padding', () => {
  it('6.342 a padded, upper-case AAGUID is still "iCloud Keychain"; control: padding around an unknown one is still the fallback', () => {
    expect(providerOf(' FBFC3007-154E-4ECC-8C0B-6E020557D7BD ')).toBe('iCloud Keychain');
    expect(providerOf('\tfbfc3007-154e-4ecc-8c0b-6e020557d7bd\n')).toBe('iCloud Keychain');
    expect(providerOf('  12345678-1234-1234-1234-123456789abc ')).toBe(UNKNOWN_PROVIDER);
  });
});

