import { PRIORITIES } from '@gisik-nokma/domain';
import { actorLabel } from '../provenance.js';
import type { Grouping, ListColumnId, ListRow } from '../view-types.js';

export type ListSection = { key: string; label: string; rows: ListRow[] };
export type ListRowNode = { row: ListRow; depth: number; hasChildren: boolean };
export type GroupLabels = { epicTitle(epicId: string): string; typeName(typeId: string): string };

/**
 * ## WHICH SIDE OWNS GROUPING, and the one fact that makes this side the right one
 *
 * **The client owns it, and only because `TicketListView` is the COMPLETE row
 * set.** `getTickets` answers `{projectId, rows}` — no cursor, no page — so
 * `groupRows` partitions everything there is and a section's membership is a
 * statement about the project.
 *
 * The shipped route is NOT that. `apps/server/src/routes/list.ts` answers
 * `{projectId, groupBy, groups:[{key,label,cards}], nextCursor}` and applies its
 * grouping PER PAGE. A client that regroups a server-grouped page regroups ONE
 * PAGE and labels the result with the project's name: "Doing (3)" when the
 * project holds forty, with nothing on screen saying it is a page. That is the
 * grouping-as-filter lie wearing a pagination costume, and it is worse than the
 * plain one because the number looks authoritative.
 *
 * The two cannot both own it, so this module states the choice rather than
 * inheriting it: **the online source asks for `grouping: 'flat'`** (see
 * `useTicketList`), the server does no grouping, and every section below is cut
 * from a complete set. `test/views/list-model.test.ts` carries a TYPE tripwire
 * on `keyof TicketListView`: the day that view type grows a cursor — the day
 * the complete-set premise stops holding — `typecheck` fails and this decision
 * has to be retaken rather than silently inverted.
 */

/**
 * Counts always derive from the FLAT row set — sections can never change them,
 * and neither can a collapsed subtree. A summary computed from what is on
 * screen is a count of the user's scroll position. A row closed Not taken by the
 * flow (`notTaken`) sits in a terminal state but is closed, never done (wtg2 T17).
 */
export function countRows(rows: ListRow[]): { total: number; terminal: number } {
  return {
    total: rows.length,
    terminal: rows.filter((row) => row.stateCategory === 'terminal' && row.notTaken !== true).length,
  };
}

/**
 * The pinned section's source: my assignments, newest claim first.
 *
 * This is an ADDITIONAL SURFACE, not a grouping. The rows it names are also
 * rendered in their sections below, so "every row exactly once" is a property
 * of the SECTIONS (`groupRows(...).flatMap(section => section.rows)`), never of
 * the document. A test that counts occurrences page-wide measures the pin, not
 * the invariant.
 *
 * `assignedProvenance === null` with an assignee set is the honest gap
 * `view-types.ts` encodes deliberately (the projection holds no provenance
 * beside `assignee_id`): such a row is not pinned, because "recently" is a
 * claim about a moment and this row carries no moment. It is NOT dropped from
 * the list — only from the pin.
 */
export function recentlyAssignedRows(rows: ListRow[], currentUserId: string): ListRow[] {
  return rows
    .filter((row) => row.assignee?.id === currentUserId && row.assignedProvenance !== null)
    .sort((first, second) => {
      // `serverTime` and not `clientTime`: a claimed clock hours out would
      // reorder the pin against the record. Equal instants compare 0 rather
      // than -1, so ties keep input order (Array#sort is stable since ES2019)
      // instead of being swapped by a comparator that never says "equal".
      const firstTime = first.assignedProvenance?.serverTime ?? '';
      const secondTime = second.assignedProvenance?.serverTime ?? '';
      if (firstTime === secondTime) return 0;
      return firstTime < secondTime ? 1 : -1;
    });
}

/**
 * Pure partition: every row lands in exactly one section, so re-flattening the
 * sections reproduces the input set — the property the planted-defect test
 * holds against every grouping. Absence gets an honest bucket ("No epic",
 * "Unassigned"), never a vanished row.
 *
 * ADAPTATION (compile, not taste): the plan reads `grouping` inside the
 * closure after an early `=== 'flat'` return. TypeScript does not carry that
 * narrowing into a closure over a parameter, so the switch is non-exhaustive,
 * the arrow can fall through to `undefined`, and the file does not compile
 * under `strict`. Narrowing into a `const` before the closure is what makes
 * the switch exhaustive — the same cases, one binding earlier. (`priority`
 * joined the switch in Task 5 of the 2026-09-22 priority plan, which is why the
 * count in this sentence is no longer four; the shape is unchanged.)
 */
export function groupRows(rows: ListRow[], grouping: Grouping, labels: GroupLabels): ListSection[] {
  if (grouping === 'flat') return [{ key: 'all', label: 'All tickets', rows: [...rows] }];
  const axis: Exclude<Grouping, 'flat'> = grouping;
  const keyAndLabel = (row: ListRow): [string, string] => {
    switch (axis) {
      case 'epic':
        return row.epicId === null
          ? ['epic:none', 'No epic']
          : [`epic:${row.epicId}`, labels.epicTitle(row.epicId)];
      case 'status':
        return [`status:${row.stateId}`, row.stateName];
      case 'assignee':
        return row.assignee === null
          ? ['assignee:none', 'Unassigned']
          : [`assignee:${row.assignee.id}`, actorLabel(row.assignee.id, row.assignee.name)];
      case 'type':
        return [`type:${row.typeId}`, labels.typeName(row.typeId)];
      case 'priority':
        // The label is the level itself (spec 2026-09-22): there is no name to
        // resolve, and `GroupLabels` carries none for it — the ladder is three
        // closed tokens, not a roster this view could be handed a name from.
        return [`priority:${row.priority.value}`, row.priority.value];
    }
  };
  const sections = new Map<string, ListSection>();
  for (const row of rows) {
    const [key, label] = keyAndLabel(row);
    const section = sections.get(key) ?? { key, label, rows: [] };
    section.rows.push(row);
    sections.set(key, section);
  }
  if (axis === 'priority') {
    // THE LADDER'S order, not encounter order (spec 2026-09-22). `sections` is
    // built by WALKING the rows, so its insertion order is the order the levels
    // happen to be met in the input — a page whose P2 rows come first would
    // answer P2, P1, P3. `PRIORITIES` is imported rather than re-typed here for
    // the one-origin rule the ladder is under.
    //
    // `flatMap` over the ladder and not `PRIORITIES.map(...)`: a level nobody
    // holds yields `?? []`, which flattens away. An empty section would assert
    // there is something to look for in a bucket that has nothing in it — the
    // rule the list route states for an empty page, applied one level down.
    return PRIORITIES.flatMap((level) => sections.get(`priority:${level}`) ?? []);
  }
  return [...sections.values()];
}

/**
 * Depth-first nesting; a row whose parent is outside the set roots at depth 0 —
 * never dropped. Two different things put a parent outside the set and BOTH
 * must still render the child:
 *
 *  - the parent is in another section (grouping by status splits a family), and
 *  - the parent is RESTRICTED — `hasRestrictedParent` is the server saying "this
 *    row hangs under a ticket you may not see". Hiding the child would turn a
 *    restriction into a vanish (invariant 5); the view renders it at the root
 *    and NAMES the restriction instead (`ticket-list.tsx`).
 */
export function nestRows(rows: ListRow[]): ListRowNode[] {
  const ids = new Set(rows.map((row) => row.ticketId));
  const byParent = new Map<string | null, ListRow[]>();
  for (const row of rows) {
    const key = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const bucket = byParent.get(key) ?? [];
    bucket.push(row);
    byParent.set(key, bucket);
  }
  const nodes: ListRowNode[] = [];
  const visited = new Set<string>();
  const visit = (parentKey: string | null, depth: number): void => {
    for (const row of byParent.get(parentKey) ?? []) {
      if (visited.has(row.ticketId)) continue; // defensive: the engine refuses cycles, replay must not loop
      visited.add(row.ticketId);
      const children = byParent.get(row.ticketId) ?? [];
      nodes.push({ row, depth, hasChildren: children.length > 0 });
      visit(row.ticketId, depth + 1);
    }
  };
  visit(null, 0);
  return nodes;
}

/**
 * Collapse hides a SUBTREE and nothing else, and it is the one hiding on this
 * surface a user asked for by clicking. It never reaches `countRows`, which
 * reads the flat set — so the summary keeps saying how many tickets there are
 * while the screen shows fewer.
 */
export function visibleNodes(nodes: ListRowNode[], collapsed: ReadonlySet<string>): ListRowNode[] {
  const visible: ListRowNode[] = [];
  let hiddenBelowDepth: number | null = null;
  for (const node of nodes) {
    if (hiddenBelowDepth !== null && node.depth > hiddenBelowDepth) continue;
    hiddenBelowDepth = null;
    visible.push(node);
    if (collapsed.has(node.row.ticketId)) hiddenBelowDepth = node.depth;
  }
  return visible;
}

const BUILTIN_COLUMN_LABELS: Record<Exclude<ListColumnId, `field:${string}`>, string> = {
  status: 'Status',
  assignee: 'Assignee',
  dueDate: 'Due date',
  type: 'Type',
  progress: 'Progress',
  priority: 'Priority',
};

export function columnLabel(id: ListColumnId): string {
  if (id.startsWith('field:')) return id.slice('field:'.length);
  return BUILTIN_COLUMN_LABELS[id as Exclude<ListColumnId, `field:${string}`>];
}
