/**
 * Drafts plan, Task 8: what the app does to a draft, shared by the Drafts list and the sheet. Publish is the client's
 * own two-part claim (decision 3: T5b's atomic route is online only and the app must publish offline too); discard
 * is one event. `DraftOutcome` is the one answer both hosts render.
 */
import { BACKLOG_STATE_ID, planTailRank, type IngestResult, type RankedRow, type SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSource } from '../data-source.js';
import { OfflineAcceptError, type LocalIngestResult } from '../replica/replica-data-source.js';
import type { MakeSubmitted } from '../submit.js';
import type { DraftRow } from '../view-types.js';
import { DRAFT_UNREACHED } from './drafts-copy.js';

export type DraftOutcome =
  | { status: 'committed' }
  | { status: 'queued' }
  | { status: 'refused'; rule: string; reason: string }
  | { status: 'unreachable'; message: string };

export type DiscardCounts = { subDrafts: number; attachments: number | null };

/** Every descendant of `rootId` among the caller's own drafts, breadth first. A repeat is skipped, so bad data cannot spin. */
export function subDraftsOf(drafts: readonly DraftRow[], rootId: string): DraftRow[] {
  const byParent = new Map<string, DraftRow[]>();
  for (const draft of drafts) {
    if (draft.parentId !== null) byParent.set(draft.parentId, [...(byParent.get(draft.parentId) ?? []), draft]);
  }
  const seen = new Set<string>([rootId]);
  const found: DraftRow[] = [];
  const queue = [rootId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const child of byParent.get(id) ?? []) {
      if (seen.has(child.ticketId)) continue;
      seen.add(child.ticketId);
      found.push(child);
      queue.push(child.ticketId);
    }
  }
  return found;
}

/** What a discard of `rootId` erases besides the draft: its sub-drafts, and the files uploaded to it and to them. `null` when any count is unknown. */
export function discardCounts(drafts: readonly DraftRow[], rootId: string): DiscardCounts {
  const root = drafts.find((d) => d.ticketId === rootId);
  const set = [...(root === undefined ? [] : [root]), ...subDraftsOf(drafts, rootId)];
  const counts = set.map((d) => d.attachmentCount);
  return {
    subDrafts: set.length - (root === undefined ? 0 : 1),
    attachments: counts.some((c) => c === null) ? null : counts.reduce<number>((sum, c) => sum + (c ?? 0), 0),
  };
}

/** The project's Backlog as this reader sees it: the rows `planTailRank` draws the new ticket after. Epics are included (T9 decision 8). */
export async function visibleBacklogRows(source: DataSource, projectId: string): Promise<RankedRow[]> {
  const list = await source.query.getTickets(projectId, {}, 'flat');
  return list.rows.filter((row) => row.stateId === BACKLOG_STATE_ID).map((row) => ({ ticketId: row.ticketId, rank: row.rank }));
}

/**
 * The events a single publish sends (decision 3): `ticket.published {projectId}`, then the `ticket.ranked` events of
 * `planTailRank` over the Backlog this reader sees, the backfill first and the draft's own tail rank last.
 */
export function publishEvents(
  make: MakeSubmitted,
  input: { workspaceId: string; draft: { ticketId: string; projectId: string }; backlog: readonly RankedRow[] },
): SubmittedEvent[] {
  const { workspaceId, draft } = input;
  const plan = planTailRank(input.backlog, [draft.ticketId]);
  return [
    make({ workspaceId, entity: { kind: 'ticket', id: draft.ticketId }, type: 'ticket.published', payload: { projectId: draft.projectId } }),
    ...[...plan.backfill, ...plan.tail].map((assignment) =>
      make({ workspaceId, entity: { kind: 'ticket', id: assignment.ticketId }, type: 'ticket.ranked', payload: { rank: assignment.rank } }),
    ),
  ];
}

type DraftInput = { workspaceId: string; ticketId: string; projectId: string };

const unreachable = (): DraftOutcome => ({ status: 'unreachable', message: DRAFT_UNREACHED });

/** The first event's answer decides: a later refused rank leaves a published ticket, which is a commit. */
function outcomeOf(first: IngestResult | LocalIngestResult | undefined): DraftOutcome {
  if (first === undefined) return unreachable();
  if (first.status === 'committed') return { status: 'committed' };
  if (first.status === 'refused') return { status: 'refused', rule: first.rule, reason: first.reason };
  if (first.status === 'invalid') return { status: 'refused', rule: first.code, reason: first.message };
  return { status: 'queued' };
}

async function submit(source: DataSource, events: SubmittedEvent[]): Promise<DraftOutcome> {
  try {
    return outcomeOf((await source.ingest(events))[0]);
  } catch (error) {
    if (error instanceof OfflineAcceptError) return outcomeOf(error.results[0]);
    return unreachable();
  }
}

/** Publish one draft from the app (online or queued offline). The Backlog read failing is `unreachable`: nothing was sent. */
export async function publishDraft(source: DataSource, make: MakeSubmitted, input: DraftInput): Promise<DraftOutcome> {
  let backlog: RankedRow[];
  try {
    backlog = await visibleBacklogRows(source, input.projectId);
  } catch {
    return unreachable();
  }
  return submit(source, publishEvents(make, { workspaceId: input.workspaceId, draft: input, backlog }));
}

/** Discard one draft: exactly one `ticket.discarded {}`; its sub-drafts go with it on the server (T5's erasure). */
export async function discardDraft(source: DataSource, make: MakeSubmitted, input: DraftInput): Promise<DraftOutcome> {
  return submit(source, [
    make({ workspaceId: input.workspaceId, entity: { kind: 'ticket', id: input.ticketId }, type: 'ticket.discarded', payload: {} }),
  ]);
}
