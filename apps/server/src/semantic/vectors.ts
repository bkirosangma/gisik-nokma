import { EMBEDDING_DIM } from '../search/embedding.js';

/**
 * The mean of unit vectors, re-normalised to unit length (spec D §4.1 step 1: an item's vector is the mean
 * of its chunk vectors; a ticket's comments are folded in the same way). `embedding.ts` does nothing eager
 * at import (`nudge.ts:16-18`), so importing the constant costs nothing.
 */
export function meanUnit(vectors: readonly Float32Array[]): Float32Array {
  if (vectors.length === 0) throw new Error('meanUnit of no vectors');
  const out = new Float32Array(EMBEDDING_DIM);
  for (const vector of vectors) {
    if (vector.length !== EMBEDDING_DIM) throw new Error(`vector of ${String(vector.length)} dims, expected ${String(EMBEDDING_DIM)}`);
    for (let index = 0; index < EMBEDDING_DIM; index += 1) out[index] = (out[index] ?? 0) + (vector[index] ?? 0);
  }
  let sum = 0;
  for (let index = 0; index < EMBEDDING_DIM; index += 1) sum += (out[index] ?? 0) ** 2;
  const norm = Math.sqrt(sum);
  if (!(norm > 0)) throw new Error('mean vector has zero norm');
  for (let index = 0; index < EMBEDDING_DIM; index += 1) out[index] = (out[index] ?? 0) / norm;
  return out;
}
