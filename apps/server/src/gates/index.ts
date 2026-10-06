import { makeDecisionGates } from './decision-gates.js';
import { makeEvidenceGate } from './evidence-gate.js';
import { makeImageEmbedGates } from './image-embed-gate.js';
import type { ServerGate } from './server-gate.js';

/**
 * The production gate set, built once at the composition root and handed to
 * `createIngestService`. A gate that is not in this array does not run
 * anywhere, so the coverage of this function — which event types are gated at
 * all — is pinned by a test rather than left to review.
 */
export function buildServerGates(): ServerGate[] {
  return [...makeImageEmbedGates(), makeEvidenceGate(), ...makeDecisionGates()];
}

export * from './server-gate.js';
export * from './image-embed-gate.js';
export * from './evidence-gate.js';
export * from './decision-gates.js';
