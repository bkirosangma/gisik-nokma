import type { PassRecord } from './entity-state.js';
import type { FlowNode, UnscheduledReason } from './flow/index.js';
import type { StateCategory } from './workflow.js';

/**
 * What the Timeline reads answer (Workflow and Timeline graphs, Part 4 T1): `readTimelineIndex / Chunk / Tray` and
 * `readHomeSummary` over a scope of workspaces, projects and Me | Everyone. Every answer is read for ONE viewer: a ticket
 * they cannot see is a hole, and no id of it appears anywhere in the answer except as a visible child's `parentId` (spec §6's
 * one disclosed parent id, as `TicketCard.parentId`). Days are IST days (`YYYY-MM-DD`).
 */

/** Spec §4 / PR-0 / §13. */
export const TIMELINE_INDEX_CAP = 10_000;
export const TIMELINE_FLOW_CAP = 300;
export const TIMELINE_CHUNK_DAYS = 28;
export const TIMELINE_PAGE_SIZE = 200;

/** `stub`: a never-started Not-taken ticket's close day (TG-10, D-W4-11). */
export type TimelineSegmentType = 'actual' | 'planned' | 'ghost' | 'stub';
/** Inclusive IST days (`YYYY-MM-DD`). `pass` is the ticket's round when the work or plan belongs to it. */
export type TimelineSegment = { start: string; end: string; pass: number; type: TimelineSegmentType };
/** D-W4-2: counts, not a boolean (TG-11's tooltip is "2 notes, 1 attachment"). */
export type TimelinePin = { notes: number; attachments: number };
/**
 * The index's wire name is `resolution` (spec :174, as Part 3's `FlowNodeRead.resolution`); the value is Part 2's
 * `NotTakenResolution` (`FlowNode.notTaken`) AS SERVED: when this viewer cannot see that Decision (FL-1) `decisionTicketId`
 * is `null` and the `outcome` key is ABSENT, a hidden Decision's outcome being its authored branch name (planner ruling
 * 2026-10-06 05:46; Part 3's `buildFlowRead` serves a hole the same way, 29.449). The kind and the pass stay. A raw close
 * cause is never served (`viewerSafeCause`'s rule): only this resolution, its Decision and outcome only to a viewer who sees it.
 */
export type TimelineResolution = { kind: 'not-taken'; decisionTicketId: string | null; outcome?: string; pass: number } | null;
export type TimelineUnscheduledReason = UnscheduledReason;

/** PR-0's index entry (+ `workspaceId`, needed once a scope spans workspaces). About 100 bytes plus 16 per segment. */
export type TimelineEntry = {
  id: string;
  workspaceId: string;
  /** `null` for a draft. */
  key: string | null;
  draft: boolean;
  kind: 'ticket' | 'decision';
  /** The project id: Home's lane. */
  lane: string;
  segments: TimelineSegment[];
  pin: TimelinePin;
  resolution: TimelineResolution;
  category: StateCategory;
  flowId: string | null;
};

/** Part 2's `FlowNode` as served: its `notTaken` is the served resolution (the Decision's id only when the viewer sees it). */
export type TimelineFlowNode = Omit<FlowNode, 'notTaken'> & { notTaken: TimelineResolution };
export type TimelineFlowEdge = { from: string; to: string; kind: 'leads_to' | 'blocks'; label: string | null };
/**
 * Plan inputs (Part 2's `FlowNode`, periods as instants) for EVERY visible member of an included flow, including members
 * `items` leaves out (Me, project scope). A flow over the cap is `truncated` with no `nodes`: the client refetches instead
 * of re-planning.
 */
export type TimelineFlow = {
  id: string;
  workspaceId: string;
  truncated: boolean;
  nodes: TimelineFlowNode[];
  edges: TimelineFlowEdge[];
};

export type TimelineDetail = {
  id: string;
  title: string;
  stateId: string;
  stateName: string;
  assigneeId: string | null;
  dueDate: string | null;
  basis: 'explicit' | 'chained' | null;
  startsBeforePredecessor: boolean;
  round: number;
  waitForAll: boolean;
  estimate: number | null;
  /** A Decision's own pass records; `null` for any other ticket. */
  passes: PassRecord[] | null;
};

export type TimelineTrayItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  key: string | null;
  title: string;
  draft: boolean;
  reason: TimelineUnscheduledReason;
  /** TG-6 / TG-12: set when a Decision's labelled outcome leads here. Only a Decision this viewer sees is ever named. */
  reachedBy: { decisionTicketId: string; decisionKey: string | null; decisionTitle: string; outcome: string } | null;
};

export type TimelineIndexResponse = {
  today: string;
  /** D-W4-23: per readable workspace, the stream head (`readStreamSeq`) read BEFORE the scope was loaded. The client applies only events with a larger `workspaceSeq`. */
  asOf: Record<string, number>;
  items: TimelineEntry[];
  flows: TimelineFlow[];
  tray: { count: number };
  /** The cut of PR-0: "Older work isn't drawn: N items before 3 Mar". */
  truncated: null | { dropped: number; before: string };
};
export type TimelineChunkResponse = { items: TimelineDetail[]; nextCursor: string | null };
export type TimelineTrayResponse = { items: TimelineTrayItem[]; nextCursor: string | null };

/** HM-2 (D-W4-8). `members` is null only when EVERY readable workspace withholds the roster (a guest). */
export type HomeSummaryResponse = {
  generatedAt: string;
  /** D-W4-23, as on the index. */
  asOf: Record<string, number>;
  workspaceIds: string[];
  dueSoonDays: Record<string, number>;
  counts: { tickets: number; open: number; pastDue: number; dueSoon: number; members: number | null; notes: number };
  ids: Record<'tickets' | 'open' | 'pastDue' | 'dueSoon' | 'members' | 'notes', string[]>;
};
