import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { domainRegistry, suggestionRejectedPayload } from '../src/index.js';

/**
 * Knowledge Graph spec D §4.3 (KG-D Task 5): the rejection's payload (case 27.486). Every hash here is shaped as the
 * server's `itemHash` makes it (`apps/server/src/semantic/signature.ts`: sha256 of the item key, the first 32 hex),
 * so the valid shape is the one the job writes and compares.
 */
const itemHash = (key: string): string => createHash('sha256').update(key).digest('hex').slice(0, 32);
const hashes = (n: number): string[] => Array.from({ length: n }, (_, index) => itemHash(`ticket:T${String(index)}`));
const signature = createHash('sha256').update('ticket:T0\nticket:T1\nticket:T2').digest('hex');

describe('27.486 the suggestion rejection payload', () => {
  it('27.486 { signature, itemHashes } parses; a 63-hex signature, 2 or 13 hashes and an extra member are refused; control: 3 and 12 parse', () => {
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes(1)[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(suggestionRejectedPayload.parse({ signature, itemHashes: hashes(4) })).toEqual({ signature, itemHashes: hashes(4) });
    // The controls: exactly the bounds parse.
    expect(suggestionRejectedPayload.safeParse({ signature, itemHashes: hashes(3) }).success).toBe(true);
    expect(suggestionRejectedPayload.safeParse({ signature, itemHashes: hashes(12) }).success).toBe(true);
    // One refused input per mutant.
    expect(suggestionRejectedPayload.safeParse({ signature: signature.slice(1), itemHashes: hashes(4) }).success).toBe(false);
    expect(suggestionRejectedPayload.safeParse({ signature, itemHashes: hashes(2) }).success).toBe(false);
    expect(suggestionRejectedPayload.safeParse({ signature, itemHashes: hashes(13) }).success).toBe(false);
    expect(suggestionRejectedPayload.safeParse({ signature, itemHashes: hashes(4), itemIds: ['T0', 'T1', 'T2', 'T3'] }).success).toBe(false);
  });

  it('27.486 registered once, at v1, against the workspace', () => {
    const registered = domainRegistry.registrations().filter((r) => r.type === 'workspace.concept_suggestion_rejected');
    expect(registered.map((r) => [r.version, r.entityKind])).toEqual([[1, 'workspace']]);
    expect(registered[0]?.payloadSchema).toBe(suggestionRejectedPayload);
  });
});
