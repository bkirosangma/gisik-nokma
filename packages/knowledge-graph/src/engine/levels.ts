import type { GraphItemView } from '@gisik-nokma/domain';
import type { Level } from '../render/node-attributes.js';
import type { RingConfig } from './layout.js';

const big = (lv: Level | 'fog') => lv === 'card' || lv === 'cardS';
const mid = (lv: Level | 'fog') => lv === 'chip' || lv === 'tap';

/** The mockup's `trunc` (`knowledge-graph-sigma.html:562`), by CODE POINT so an emoji is never split (Review Focus 4). */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : text;
}

/** `lvOf` (`render`, `:922`). */
export function levelOf(cfg: RingConfig, dist: number, fog: boolean): Level | 'fog' {
  return fog ? 'fog' : cfg.levels[Math.min(dist, cfg.levels.length - 1)]!;
}

const firstName = (name: string) => name.split(' ')[0] ?? name;

/** `nodeLabel` (`:760-765`). */
export function nodeLabel(item: GraphItemView, lv: Level | 'fog', phone: boolean): string {
  if (lv === 'dot' || lv === 'fog') return '';
  switch (item.kind) {
    case 'ticket': return item.label;
    case 'note': return big(lv) || (mid(lv) && !phone) ? 'Note' : truncate(item.title ?? item.label, 12);
    case 'person': return lv === 'compact' || phone ? firstName(item.label) : item.label;
    case 'concept': return truncate(item.label, phone ? 14 : mid(lv) || big(lv) ? 28 : 14);
    default: return truncate(item.label, 20);
  }
}

/** `nodeSub` (`:766-770`). Workspace and project counts are not on the wire in C (spec gap 10), so they have no second line. */
export function nodeSub(item: GraphItemView, lv: Level | 'fog', phone: boolean): string | null {
  if (!(big(lv) || (mid(lv) && !phone))) return null;
  if (item.kind === 'ticket' || item.kind === 'note') return truncate(item.title ?? '', phone ? 22 : mid(lv) ? 24 : 34);
  return null;
}
