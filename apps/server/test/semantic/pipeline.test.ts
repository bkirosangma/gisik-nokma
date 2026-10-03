import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIM } from '../../src/search/embedding.js';
import { knnEdges } from '../../src/semantic/knn.js';
import { communities } from '../../src/semantic/louvain.js';
import { topTerms } from '../../src/semantic/terms.js';
import { changedByMoreThanHalf, itemHash, itemKey, signatureOf } from '../../src/semantic/signature.js';
import { meanUnit } from '../../src/semantic/vectors.js';
import { noteAudienceKey, ticketAudienceKey } from '../../src/semantic/partition.js';
import { suggestAll, suggestForPartition, type PipelineItem } from '../../src/semantic/pipeline.js';

/** Unit vectors in 4 dims, padded to `dim`, so cosines are exact and readable. */
function unit(dim: number, ...xs: number[]): Float32Array {
  const v = new Float32Array(dim);
  xs.forEach((x, i) => {
    v[i] = x;
  });
  const n = Math.hypot(...xs);
  for (let i = 0; i < dim; i += 1) v[i] = (v[i] ?? 0) / n;
  return v;
}
/** Two tight clusters: ids 0–3 near axis 0, ids 4–7 near axis 1. */
function twoClusters(dim = 8): Float32Array[] {
  return [
    unit(dim, 1, 0.05), unit(dim, 1, 0.1), unit(dim, 1, 0, 0.1), unit(dim, 1, 0.02, 0.05),
    unit(dim, 0.05, 1), unit(dim, 0.1, 1), unit(dim, 0, 1, 0.1), unit(dim, 0.02, 1, 0.05),
  ];
}
const item = (key: string, partition: string, vector: Float32Array, text: string): PipelineItem => ({ key, partition, vector, text });
const BASE = { k: 10, tau: 0.5, seed: 7, minSize: 3, maxSize: 12 };

describe('27.400 knnEdges', () => {
  it('keeps at most k neighbours at cosine ≥ τ, symmetric, each pair once; control: τ above a pair drops it', () => {
    const edges = knnEdges(twoClusters(), 10, 0.5);
    expect(edges.every((e) => e.a < e.b)).toBe(true);
    expect(edges.some((e) => e.a < 4 && e.b >= 4)).toBe(false); // no cross-cluster edge at τ = 0.5
    expect(edges.filter((e) => e.a < 4 && e.b < 4)).toHaveLength(6); // 4 choose 2
    // Symmetry: at k = 1, x0 and x1 choose each other; x2 = (1, −0.3) is nearer x0 than x1 is to it, so the
    // edge (0, 2) exists ONLY because the higher-index node chose it. Dropping `offer(j, i, …)` loses it.
    const three = [unit(2, 1, 0), unit(2, 1, 0.2), unit(2, 1, -0.3)];
    const capped = knnEdges(three, 1, 0.5);
    expect(capped.some((e) => e.a === 0 && e.b === 2)).toBe(true);
    expect(capped.some((e) => e.a === 1 && e.b === 2)).toBe(false); // at most k per chooser
    expect(knnEdges(twoClusters(), 10, 0.9999).length).toBeLessThan(edges.length); // control
  });
});

describe('27.401 communities', () => {
  it('splits two cliques and is identical for the same seed; control: one uniform 8-clique is one community', () => {
    const edges = knnEdges(twoClusters(), 10, 0.5);
    const first = communities(8, edges, 42);
    expect(communities(8, edges, 42)).toEqual(first);
    expect(new Set(first.slice(0, 4)).size).toBe(1);
    expect(new Set(first.slice(4)).size).toBe(1);
    expect(first[0]).not.toBe(first[4]);
    const clique: { a: number; b: number; weight: number }[] = [];
    for (let a = 0; a < 8; a += 1) for (let b = a + 1; b < 8; b += 1) clique.push({ a, b, weight: 1 });
    expect(new Set(communities(8, clique, 42)).size).toBe(1); // control: one uniform clique is one community
  });

  it('is stable for the same seed on a graph with many tied partitions (a ring), where the default Math.random would wander', () => {
    const ring = Array.from({ length: 60 }, (_unused, a) => ({ a: Math.min(a, (a + 1) % 60), b: Math.max(a, (a + 1) % 60), weight: 1 }));
    const first = communities(60, ring, 20261003);
    for (let run = 0; run < 8; run += 1) expect(communities(60, ring, 20261003)).toEqual(first);
    // Control: the ring really is seed-sensitive, so the loop above could fail.
    const others = new Set([1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(communities(60, ring, seed))));
    expect(others.size).toBeGreaterThan(1);
  });
});

describe('27.402 topTerms (class-based TF-IDF)', () => {
  it('ranks the words that distinguish a class first and drops stop words; control: a word shared by every class ranks below a distinctive one', () => {
    const classes = [
      ['drag the card to the column', 'the board column refuses the drag', 'board drag lag'],
      ['passkey sign in fails', 'the code for sign in expired', 'passkey on a new laptop'],
    ];
    const [board, signIn] = topTerms(classes, 3);
    expect(board).toEqual(expect.arrayContaining(['drag', 'board', 'column']));
    expect(signIn).toEqual(expect.arrayContaining(['passkey', 'sign']));
    expect(board).not.toContain('the');
    const shared = topTerms([['alpha ticket ticket'], ['beta ticket ticket']], 2);
    expect(shared[0]?.[0]).toBe('alpha'); // control
  });
});

describe('27.403 signatures and "changed by more than half"', () => {
  it('is order-free; more than half means Jaccard distance > 0.5; control: exactly half is not more than half', () => {
    const keys = ['ticket:B', 'ticket:A', 'note:C'];
    expect(signatureOf(keys)).toBe(signatureOf([...keys].reverse()));
    expect(itemHash('ticket:A')).toMatch(/^[0-9a-f]{32}$/);
    const before = ['a', 'b', 'c', 'd'].map(itemHash);
    expect(changedByMoreThanHalf(before, ['a', 'b', 'c', 'e'].map(itemHash))).toBe(false); // 3/5 shared
    expect(changedByMoreThanHalf(before, ['a', 'b', 'c', 'e', 'f'].map(itemHash))).toBe(false); // control: 3/6 shared, distance exactly 0.5
    expect(changedByMoreThanHalf(before, ['a', 'b', 'e', 'f'].map(itemHash))).toBe(true); // 2/6 shared, distance 0.67
    expect(itemKey('ticket', 'X')).toBe('ticket:X');
  });
});

describe('27.404 audience keys', () => {
  it('keys tickets by resolved audience and notes by scope; an explicit note counts its author; control: different project ⇒ different key', () => {
    expect(ticketAudienceKey({ resolvedMode: 'workspace', projectId: 'P', resolvedUserIds: [] })).toBe('w');
    expect(ticketAudienceKey({ resolvedMode: 'project', projectId: 'P', resolvedUserIds: [] })).toBe('p:P');
    expect(ticketAudienceKey({ resolvedMode: 'explicit', projectId: 'P', resolvedUserIds: ['u2', 'u1'] })).toBe('e:u1,u2');
    expect(noteAudienceKey({ scopeMode: 'explicit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: ['u2'], inheritedKeys: [] })).toBe('e:u1,u2');
    expect(noteAudienceKey({ scopeMode: 'private', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: [] })).toBe('a:u1');
    expect(noteAudienceKey({ scopeMode: 'inherit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: ['p:P', 'p:P'] })).toBe('p:P');
    expect(noteAudienceKey({ scopeMode: 'inherit', authorId: 'u1', homeProjectId: 'P', scopeUserIds: [], inheritedKeys: ['p:P', 'w'] })).toBe('i:p:P|w');
    expect(ticketAudienceKey({ resolvedMode: 'project', projectId: 'Q', resolvedUserIds: [] })).not.toBe('p:P'); // control
  });
});

describe('27.405 partitions never mix audiences (§7 case 5)', () => {
  it('two audiences with near-identical text give two suggestions, not one; control: the same items in ONE audience give one', () => {
    const vs = twoClusters().slice(0, 4);
    const mixed = [
      ...vs.map((v, i) => item(`ticket:W${i}`, 'w', v, 'drag card column')),
      ...vs.map((v, i) => item(`ticket:E${i}`, 'e:u1', v, 'drag card column')),
    ];
    const out = suggestAll(mixed, BASE);
    expect(out).toHaveLength(2);
    expect(out.every((s) => new Set(s.itemKeys.map((k) => k.slice(7, 8))).size === 1)).toBe(true);
    expect(() => suggestForPartition(mixed, BASE)).toThrow(/mixed audiences/);
    // suggestAll walks partitions in key order, whatever the input order, so a run is deterministic.
    expect(suggestAll(mixed, BASE).map((s) => s.partition)).toEqual(['e:u1', 'w']);
    expect(suggestAll([...mixed].reverse(), BASE).map((s) => s.partition)).toEqual(['e:u1', 'w']);
    const one = suggestAll(mixed.map((m) => ({ ...m, partition: 'w' })), { ...BASE, maxSize: 12 });
    expect(one).toHaveLength(1); // control
  });
});

describe('27.406 a rejected suggestion is skipped unless its set changed by more than half', () => {
  it('skips the same set; control: a set that changed by more than half comes back', () => {
    const items = twoClusters().slice(0, 4).map((v, i) => item(`ticket:T${i}`, 'w', v, 'drag card'));
    const [s] = suggestAll(items, BASE);
    expect(s).toBeDefined();
    expect(suggestAll(items, { ...BASE, rejected: [{ itemHashes: s!.itemHashes }] })).toHaveLength(0);
    const unrelated = ['x', 'y', 'z', 'q'].map(itemHash);
    expect(suggestAll(items, { ...BASE, rejected: [{ itemHashes: unrelated }] })).toHaveLength(1); // control
  });
});

describe('27.407 sizes 3–12, and a community already ≥ 50% in one concept is skipped', () => {
  it('drops a pair and a 13-set, skips a half-tagged set; control: one tagged item of four does not skip', () => {
    const four = twoClusters().slice(0, 4).map((v, i) => item(`ticket:T${i}`, 'w', v, 'drag card'));
    expect(suggestAll(four.slice(0, 2), BASE)).toHaveLength(0);
    expect(suggestAll(four, { ...BASE, maxSize: 3 })).toHaveLength(0);
    const half = new Map([['ticket:T0', ['C1']], ['ticket:T1', ['C1']]]);
    expect(suggestAll(four, { ...BASE, conceptsOf: (k) => half.get(k) ?? [] })).toHaveLength(0);
    const one = new Map([['ticket:T0', ['C1']]]);
    expect(suggestAll(four, { ...BASE, conceptsOf: (k) => one.get(k) ?? [] })).toHaveLength(1); // control
    expect(suggestAll(four, BASE)[0]?.label).toMatch(/·|^\w+$/);
    // A community of two beside a community of four is dropped by the size filter itself (not by the early return).
    const withPair = [
      ...four,
      item('ticket:P0', 'w', unit(8, 0, 0, 0, 0, 1, 0.02), 'sign in'),
      item('ticket:P1', 'w', unit(8, 0, 0, 0, 0, 1, 0.05), 'sign in'),
    ];
    const kept = suggestAll(withPair, BASE);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.itemKeys.every((k) => k.startsWith('ticket:T'))).toBe(true);
  });
});

// `meanUnit` is the item-vector step 1 (spec D §4.1); planner 2026-10-03 12:08 gave it 27.415 (27.416–27.419 stay spare).
describe('27.415 meanUnit: the mean of unit vectors, re-normalised', () => {
  it('averages then renormalises to unit length; control: opposite vectors (zero norm), no vectors and a wrong width all throw', () => {
    const axis = (index: number): Float32Array => {
      const v = new Float32Array(EMBEDDING_DIM);
      v[index] = 1;
      return v;
    };
    const mean = meanUnit([axis(0), axis(1)]);
    expect(mean[0]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(mean[1]).toBeCloseTo(Math.SQRT1_2, 6);
    expect(Math.hypot(...mean)).toBeCloseTo(1, 6);
    const single = meanUnit([axis(2)]);
    expect(single[2]).toBeCloseTo(1, 6);
    const negative = new Float32Array(EMBEDDING_DIM);
    negative[0] = -1;
    expect(() => meanUnit([axis(0), negative])).toThrow(/zero norm/);
    expect(() => meanUnit([])).toThrow(/no vectors/);
    expect(() => meanUnit([new Float32Array(8)])).toThrow(/dims/);
  });
});
