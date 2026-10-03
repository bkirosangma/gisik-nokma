import Sigma, { DEFAULT_STYLES } from 'sigma';
import { extremityArrow, layerDashed, layerFill, pathLine, sdfCircle, sdfSquare } from 'sigma/rendering';
import { layerImage } from '@sigma/node-image';
import type { MultiGraph } from 'graphology';
import type { Attributes } from 'graphology-types';
import type { GraphGroup } from '@gisik-nokma/domain';
import type { EdgeAttributes, Level, NodeAttributes } from '../node-attributes.js';
import type { PaletteRole, ThemePalette } from '../palette.js';

/** The custom per-item state `customNodeState` / `customEdgeState` declare below. */
export type NodeState = { isNb: boolean; isSel: boolean; isHl: boolean };
export type EdgeState = { isNb: boolean; isSel: boolean };
/** The adapter's handle type. Named here because tsc cannot spell the inferred one portably (TS2742, pnpm layout). */
export type KgSigma = Sigma<NodeAttributes, EdgeAttributes, Attributes, NodeState, EdgeState>;

export type ViewFlags = { nodeHovered: () => boolean; highlightOn: () => boolean };

const big = (lv: Level | 'fog') => lv === 'card' || lv === 'cardS';
const mid = (lv: Level | 'fog') => lv === 'chip' || lv === 'tap';
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
    const width = Math.ceil(text.length * 6.9) + 6;
    return {
      type: 'svg' as const,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="17"><text x="1" y="13" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="12.5" fill="${palette().textMuted}">${escapeXml(text)}</text></svg>`,
    };
  };
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
        layers: [layerFill(), layerImage({ drawingMode: 'image', textureManagerOptions: { size: { mode: 'force', value: 64 }, objectFit: 'contain' } })],
        labelAttachments: { subL: sub, subD: sub },
      },
      edges: {
        variables: { dash: { type: 'number', default: 0 }, gap: { type: 'number', default: 0 } },
        paths: [pathLine()],
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
          shape: (a: NodeAttributes) => ((a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project') && !a.fog && !a.image ? 'square' : 'circle'),
          // trap 10: the centre card is size 1, label OVER it, so arrows into it stay visible
          size: (a: NodeAttributes) =>
            a.center && a.kind !== 'person' ? 1 : a.fog ? 3 : a.kind === 'person' ? (a.lv === 'dot' ? 5 : big(a.lv) || mid(a.lv) ? 16 : 12)
            : a.lv === 'dot' ? 3.5 : a.image ? (big(a.lv) || mid(a.lv) ? 9.5 : 8) : a.kind === 'workspace' ? 7 : big(a.lv) ? 5.5 : 4.5,
          color: (a: NodeAttributes) =>
            a.fog ? P().fogDot : a.image ? (a.kind === 'note' ? P().surfaceRaised : P().surfaceSunken) : a.kind === 'person' ? P().edgePeople
            : a.kind === 'note' || a.kind === 'workspace' || a.kind === 'project' ? P().textSubtle : a.kind === 'concept' ? P().edgeConcept
            : a.cat === 'terminal' ? P().categoryTerminal : a.cat === 'active' ? P().categoryActive : P().categoryOpen,
          // trap 9: only an ITEM hover dims (our flag); an edge hover just thickens the edge
          opacity: (a: NodeAttributes, s: { isHovered: boolean; isNb: boolean; isHl: boolean }) =>
            a.fog ? 0.9 : flags.highlightOn() ? (s.isHl ? 1 : 0.25) : flags.nodeHovered() && !s.isHovered && !s.isNb ? 0.32 : 1,
          label: (a: NodeAttributes) => a.lbl,
          labelPosition: (a: NodeAttributes) => (a.kind === 'person' ? 'below' : a.center ? 'over' : 'right'),
          labelVisibility: (a: NodeAttributes) => (a.lbl ? 'visible' : 'hidden'),
          labelColor: () => P().text,
          labelSize: (a: NodeAttributes) => (a.center ? 15 : 12.5),
          labelFont: '-apple-system,BlinkMacSystemFont,"SF Pro Text",Helvetica,sans-serif',
          image: (a: NodeAttributes) => a.image || '',
          labelAttachment: (a: NodeAttributes) => (a.sub ? (P().dark ? 'subD' : 'subL') : null),
          labelAttachmentPlacement: 'below',
          backdropVisibility: (a: NodeAttributes, s: { isHovered: boolean; isSel: boolean }) => (!a.fog && a.lv !== 'dot' && (a.kind !== 'person' || s.isHovered || s.isSel) ? 'visible' : 'hidden'),
          backdropArea: 'both',
          // 'tap' is 10, not the mockup's 7 (`:791`): 12.5 px text + 2 × 7 = 26.5 px, under spec §5's 32 px target; + 2 × 10 = 32.5
          backdropPadding: (a: NodeAttributes) => (big(a.lv) || a.lv === 'tap' ? 10 : a.lv === 'compact' ? 4 : 7),
          backdropCornerRadius: (a: NodeAttributes) => (a.kind === 'concept' ? 16 : big(a.lv) ? 12 : 9),
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
          head: (a: EdgeAttributes) => (!a.fog && (a.grp === 'blocks' || a.grp === 'ref') ? 'arrow' : 'none'),
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
