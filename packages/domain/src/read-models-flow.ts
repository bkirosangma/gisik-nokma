import type { PassRecord } from './entity-state.js';
import type { UnscheduledReason } from './flow/index.js';
import type { StateCategory } from './workflow.js';

/**
 * What `GET /v1/workspaces/:ws/tickets/:id/flow` answers and `DataSource.query.getFlow` returns (Workflow and Timeline graphs,
 * Part 3). One flow, read for ONE viewer: a ticket they cannot see is a hole in it, with no count. Dates are IST days
 * (`YYYY-MM-DD`), never instants, so the graph and the timeline agree on which day a thing happened.
 */
export type FlowStateRead = { id: string; name: string; category: StateCategory };

/** PS-7: one of the Decision's OTHER forward labelled edges, for a ticket that sits on exactly one branch of it. */
export type FlowAlternateRead = { viaDecisionId: string; outcome: string; firstTicketId: string };

export type FlowNoteRead = { id: string; title: string };

export type FlowNodeRead = {
  id: string;
  /** `null` for a draft. */
  key: string | null;
  draft: boolean;
  title: string;
  kind: 'ticket' | 'decision';
  typeId: string;
  parentId: string | null;
  projectId: string;
  state: FlowStateRead;
  /** The name of the first state of the ticket's workflow: where a Backlog ticket goes when its predecessors close. */
  initialStateName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  waitForAll: boolean;
  estimate: number | null;
  reworkEstimate: number | null;
  /** 1 for a first run; 2 and up after a loop reopened it (PS-2). */
  round: number;
  /** A Decision's current outcome; `null` while pending or after a clear. */
  outcome: string | null;
  passes: PassRecord[];
  /**
   * PS-8: set when the ticket was closed "Not taken". `decisionTicketId` is `null` when that Decision is not in this read
   * (a hole for this viewer): the outcome and the pass stay, the id does not (FL-1). `outcome` is optional only because
   * `notTakenOf` reads a client's served withheld cause too, which has none (planner ruling 2026-10-06 05:46); this read
   * folds the server's raw causes, so it always names one. Whether a hole's outcome goes as well is PENDING
   * wtg-automoves-outcome-withhold (the same ruling, (c)).
   */
  resolution: { kind: 'not-taken'; decisionTicketId: string | null; outcome?: string; pass: number } | null;
  alternates: FlowAlternateRead[];
  periods: Array<{ start: string; end: string | null; pass: number }>;
  planned: Array<{ pass: number; start: string; end: string; basis: 'explicit' | 'chained'; pruned: boolean }>;
  actual: { start: string; end: string | null } | null;
  tray: UnscheduledReason | null;
  notes: FlowNoteRead[];
  pin: { notes: number; attachments: number };
};

export type FlowEdgeRead = {
  /** `source>target` for `leads_to`, `source~target` for `blocks`. */
  id: string;
  kind: 'leads_to' | 'blocks';
  from: string;
  to: string;
  label: string | null;
  /** FL-3's back edge. */
  loop: boolean;
  /** How many passes of the source Decision took this label (0 for any other edge). */
  taken: number;
  takenPasses: number[];
  /** `true` full weight, `false` drawn at 40% ("not chosen"), `null` when the source is not a settled Decision. */
  chosen: boolean | null;
};

export type FlowAutoMoveKind = 'led-to' | 'reopened-by-flow' | 'branch-not-taken';

/** One transition the flow actor filed (WG-3's "Automatic moves in this flow"). */
export type FlowAutoMoveRead = {
  ticketId: string;
  /** An instant: the inspector formats it. */
  at: string;
  kind: FlowAutoMoveKind;
  /** The ticket whose finishing or choice caused it; `null` when that ticket is not in this read. */
  becauseTicketId: string | null;
  pass: number | null;
  outcome: string | null;
};

export type FlowRead = {
  /** The smallest ticket id in the flow: stable while the flow keeps its members. */
  flowId: string;
  /** The ticket the sheet was opened from. */
  rootId: string;
  truncated: boolean;
  reached: number;
  start: string[];
  end: string[];
  /** FL-3 flow order. */
  order: string[];
  nodes: FlowNodeRead[];
  edges: FlowEdgeRead[];
  autoMoves: FlowAutoMoveRead[];
  /** The viewer's own drafts in this flow (CR-3). */
  draftCount: number;
};
