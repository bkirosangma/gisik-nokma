import { describe, expect, it } from 'vitest';
import type { NodeAttributes } from '../src/render/node-attributes.js';
import { cardShape, SIGMA_ATTACHMENT_GAP, type SigmaLabels } from '../src/render/sigma/card-box.js';
import { hasHead } from '../src/render/sigma/card-style.js';

// a stand-in for Sigma's measurement (7 px a character, the line box is the font size) and its default margin, 5
const measure: SigmaLabels = { measure: (label, size) => ({ width: 7 * label.length, height: size, textHeight: 0.8 * size }), margin: 5 };
const node = (over: Partial<NodeAttributes>): NodeAttributes => ({
  x: 0, y: 0, ref: 'ticket:t1', kind: 'ticket', fog: false, lv: 'chip', center: false, lbl: 'GN-160', sub: null, image: '', sug: false, cat: 'open', ...over,
});

describe('cardShape: the card Sigma draws, in px around the node (owner ruling B, spec §4.2 trap 10)', () => {
  it('27.354 a right-label chip, the centre card, a note and a compact chip mirror the backdrop program; no card at dot, fog or for a person at rest; only blocks and ref carry a head', () => {
    // chip: dot 4.5 + padding 7 = 11.5 (corner 9 < 11.5); the label box spans the centre to 4.5 + margin 5 + text 42 + padding 7
    expect(cardShape(node({}), measure)).toEqual({ nodeR: 11.5, nodeC: 11.5, boxX: 29.25, boxY: 0, boxW: 29.25, boxH: 13.25, boxC: 9 });
    // its subtitle (24 characters, an SVG 172 × 17) widens the box and adds 17 + the gap below the label
    const sub = 'Board column jumps afte…';
    expect(SIGMA_ATTACHMENT_GAP).toBe(2);
    expect(cardShape(node({ sub }), measure)).toEqual({ nodeR: 11.5, nodeC: 11.5, boxX: 94.25, boxY: 9.5, boxW: 94.25, boxH: 22.75, boxC: 9 });
    // the centre card: size 1, padding 10, corner 12 (> 11: the corner wins), its label OVER the node, centred
    expect(cardShape(node({ center: true, lv: 'card', lbl: 'GN-142', sub: 'Move sheet loses its scroll posit…' }), measure)).toEqual({
      nodeR: 12.01, nodeC: 12.01, boxX: 0, boxY: 9.5, boxW: 130.5, boxH: 27, boxC: 12,
    });
    // a note without an icon is a square: its padded node keeps the card's corner, not a disc
    expect(cardShape(node({ kind: 'note', lbl: 'Note' }), measure)).toMatchObject({ nodeR: 11.5, nodeC: 9 });
    // compact: padding 4, so 4.5 + 4 < corner 9 and the node part is the corner's disc
    expect(cardShape(node({ lv: 'compact' }), measure)).toMatchObject({ nodeR: 9.01, boxW: (4.5 + 5 + 42 + 4) / 2, boxH: 6.25 + 4 });
    // no label: the padded node alone
    expect(cardShape(node({ lbl: '' }), measure)).toEqual({ nodeR: 11.5, nodeC: 11.5, boxX: 0, boxY: 0, boxW: 0, boxH: 0, boxC: 9 });
    // no card: the arrow ends at the dot, as Sigma clamps it
    expect(cardShape(node({ lv: 'dot' }), measure)).toBeNull();
    expect(cardShape(node({ fog: true, lv: 'fog' }), measure)).toBeNull();
    expect(cardShape(node({ kind: 'person', lbl: 'Ama Rangsa' }), measure)).toBeNull();
    // the head: blocks and ref, never in fog; control: a parent edge (structure) and a relates edge have none
    expect([hasHead({ grp: 'blocks', fog: false }), hasHead({ grp: 'ref', fog: false })]).toEqual([true, true]);
    expect([hasHead({ grp: 'blocks', fog: true }), hasHead({ grp: 'structure', fog: false }), hasHead({ grp: 'relates', fog: false })]).toEqual([false, false, false]);
  });
});
