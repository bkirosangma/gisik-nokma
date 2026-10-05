import type { CardShape, NodeAttributes } from '../node-attributes.js';
import { backdropCornerRadius, backdropPadding, backdropShown, LABEL_FONT, labelPosition, labelShown, labelSize, nodeShape, nodeSize, subShown, subSize } from './card-style.js';

export type LabelMetrics = { width: number; height: number; textHeight: number };
/**
 * What Sigma knows of its labels (`labelsOf`, program.ts): its own measurement, the glyph advances of the atlas it draws
 * with, and the gap between a node's edge and its label. Passed in, so this file stays free of Sigma (and of WebGL).
 */
export type SigmaLabels = { measure: (label: string, size: number, font: string) => LabelMetrics; margin: number };

/** sigma@4.0.0-beta.7's gap between a label and its attachment (`dist/factory-78f95825.esm.js:1559`); the package does not export it. */
export const SIGMA_ATTACHMENT_GAP = 2;
const REST = { isHovered: false, isSel: false };

/**
 * The card Sigma draws behind a node, in screen px around its centre (y down): the backdrop program's union of the padded
 * node shape and the padded label box (`dist/factory-78f95825.esm.js:2044`, vertex, and `:2047`, fragment;
 * `dist/sigma.esm.js:3279-3338` adds the attachment). Its outer contour is the border's outer edge (the border is drawn
 * inside it). Null when no card is drawn: the arrow then ends at the dot, as Sigma clamps it.
 * The REST state is the card: only a person's card depends on hover or selection, and no directed edge targets a person.
 */
export function cardShape(a: NodeAttributes, labels: SigmaLabels): CardShape | null {
  if (!backdropShown(a, REST)) return null;
  const r = nodeSize(a), pad = backdropPadding(a), corner = backdropCornerRadius(a);
  // `effectiveRadius = max(enlargedRadius - cornerRadius, 0.01)`, then the SDF grows by `cornerRadius` again
  const nodeR = Math.max(r + pad - corner, 0.01) + corner;
  const node = { nodeR, nodeC: nodeShape(a) === 'circle' ? nodeR : corner };
  if (!labelShown(a)) return { ...node, boxX: 0, boxY: 0, boxW: 0, boxH: 0, boxC: corner };
  const m = labels.measure(a.lbl, labelSize(a), LABEL_FONT);
  let w = m.width, h = m.height, offY = 0;
  if (subShown(a)) {
    const s = subSize(a.sub!); // placement 'below'
    h += s.height + SIGMA_ATTACHMENT_GAP;
    w = Math.max(w, s.width);
    offY = (s.height + SIGMA_ATTACHMENT_GAP) / 2;
  }
  const hy = h / 2 + pad;
  if (labelPosition(a) === 'over') return { ...node, boxX: 0, boxY: offY, boxW: w / 2 + pad, boxH: hy, boxC: corner };
  // 'right' (a 'below' label is a person's, whose card is off at rest: null above). The label starts at the node's edge plus
  // the margin; the box spans the node's centre to the text's end plus padding
  const right = r + labels.margin + w + pad;
  return { ...node, boxX: right / 2, boxY: offY, boxW: right / 2, boxH: hy, boxC: corner };
}
