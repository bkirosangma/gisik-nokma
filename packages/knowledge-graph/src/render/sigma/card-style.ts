import type { EdgeAttributes, Level, NodeAttributes } from '../node-attributes.js';

/*
 * The style values a node's card is drawn with. `program.ts`'s Sigma styles call these, and so does `cardShape`
 * (card-box.ts), which places each arrowhead on the card's border (owner ruling B, 2026-10-05): one source, no copied constants.
 */

export const big = (lv: Level | 'fog') => lv === 'card' || lv === 'cardS';
export const mid = (lv: Level | 'fog') => lv === 'chip' || lv === 'tap';
type ItemState = { isHovered: boolean; isSel: boolean };

export const nodeShape = (a: NodeAttributes): 'square' | 'circle' => ((a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project') && !a.fog && !a.image ? 'square' : 'circle');
/** Trap 10: the centre card is size 1, its label OVER it; the arrows into it end at its card border instead (owner ruling B). */
export const nodeSize = (a: NodeAttributes): number =>
  a.center && a.kind !== 'person' ? 1 : a.fog ? 3 : a.kind === 'person' ? (a.lv === 'dot' ? 5 : big(a.lv) || mid(a.lv) ? 16 : 12)
  : a.lv === 'dot' ? 3.5 : a.image ? (big(a.lv) || mid(a.lv) ? 9.5 : 8) : a.kind === 'workspace' ? 7 : big(a.lv) ? 5.5 : 4.5;
export const labelPosition = (a: NodeAttributes): 'below' | 'over' | 'right' => (a.kind === 'person' ? 'below' : a.center ? 'over' : 'right');
export const labelShown = (a: NodeAttributes): boolean => !!a.lbl;
export const labelSize = (a: NodeAttributes): number => (a.center ? 15 : 12.5);
export const LABEL_FONT = '-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,sans-serif';
export const subShown = (a: NodeAttributes): boolean => !!a.sub;
/** Trap 3: the card's second line, an SVG label attachment of this size (px). */
export const subSize = (text: string) => ({ width: Math.ceil(text.length * 6.9) + 6, height: 17 });
export const backdropShown = (a: NodeAttributes, s: ItemState): boolean => !a.fog && a.lv !== 'dot' && (a.kind !== 'person' || s.isHovered || s.isSel);
// 'tap' is 10, not the mockup's 7 (`:791`): 12.5 px text + 2 × 7 = 26.5 px, under spec §5's 32 px target; + 2 × 10 = 32.5
export const backdropPadding = (a: NodeAttributes): number => (big(a.lv) || a.lv === 'tap' ? 10 : a.lv === 'compact' ? 4 : 7);
export const backdropCornerRadius = (a: NodeAttributes): number => (a.kind === 'concept' ? 16 : big(a.lv) ? 12 : 9);
/** Directed edges (blocks, ref) carry an arrowhead; fog edges never do. */
export const hasHead = (a: Pick<EdgeAttributes, 'fog' | 'grp'>): boolean => !a.fog && (a.grp === 'blocks' || a.grp === 'ref');
