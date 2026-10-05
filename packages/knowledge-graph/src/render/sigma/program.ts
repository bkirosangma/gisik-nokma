import Sigma, { DEFAULT_STYLES } from 'sigma';
import { DEFAULT_LABEL_MARGIN, extremityArrow, layerDashed, layerFill, sdfCircle, sdfSquare } from 'sigma/rendering';
import { layerImage } from '@sigma/node-image';
import type { MultiGraph } from 'graphology';
import type { Attributes } from 'graphology-types';
import type { GraphGroup } from '@gisik-nokma/domain';
import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
import type { PaletteRole, ThemePalette } from '../palette.js';
import type { LabelMetrics, SigmaLabels } from './card-box.js';
import { CARD_VARIABLES, pathToCard } from './card-path.js';
import {
  backdropCornerRadius, backdropPadding, backdropShown, hasHead, LABEL_FONT, labelPosition, labelShown, labelSize, nodeShape, nodeSize, subShown, subSize,
} from './card-style.js';

/** The custom per-item state `customNodeState` / `customEdgeState` declare below. */
export type NodeState = { isNb: boolean; isSel: boolean; isHl: boolean };
export type EdgeState = { isNb: boolean; isSel: boolean };
/** The adapter's handle type. Named here because tsc cannot spell the inferred one portably (TS2742, pnpm layout). */
export type KgSigma = Sigma<NodeAttributes, EdgeAttributes, Attributes, NodeState, EdgeState>;

/**
 * @sigma/node-image@4.0.0-alpha.3 builds the icon atlas (draw + GPU upload) `debounceTimeout` ms after the first image
 * loads, 500 by default. Measured (KG-C T1, M2 Pro): that landed ~230 ms into the first camera sweep and cost 2 frames of
 * 33-58 ms, failing spec §7's worst-frame bar on a cold start. A short debounce still coalesces the burst of loads but
 * builds the atlas while the view is opening, before the first camera move.
 */
export const ICON_ATLAS_DEBOUNCE_MS = 20;

export type ViewFlags = { nodeHovered: () => boolean; highlightOn: () => boolean };

/** Trap 2 (§4.2): a gap of 0 draws nothing, so a SOLID edge is dash 10000 / gap 0.2. */
export const SOLID: readonly [number, number] = [10000, 0.2];
export const DASH: Partial<Record<GraphGroup, readonly [number, number]>> = { relates: [7, 5], dup: [2, 5], ref: [1.5, 5] };
export const EDGE_ROLE: Record<GraphGroup, PaletteRole> = {
  projects: 'textSubtle', structure: 'edgeStructure', blocks: 'edgeBlocks', relates: 'edgeRelates', dup: 'edgeDuplicates',
  attached: 'edgeAttached', ref: 'edgeReference', people: 'edgePeople', concepts: 'edgeConcept',
};
const escapeXml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Trap 3: the card's second line is an SVG label attachment; ONE name per theme (`subL` / `subD`) because attachments are cached textures. */
function subLabel(palette: () => ThemePalette) {
  // sigma@4.0.0-beta.7 hands the renderer `Record<string, unknown>` attributes, not the graph's node type
  return (ctx: { attributes: Record<string, unknown> }) => {
    const attributes = ctx.attributes as unknown as NodeAttributes;
    const text = attributes.sub ?? '';
    const { width, height } = subSize(text);
    return {
      type: 'svg' as const,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text x="1" y="13" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="12.5" fill="${palette().textMuted}">${escapeXml(text)}</text></svg>`,
    };
  };
}

/**
 * Sigma's own label facts for `cardShape`: its measurement, the widths its SDF atlas draws (sigma@4.0.0-beta.7 keeps
 * `labelRenderer` private), and its label margin (no `primitives.nodes.label` is set here, so Sigma's default).
 */
export function labelsOf(sigma: KgSigma): SigmaLabels {
  const labels = (sigma as unknown as { labelRenderer: { measureNodeLabel(d: { label: string; labelSize: number; labelFont: string }): LabelMetrics } }).labelRenderer;
  return { measure: (label, labelSize, labelFont) => labels.measureNodeLabel({ label, labelSize, labelFont }), margin: DEFAULT_LABEL_MARGIN };
}

export function createSigma(
  graph: MultiGraph<NodeAttributes, EdgeAttributes>,
  container: HTMLElement,
  palette: () => ThemePalette,
  flags: ViewFlags,
): KgSigma {
  const P = palette;
  const sub = subLabel(palette);
  return new Sigma(graph, container, {
    primitives: {
      nodes: {
        variables: { image: { type: 'string', default: '' } }, // trap 4: icons are a declared node variable
        shapes: [sdfCircle(), sdfSquare()],
        layers: [layerFill(), layerImage({ drawingMode: 'image', textureManagerOptions: { size: { mode: 'force', value: 64 }, objectFit: 'contain', debounceTimeout: ICON_ATLAS_DEBOUNCE_MS } })],
        labelAttachments: { subL: sub, subD: sub },
      },
      edges: {
        variables: { dash: { type: 'number', default: 0 }, gap: { type: 'number', default: 0 }, ...CARD_VARIABLES },
        paths: [pathToCard()],
        extremities: [extremityArrow()],
        layers: [layerDashed({ dashSize: { attribute: 'dash', mode: 'pixels' }, gapSize: { attribute: 'gap', mode: 'pixels' }, gapColor: 0, align: 0, solidExtremities: true })],
      },
    },
    customNodeState: { isNb: false, isSel: false, isHl: false },
    customEdgeState: { isNb: false, isSel: false },
    styles: {
      nodes: [
        // sigma@4.0.0-beta.7 types DEFAULT_STYLES over bare `Attributes`, which beats the graph's node type in inference; `never` keeps the entry out of it
          DEFAULT_STYLES.nodes as never,
        {
          // the card's shape and size values live in card-style.ts: the arrowheads' end (card-box.ts) reads the same ones
          shape: nodeShape,
          size: nodeSize,
          color: (a: NodeAttributes) =>
            a.fog ? P().fogDot : a.image ? (a.kind === 'note' ? P().surfaceRaised : P().surfaceSunken) : a.kind === 'person' ? P().edgePeople
            : a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project' ? P().textSubtle : a.kind === 'concept' ? P().edgeConcept
            : a.cat === 'terminal' ? P().categoryTerminal : a.cat === 'active' ? P().categoryActive : P().categoryOpen,
          // trap 9: only an ITEM hover dims (our flag); an edge hover just thickens the edge
          opacity: (a: NodeAttributes, s: { isHovered: boolean; isNb: boolean; isHl: boolean }) =>
            a.fog ? 0.9 : flags.highlightOn() ? (s.isHl ? 1 : 0.25) : flags.nodeHovered() && !s.isHovered && !s.isNb ? 0.32 : 1,
          label: (a: NodeAttributes) => a.lbl,
          labelPosition,
          labelVisibility: (a: NodeAttributes) => (labelShown(a) ? 'visible' : 'hidden'),
          labelColor: () => P().text,
          labelSize,
          labelFont: LABEL_FONT,
          image: (a: NodeAttributes) => a.image || '',
          labelAttachment: (a: NodeAttributes) => (subShown(a) ? (P().dark ? 'subD' : 'subL') : null),
          labelAttachmentPlacement: 'below',
          backdropVisibility: (a: NodeAttributes, s: { isHovered: boolean; isSel: boolean }) => (backdropShown(a, s) ? 'visible' : 'hidden'),
          backdropArea: 'both',
          backdropPadding,
          backdropCornerRadius,
          backdropColor: (a: NodeAttributes) => (a.kind === 'concept' ? (a.sug ? P().conceptSoft : P().conceptFill) : a.kind === 'workspace' || a.kind === 'project' ? P().surfaceSunken : P().surfaceRaised),
          backdropBorderColor: (a: NodeAttributes, s: { isSel: boolean; isHl: boolean }) =>
            s.isSel || (s.isHl && flags.highlightOn()) || a.center ? P().text : a.kind === 'concept' ? P().edgeConcept : P().graphCardLine,
          backdropBorderWidth: (a: NodeAttributes, s: { isSel: boolean; isHl: boolean }) => (s.isSel ? 3 : s.isHl && flags.highlightOn() ? 2.5 : a.center ? 2 : 1),
          backdropShadowColor: () => P().shadow,
          backdropShadowBlur: (a: NodeAttributes) => (a.center ? 18 : 6),
          cursor: (a: NodeAttributes) => (a.fog ? 'default' : 'pointer'),
          zIndex: (a: NodeAttributes, s: { isSel: boolean }) => (s.isSel || a.center ? 3 : a.fog ? 0 : 1),
        },
      ],
      edges: [
        DEFAULT_STYLES.edges as never, // same cast as nodes above
        {
          color: (a: EdgeAttributes) => P()[EDGE_ROLE[a.grp]],
          dash: (a: EdgeAttributes) => (a.fog ? 2 : a.sug ? 3 : (DASH[a.grp] ?? SOLID)[0]),
          gap: (a: EdgeAttributes) => (a.fog ? 4 : a.sug ? 4 : (DASH[a.grp] ?? SOLID)[1]),
          size: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean }) =>
            s.isHovered || s.isSel ? 3.4 : a.on ? 3 : a.fog ? 1.2 : a.grp === 'blocks' || a.grp === 'ref' ? 2.2 : a.grp === 'people' ? 1.3 : a.grp === 'projects' ? 1.1 : 1.7,
          opacity: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean; isNb: boolean }) =>
            s.isHovered || s.isSel ? 1 : a.fog ? 0.22 : flags.highlightOn() ? 0.12 : flags.nodeHovered() ? (s.isNb ? 1 : 0.08) : a.grp === 'projects' ? 0.55 : a.on ? 1 : a.sug ? 0.6 : 0.45,
          head: (a: EdgeAttributes) => (hasHead(a) ? 'arrow' : 'none'),
          // owner ruling B: a head stops at its target's card border (card-path.ts); every other edge reads zeros and runs to the centre
          kgNodeR: (a: EdgeAttributes) => a.card?.nodeR ?? 0,
          kgNodeC: (a: EdgeAttributes) => a.card?.nodeC ?? 0,
          kgBoxX: (a: EdgeAttributes) => a.card?.boxX ?? 0,
          kgBoxY: (a: EdgeAttributes) => a.card?.boxY ?? 0,
          kgBoxW: (a: EdgeAttributes) => a.card?.boxW ?? 0,
          kgBoxH: (a: EdgeAttributes) => a.card?.boxH ?? 0,
          kgBoxC: (a: EdgeAttributes) => a.card?.boxC ?? 0,
          label: '',
          labelVisibility: 'hidden', // trap 11: Sigma draws edge labels rotated, so the sentence is a DOM tooltip
          cursor: (a: EdgeAttributes) => (a.fog ? 'default' : 'pointer'),
          zIndex: (a: EdgeAttributes, s: { isHovered: boolean; isSel: boolean }) => (s.isHovered || s.isSel || a.on ? 2 : 0),
        },
      ],
    },
    settings: {
      itemSizesReference: 'screen', // trap 5: sizes in screen pixels
      zoomToSizeRatioFunction: () => 1,
      autoRescale: false,
      enableEdgeEvents: true,
      nodeLabelEvents: 'extend', // trap 6: the label is clickable, not only the dot
      renderEdgeLabels: false,
      labelRenderedSizeThreshold: 0,
      labelDensity: 10,
      stagePadding: 0,
      zoomDuration: 250,
      doubleClickZoomingRatio: 2,
    },
  });
}
