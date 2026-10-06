import type { HomeNumberKey } from '@gisik-nokma/domain';
import { HOME_NUMBERS } from './home-copy.js';

/**
 * The note under the numbers (spec E §2.3). `total` is the COUNT; `lit` how many of its ids are clear on the graph;
 * `further` is what the graph reports past its clear rings, `fog.size + beyond` (`GraphZonesSummary`; planner ruling
 * 2026-10-04 Q4), not `total − lit`: a capped count's uncapped remainder is not on the graph to be further out.
 * With none lit, the count further out is still said (kg-walk-fixes-2 item 3, case 27.688): on a phone the graph is one hop
 * from the workspace, so no ticket is ever clear, and the manual promises that items further out are counted in the note.
 * "None to light up." is only a true zero.
 */
export function highlightNote(a: { key: HomeNumberKey; total: number; lit: number; further: number; dueSoonDays: number }): { text: string; further: number } {
  const spec = HOME_NUMBERS.find((n) => n.key === a.key);
  if (spec === undefined || a.total === 0) return { text: '', further: 0 };
  if (a.lit === 0) {
    const text = a.further > 0 ? `None to light up here; ${a.further} ${a.further === 1 ? 'is' : 'are'} further out than the graph shows.` : 'None to light up.';
    return { text, further: a.further };
  }
  const head = `${a.lit} ${spec.noun(a.lit, a.dueSoonDays)}, lit up on the graph.`;
  return { text: a.further > 0 ? `${head} ${a.further} more are further out.` : head, further: a.further };
}
