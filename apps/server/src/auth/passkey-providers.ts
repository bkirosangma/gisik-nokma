/**
 * Devices plan Task 5 (case 6.324): the authenticator behind a passkey, named for a person. The passkey plugin stores the
 * AAGUID the authenticator reported at registration; most people cannot tell what a UUID is, so the list says "iCloud Keychain".
 * Anything not in the table - a hardware key, the all-zero AAGUID of an authenticator that hides itself, a missing value - is
 * "Security key or other", never the raw UUID. The table is short on purpose: a wrong label would be worse than a general one.
 */
const PROVIDERS: Record<string, string> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'iCloud Keychain',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'Google Password Manager',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'Windows Hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1Password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'Bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'Dashlane',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'Chrome on Mac',
};

export const UNKNOWN_PROVIDER = 'Security key or other';

export function providerOf(aaguid: string | null): string {
  return aaguid === null ? UNKNOWN_PROVIDER : (PROVIDERS[aaguid.trim().toLowerCase()] ?? UNKNOWN_PROVIDER);
}
