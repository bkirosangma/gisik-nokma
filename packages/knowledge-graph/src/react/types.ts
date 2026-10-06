import type { GraphEdgeView, GraphGroup, GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';
import type { RingConfigName } from '../engine/layout.js';
import type { CreateRenderer } from '../render/renderer.js';

export type HopChoice = 1 | 2 | 3 | 4 | 'all';
export type GraphRingQuery = { center: string; hops: number; workspaceIds: readonly string[]; projectIds: readonly string[]; groups: readonly GraphGroup[] };
/** The data door. The web passes app-core's gateway (Task 9); the harness passes the fixture. Every answer carries its `center` (planner ruling Q1). */
export type GraphSource = { ring(q: GraphRingQuery): Promise<GraphRingResponse> };
export type ScopeChoices = { workspaces: readonly { id: string; name: string; projects: readonly { id: string; name: string }[] }[] };
/** What Home counts from ("N more are further out"). */
export type GraphZonesSummary = { clear: ReadonlySet<string>; fog: ReadonlySet<string>; beyond: number; clearHop: number; capped: boolean };
export type KnowledgeGraphProps = {
  /** `kind:id`, built with `kgNodeId` (`@gisik-nokma/knowledge-graph/ids`). A new value resets the trail. */
  centre: string;
  /** Ring radii and levels: `CFG.desktop` / `CFG.phone` / `CFG.home` (`knowledge-graph-sigma.html:602-606`). The host decides (web: `useIsPhone`). */
  config: RingConfigName;
  source: GraphSource;
  scope: ScopeChoices;
  /** Default: the current workspace (§3.5). */
  defaultWorkspaceIds: readonly string[];
  /** The chips offered, in display order. Default: every group but `projects` (the mockup offers Projects only on a workspace centre, `:555`, `:712`). */
  groups?: readonly GraphGroup[];
  /** Controlled hops (Home). Uncontrolled default: 2 on desktop/home; a phone is always 1 (§5). */
  hops?: HopChoice;
  onHopsChange?: (hops: HopChoice) => void;
  /** Home's stat highlight: lit 100%, the rest items 25% / edges 12%; WINS over hover dimming. */
  highlight?: ReadonlySet<string> | null;
  onZones?: (zones: GraphZonesSummary) => void;
  /** The host gets Esc first: return true to consume it (Home clears its highlight); otherwise the view does Back. An Esc consumed either way is `preventDefault`ed, so a ui `Sheet` around the view stays open. */
  onEscape?: () => boolean;
  onOpen: (item: GraphItemView) => void;
  /** Kinds the host has no page for get no Open button (a control that cannot be honoured is refused, `ticket-sheet.tsx:340-348`). Default: all. */
  canOpen?: (item: GraphItemView) => boolean;
  /** Spec A's "Add link" for an empty ticket centre (§6.2). Absent = no button. */
  onAddLink?: (centre: GraphItemView) => void;
  /**
   * Spec A's "Remove link" on a typed link (blocks, relates, duplicates), in the edge inspector: the host submits A's
   * `ticket.link_removed` and resolves with its `undo`, or throws the server's refusal (shown as is). Absent = no button.
   */
  onRemoveLink?: (edge: GraphEdgeView) => Promise<{ undo: () => Promise<void> }>;
  /** A typed link this viewer may not remove gets no button (A §2.3). Default: all. */
  canRemoveLink?: (edge: GraphEdgeView) => boolean;
  /** Hide the bar's Hops control (Home draws its own). */
  showHops?: boolean;
  /**
   * The "Linked to" list scrolls in its own bounded box (Home: a page has no sheet body to scroll it in, so 444 rows made a
   * 25,075 px page, release walk row 8). Default: the list takes its full height, inside the host's scroller (the sheet).
   */
  listBox?: boolean;
  /** Tests and the harness inject a renderer; default = the Sigma adapter, loaded with `import()`. */
  createRenderer?: () => Promise<CreateRenderer>;
};
