import type { PassRecord } from '../entity-state.js';
import type { StateCategory } from '../workflow.js';
import type { NotTakenResolution, WorkPeriod } from './derive.js';

/** One `leads_to` link as the flow code sees it: source -> target, with the outcome label when the link has one. */
export type FlowEdge = { sourceId: string; targetId: string; label: string | null };

/** The key a back edge is recorded under: one ordered pair (a `leads_to` is unique per ordered pair). */
export function edgeKey(e: Pick<FlowEdge, 'sourceId' | 'targetId'>): string {
  return `${e.sourceId}>${e.targetId}`;
}

/**
 * THE single input node shape of every flow function (analysis, planner, promotion, settle).
 * Built from a `TicketState` by `flowNodeOf` (node.ts) and by nothing else, so the server read,
 * the replica and the tests cannot disagree about what "started" or "estimate" means.
 */
export type FlowNode = {
  id: string;
  typeId: string;
  stateId: string;
  category: StateCategory;
  closed: boolean;
  trashed: boolean;
  draft: boolean;
  parentId: string | null;
  isDecision: boolean;
  outcome: string | null;
  passes: PassRecord[];
  notTaken: NotTakenResolution | null;
  waitForAll: boolean;
  started: boolean;
  rounds: number;
  periods: WorkPeriod[];
  explicitStart: string | null;
  /** IST day, YYYY-MM-DD. */
  explicitDue: string | null;
  estimate: number | null;
  reworkEstimate: number | null;
  initialStateId: string;
  firstTerminalStateId: string | null;
};

export type FlowAnalysis = {
  /** Nodes with no incoming `leads_to`, ascending id. A node in a pure loop is in neither list. */
  starts: string[];
  /** Nodes with no outgoing `leads_to`, ascending id. */
  ends: string[];
  /** `edgeKey`s of the loop-closing edges (FL-3). */
  backEdges: ReadonlySet<string>;
  /** Kahn order over the edges without back edges; ties by (explicit sort day, id). */
  order: string[];
};
