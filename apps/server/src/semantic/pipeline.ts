import { SUGGESTION_TERMS } from './constants.js';
import { communities } from './louvain.js';
import { knnEdges, type KnnEdge } from './knn.js';
import { changedByMoreThanHalf, itemHash, signatureOf } from './signature.js';
import { topTerms } from './terms.js';

export type PipelineItem = { key: string; partition: string; vector: Float32Array; text: string };
export type Suggestion = {
  partition: string;
  itemKeys: string[];
  signature: string;
  itemHashes: string[];
  terms: string[];
  /** The provisional label: the terms joined with " · " (spec D §4.1 step 5). */
  label: string;
  /** Mean cosine of the community's own kNN edges. */
  score: number;
};
export type PipelineOptions = {
  k: number;
  tau: number;
  seed: number;
  minSize: number;
  maxSize: number;
  /** The concept ids an item is tagged into (step 4's "already ≥ 50% tagged into one concept"). */
  conceptsOf?: (key: string) => readonly string[];
  rejected?: readonly { itemHashes: readonly string[] }[];
};

function mostlyInOneConcept(keys: readonly string[], conceptsOf: PipelineOptions['conceptsOf']): boolean {
  if (conceptsOf === undefined) return false;
  const counts = new Map<string, number>();
  for (const key of keys) for (const concept of conceptsOf(key)) counts.set(concept, (counts.get(concept) ?? 0) + 1);
  return [...counts.values()].some((count) => count * 2 >= keys.length);
}

function internalScore(members: readonly number[], edges: readonly KnnEdge[]): number {
  const inside = new Set(members);
  const weights = edges.filter((edge) => inside.has(edge.a) && inside.has(edge.b)).map((edge) => edge.weight);
  return weights.length === 0 ? 0 : weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
}

/**
 * Steps 3–6 for ONE audience partition. Throws on a mixed partition: clustering across audiences is the
 * D4 leak this spec exists to prevent, and a caller that grouped wrongly must fail loudly, not suggest.
 */
export function suggestForPartition(items: readonly PipelineItem[], options: PipelineOptions): Suggestion[] {
  const partition = items[0]?.partition;
  if (partition === undefined || items.length < options.minSize) return [];
  if (items.some((entry) => entry.partition !== partition)) throw new Error('suggestForPartition: mixed audiences');
  const edges = knnEdges(items.map((entry) => entry.vector), options.k, options.tau);
  const labels = communities(items.length, edges, options.seed);
  const groups = new Map<number, number[]>();
  labels.forEach((community, index) => groups.set(community, [...(groups.get(community) ?? []), index]));
  const classes = [...groups.values()];
  const terms = topTerms(classes.map((members) => members.map((index) => items[index]?.text ?? '')), SUGGESTION_TERMS);
  const out: Suggestion[] = [];
  classes.forEach((members, classIndex) => {
    if (members.length < options.minSize || members.length > options.maxSize) return;
    const keys = members.map((index) => items[index]?.key ?? '').sort();
    if (mostlyInOneConcept(keys, options.conceptsOf)) return;
    const hashes = keys.map(itemHash);
    if ((options.rejected ?? []).some((rejection) => !changedByMoreThanHalf(rejection.itemHashes, hashes))) return;
    const words = terms[classIndex] ?? [];
    out.push({ partition, itemKeys: keys, signature: signatureOf(keys), itemHashes: hashes, terms: words, label: words.join(' · '), score: internalScore(members, edges) });
  });
  return out.sort((x, y) => y.score - x.score || (x.signature < y.signature ? -1 : 1));
}

/** Every partition, in partition-key order, so a run is deterministic. */
export function suggestAll(items: readonly PipelineItem[], options: PipelineOptions): Suggestion[] {
  const byPartition = new Map<string, PipelineItem[]>();
  for (const entry of items) byPartition.set(entry.partition, [...(byPartition.get(entry.partition) ?? []), entry]);
  return [...byPartition.keys()].sort().flatMap((key) => suggestForPartition(byPartition.get(key) ?? [], options));
}
