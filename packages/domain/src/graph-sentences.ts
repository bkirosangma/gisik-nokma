import type { GraphEdgeView } from './graph.js';
import { IST_TIME_ZONE } from './ist-day.js';

/*
 * The Knowledge Graph's edge sentences (spec C §2.1), one copy for the view, the server and the MCP tools (spec D §5.1
 * "items + edges + sentences"). Moved here from `packages/knowledge-graph/src/engine/sentences.ts` by KG-D Task 6
 * (decision G10): that package's index also exports React and Sigma code, which a server must not depend on. The
 * engine file is now a re-export, so the view draws exactly these sentences (27.505).
 */

/** `rel` (`knowledge-graph-sigma.html:566-578`), read from `fromRef`'s side. Assignee is person → ticket here (spec §2.1's example). */
export function relation(edge: GraphEdgeView, fromRef: string): string {
  const A = fromRef === edge.from;
  switch (edge.kind) {
    case 'parent': return A ? 'has subtask' : 'is a subtask of';
    case 'blocks': return A ? 'blocks' : 'is blocked by';
    case 'relates': return 'relates to';
    case 'duplicates': return A ? 'duplicates' : 'is duplicated by';
    case 'attached': return A ? 'is attached to' : 'has note';
    case 'ref': return A ? 'links to' : 'is linked from';
    case 'mention': return A ? 'mentions' : 'is mentioned in';
    case 'assignee': return A ? 'is the assignee of' : 'is assigned to';
    case 'tag': return A ? (edge.suggested ? 'may include' : 'includes') : edge.suggested ? 'may belong to' : 'belongs to';
    case 'in': return A ? 'contains' : 'is in';
  }
}

/** `edgeText` (`:753`): one sentence, read from the source, for the tooltip, the inspector and the list alike (§2.1). */
export function edgeSentence(edge: GraphEdgeView, labelOf: (ref: string) => string): string {
  return `${labelOf(edge.from)} ${relation(edge, edge.from)} ${labelOf(edge.to)}`;
}

const HOW: Record<GraphEdgeView['kind'], string> = {
  parent: "Set from the subtask's Parent field.",
  blocks: 'A typed link.', relates: 'A typed link.', duplicates: 'A typed link.',
  attached: 'The note is attached to the ticket.',
  ref: 'Comes from the text: edit the text to change it.',
  mention: 'An @mention in the text.',
  assignee: "From the ticket's Assignee field.",
  tag: 'Tagged with this concept.',
  in: 'Where the item lives.',
};
/** The `how` table in `edgeInsp` (`:989-991`). A suggested tag keeps the mockup's sentence; a confirmed one gets a plain one, because D owns its provenance. */
export function howText(edge: GraphEdgeView): string {
  if (edge.kind === 'tag' && edge.suggested) return 'Suggested by the model from how close the two are in meaning.';
  return HOW[edge.kind];
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST_TIME_ZONE });
export function formatGraphDate(iso: string): string {
  return DATE.format(new Date(iso));
}

/**
 * The assistant an `origin: 'mcp'` write is attributed to (spec D §5.2; KG-D T7, decision G3). The ledger records
 * `origin: 'mcp'` and the session's user, never which assistant, so it is one label: History's actor line reads
 * `Claude, for <name>` (`attributionLabel`, app-core) and an edge's provenance line `…, via Claude` (below).
 */
export const MCP_ASSISTANT_LABEL = 'Claude';

/** "Added by X on D, via Claude." (§3.5; the assistant is `MCP_ASSISTANT_LABEL`). Kinds whose table records no author or date (parent, assignee, in) have none. */
export function provenanceLine(edge: GraphEdgeView): string | null {
  if (edge.addedAt === null && edge.addedBy === null) return null;
  const who = edge.addedBy === null ? 'Added' : `Added by ${edge.addedBy}`;
  const when = edge.addedAt === null ? '' : ` on ${formatGraphDate(edge.addedAt)}`;
  return `${who}${when}${edge.origin === 'mcp' ? `, via ${MCP_ASSISTANT_LABEL}` : ''}.`;
}
