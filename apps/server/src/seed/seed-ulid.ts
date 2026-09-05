import { createHash } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A deterministic, ULID-shaped id for seed events and seed entities.
 * Re-running a seed regenerates identical ids, so the ledger's
 * duplicate-event-id refusal makes re-runs no-ops — idempotence by
 * construction, not by bookkeeping. The leading '0' keeps the timestamp
 * field small and the string ULID_REGEX-valid.
 */
export function seedUlid(namespace: string, key: string): string {
  const digest = createHash('sha256').update(`${namespace} ${key}`).digest();
  let out = '0';
  for (let i = 0; i < 25; i += 1) {
    // sha256 digests are always 32 bytes and i < 25, so digest[i] is always
    // defined; CROCKFORD has exactly 32 characters and the index is reduced
    // mod 32, so the lookup is always in range. Both non-null assertions are
    // load-bearing on those two invariants, not escape hatches.
    const byte = digest[i]!;
    out += CROCKFORD[byte % 32]!;
  }
  return out;
}
