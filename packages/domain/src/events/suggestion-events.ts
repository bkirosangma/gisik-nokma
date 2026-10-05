import { z } from 'zod';

/**
 * Knowledge Graph spec D §3.1/§4.3: a member rejected a model suggestion. On the WORKSPACE stream, so it carries
 * hashes, never item ids (KG-D plan, decision G5): `itemHashes` lets the job measure "changed by more than half"
 * (§4.1 step 6) without telling every replica which items were grouped. Each hash is
 * `apps/server/src/semantic/signature.ts`'s `itemHash` (32 lowercase hex); the signature is its `signatureOf`.
 */
export const suggestionRejectedPayload = z
  .object({
    signature: z.string().regex(/^[0-9a-f]{64}$/),
    itemHashes: z.array(z.string().regex(/^[0-9a-f]{32}$/)).min(3).max(12),
  })
  .strict();
export type SuggestionRejectedPayload = z.infer<typeof suggestionRejectedPayload>;
