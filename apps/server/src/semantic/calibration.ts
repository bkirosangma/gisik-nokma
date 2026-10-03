import { suggestForPartition, type PipelineItem, type PipelineOptions, type Suggestion } from './pipeline.js';

/** τ from 0.30 to 0.80 in steps of 0.05, built from integers so 0.35 is 0.35. */
export const TAU_GRID: readonly number[] = Array.from({ length: 11 }, (_unused, index) => (30 + index * 5) / 100);
export type TauRow = { tau: number; suggestions: number; covered: number; purity: number };

export function purityOf(suggestions: readonly Suggestion[], labelOf: (key: string) => string): { purity: number; covered: number } {
  let dominant = 0;
  let covered = 0;
  for (const suggestion of suggestions) {
    const counts = new Map<string, number>();
    for (const key of suggestion.itemKeys) counts.set(labelOf(key), (counts.get(labelOf(key)) ?? 0) + 1);
    dominant += Math.max(...counts.values());
    covered += suggestion.itemKeys.length;
  }
  return { purity: covered === 0 ? 0 : dominant / covered, covered };
}

export function sweepTau(items: readonly PipelineItem[], labelOf: (key: string) => string, base: Omit<PipelineOptions, 'tau'>): TauRow[] {
  return TAU_GRID.map((tau) => {
    const suggestions = suggestForPartition(items, { ...base, tau });
    return { tau, suggestions: suggestions.length, ...purityOf(suggestions, labelOf) };
  });
}

/** The selection rule `constants.ts` documents. `null` = no τ meets the bars: STOP AND REPORT. */
export function selectTau(rows: readonly TauRow[], bars = { purity: 0.7, minSuggestions: 4 }): number | null {
  const passing = rows.filter((row) => row.purity >= bars.purity && row.suggestions >= bars.minSuggestions);
  return [...passing].sort((x, y) => y.covered - x.covered || y.tau - x.tau)[0]?.tau ?? null;
}

/** `similar()` top-5 precision: for each item, the share of its 5 nearest others with its label, averaged. */
export function precisionAt5(vectors: readonly Float32Array[], labels: readonly string[]): number {
  let total = 0;
  vectors.forEach((vector, i) => {
    const nearest = vectors
      .map((other, j) => ({ j, score: j === i ? -Infinity : vector.reduce((sum, value, d) => sum + value * (other[d] ?? 0), 0) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, 5);
    total += nearest.filter((entry) => labels[entry.j] === labels[i]).length / 5;
  });
  return total / vectors.length;
}
