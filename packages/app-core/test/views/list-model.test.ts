import { describe, expect, it } from 'vitest';
import type { Grouping, ListRow, TicketListView } from '../../src/view-types.js';
import {
  columnLabel,
  countRows,
  groupRows,
  nestRows,
  recentlyAssignedRows,
  visibleNodes,
  type GroupLabels,
} from '../../src/views/list-model.js';
import { claim, listRowSeed } from '../helpers/seed.js';

const LABELS: GroupLabels = {
  epicTitle: (epicId) => (epicId === 'epic_reg' ? 'Registrations' : epicId),
  typeName: (typeId) => typeId,
};

const ROWS: ListRow[] = [
  listRowSeed({ ticketId: 'epicA', title: 'Registrations', typeId: 'epic', typeRank: 1, epicId: null }),
  listRowSeed({
    ticketId: 't1',
    title: 'GST',
    parentId: 'epicA',
    epicId: 'epic_reg',
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal',
    // Spec 2026-09-22: two rows carry a level other than the seed's P2, so the
    // priority grouping has three levels to order rather than one.
    priority: { value: 'P1', claim: claim() },
  }),
  listRowSeed({
    ticketId: 't2',
    title: 'DLT',
    parentId: 'epicA',
    epicId: 'epic_reg',
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    assignee: { id: 'me', name: 'Kiro' },
    assignedProvenance: claim({ serverTime: '2026-08-19T11:00:00.000Z' }),
  }),
  listRowSeed({ ticketId: 't3', title: 'Sub-task of DLT', parentId: 't2', epicId: 'epic_reg', stateCategory: 'open' }),
  listRowSeed({
    ticketId: 't4',
    title: 'Loose task',
    assignee: { id: 'me', name: 'Kiro' },
    assignedProvenance: claim({ serverTime: '2026-08-20T07:00:00.000Z' }),
    priority: { value: 'P3', claim: claim() },
  }),
];

const GROUPINGS: Grouping[] = ['epic', 'status', 'assignee', 'type', 'priority', 'flat'];

/**
 * THE TRIPWIRE UNDER CLIENT-SIDE GROUPING. `groupRows` partitions a set and
 * calls the parts sections of the PROJECT. That is only true while
 * `TicketListView` is the complete row set — the shipped `/v1/list` route
 * answers `{groups, nextCursor}` and groups per page, so the day this view type
 * grows a cursor, every section label on screen becomes a claim about one page
 * wearing the project's name.
 *
 * This is a TYPE-level guard and its kill is a `typecheck` error, not a red
 * test: `keyof TicketListView` widening past the two members makes the return
 * unassignable. Measured — adding `nextCursor: string | null` to
 * `TicketListView` fails `pnpm --filter @gisik-nokma/app-core typecheck` here
 * with TS2322, `Type '"nextCursor"' is not assignable to type
 * 'CompleteRowSetOnly'`.
 */
type CompleteRowSetOnly = 'projectId' | 'rows';
function paginationTripwire(key: keyof TicketListView): CompleteRowSetOnly {
  return key;
}

describe('3.48 grouping arranges truth; it never changes it (spec §7 List)', () => {
  it('TYPE TRIPWIRE: TicketListView is the COMPLETE row set, which is what licenses grouping here', () => {
    expect(paginationTripwire('rows')).toBe('rows');
    expect(paginationTripwire('projectId')).toBe('projectId');
  });

  it('PLANTED DEFECT: every grouping renders the same rows and the same counts', () => {
    const baseline = countRows(ROWS);
    for (const grouping of GROUPINGS) {
      const sections = groupRows(ROWS, grouping, LABELS);
      const regrouped = sections.flatMap((section) => section.rows);
      expect(regrouped.map((row) => row.ticketId).sort(), `grouping=${grouping}`).toEqual(
        ROWS.map((row) => row.ticketId).sort(),
      );
      expect(countRows(regrouped), `grouping=${grouping}`).toEqual(baseline);
    }
  });

  /**
   * The assertion above compares SORTED id lists, so a partition that emitted
   * a row twice and dropped another would still have to differ in ids to fail.
   * This one counts occurrences: every row exactly once, per grouping.
   */
  it('PLANTED DEFECT: no grouping duplicates a row either — exactly once, not merely present', () => {
    for (const grouping of GROUPINGS) {
      const seen = new Map<string, number>();
      for (const section of groupRows(ROWS, grouping, LABELS)) {
        for (const row of section.rows) seen.set(row.ticketId, (seen.get(row.ticketId) ?? 0) + 1);
      }
      expect([...seen.values()], `grouping=${grouping}`).toEqual(ROWS.map(() => 1));
    }
  });

  it('labels sections honestly: No epic / Unassigned buckets exist rather than vanishing rows', () => {
    const epicSections = groupRows(ROWS, 'epic', LABELS);
    expect(epicSections.map((section) => section.label)).toContain('No epic');
    const assigneeSections = groupRows(ROWS, 'assignee', LABELS);
    expect(assigneeSections.map((section) => section.label)).toContain('Unassigned');
  });

  it('PLANTED DEFECT: an assignee with no display name is labelled by id, never blank or "system"', () => {
    const nameless = listRowSeed({ ticketId: 'n1', assignee: { id: 'user_anselma', name: '' } });
    const labels = groupRows([nameless], 'assignee', LABELS).map((section) => section.label);
    expect(labels).toEqual(['user_anselma']);
  });

  it('counts terminal rows from the flat set, and grouping cannot move that number', () => {
    expect(countRows(ROWS)).toEqual({ total: 5, terminal: 1 });
  });

  /**
   * MEASURED VACUITY, then closed. `ROWS` holds exactly one `terminal` row AND
   * exactly one `active` row, so counting the wrong category produced the same
   * number and the assertion above could not tell them apart. A count needs a
   * fixture in which the wrong count differs from the right one.
   */
  it('PLANTED DEFECT: "done" means the TERMINAL category, not merely a not-open one', () => {
    const rows = [
      listRowSeed({ ticketId: 'a1', stateCategory: 'active' }),
      listRowSeed({ ticketId: 'a2', stateCategory: 'active' }),
      listRowSeed({ ticketId: 'd1', stateCategory: 'terminal' }),
      listRowSeed({ ticketId: 'o1', stateCategory: 'open' }),
    ];
    expect(countRows(rows)).toEqual({ total: 4, terminal: 1 });
  });

  /**
   * 13.1230 — grouping by priority (spec 2026-09-22). `ROWS` holds one P1
   * (`t1`), one P3 (`t4`) and the rest P2, so the expected order is the LADDER
   * and not the order the levels happen to be first met in the input: the
   * partition is built by walking rows, so a `groupRows` that only partitioned
   * would answer in ENCOUNTER order here — `epicA` (P2) is the first row — and
   * this case is what tells the two apart.
   */
  it('13.1230 grouping by priority yields sections P1, P2, P3 in THAT order, every row exactly once, and labels are the level', () => {
    const sections = groupRows(ROWS, 'priority', LABELS);
    expect(sections.map((section) => section.label)).toEqual(['P1', 'P2', 'P3']);
    expect(sections.flatMap((section) => section.rows).map((row) => row.ticketId).sort()).toEqual(
      ROWS.map((row) => row.ticketId).sort(),
    );
    // The level is the label AND the key is the level, not an index into the
    // ladder: the two must not be able to drift when the ladder is reordered.
    expect(sections[0]?.key).toBe('priority:P1');
  });

  it('13.1230 CONTROL — a level nobody holds yields NO empty section (rows drive sections, not the ladder)', () => {
    const onlyP2 = ROWS.map((row) => ({ ...row, priority: { value: 'P2' as const, claim: claim() } }));
    expect(groupRows(onlyP2, 'priority', LABELS).map((section) => section.label)).toEqual(['P2']);
  });

  it('13.1231 columnLabel names the priority column', () => {
    expect(columnLabel('priority')).toBe('Priority');
  });
});

describe('3.49 nestRows — hierarchy as indentation', () => {
  it('orders parent-before-children with depths, orphans at the root', () => {
    const nodes = nestRows(ROWS);
    const byId = Object.fromEntries(nodes.map((node) => [node.row.ticketId, node]));
    expect(byId['epicA']?.depth).toBe(0);
    expect(byId['t2']?.depth).toBe(1);
    expect(byId['t3']?.depth).toBe(2);
    expect(byId['t4']?.depth).toBe(0);
    expect(byId['t2']?.hasChildren).toBe(true);
    expect(byId['t1']?.hasChildren).toBe(false);
    const order = nodes.map((node) => node.row.ticketId);
    expect(order.indexOf('t2')).toBeLessThan(order.indexOf('t3'));
  });

  it('PLANTED DEFECT: a row whose parent is absent from the set renders at depth 0 — never dropped', () => {
    const nodes = nestRows([listRowSeed({ ticketId: 'lonely', parentId: 'not-here' })]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.depth).toBe(0);
  });

  /**
   * Invariant 5 at the model layer: a RESTRICTED parent is the case where the
   * parent is absent because the viewer may not see it, and hiding the child
   * for want of somewhere to indent it would turn a restriction into a vanish.
   */
  it('PLANTED DEFECT: a row whose parent is restricted still renders — restriction is not deletion', () => {
    const child = listRowSeed({ ticketId: 'child', parentId: 'secret', hasRestrictedParent: true });
    const nodes = nestRows([child]);
    expect(nodes.map((node) => node.row.ticketId)).toEqual(['child']);
    expect(nodes[0]?.depth).toBe(0);
  });

  it('PLANTED DEFECT: nesting never drops a row — every input id comes back, under every shape', () => {
    const nodes = nestRows(ROWS);
    expect(nodes.map((node) => node.row.ticketId).sort()).toEqual(ROWS.map((row) => row.ticketId).sort());
  });

  it('visibleNodes hides collapsed subtrees only', () => {
    const nodes = nestRows(ROWS);
    const visible = visibleNodes(nodes, new Set(['t2']));
    const ids = visible.map((node) => node.row.ticketId);
    expect(ids).toContain('t2');
    expect(ids).not.toContain('t3');
    expect(ids).toContain('t1');
  });

  it('PLANTED DEFECT: collapsing changes nothing about the counts, which read the flat set', () => {
    const nodes = nestRows(ROWS);
    expect(countRows(visibleNodes(nodes, new Set(['t2'])).map((node) => node.row))).not.toEqual(
      countRows(ROWS),
    );
    // …which is exactly why the summary must NOT be computed from what is
    // visible. `TicketList` reads `countRows(rows)`; this asserts the two
    // really do differ, so that test is not vacuous.
    expect(countRows(ROWS).total).toBe(5);
  });
});

describe('3.50 recentlyAssignedRows — pinned section source', () => {
  it('holds only my assignments, newest claim first', () => {
    const rows = recentlyAssignedRows(ROWS, 'me');
    expect(rows.map((row) => row.ticketId)).toEqual(['t4', 't2']);
  });

  /**
   * MEASURED VACUITY, then closed. Written against `ROWS` alone, *"holds only
   * my assignments"* survived deleting the `currentUserId` filter entirely —
   * every row in that fixture carrying provenance is already mine, so the
   * filter had nothing to remove and its absence was invisible. A test of a
   * filter needs something the filter must reject.
   */
  it('PLANTED DEFECT: somebody else’s assignment is not mine, even with a newer claim', () => {
    const mine = listRowSeed({
      ticketId: 'mine',
      assignee: { id: 'me', name: 'Kiro' },
      assignedProvenance: claim({ serverTime: '2026-08-01T00:00:00.000Z' }),
    });
    const theirs = listRowSeed({
      ticketId: 'theirs',
      assignee: { id: 'user_anselma', name: 'Anselma Marak' },
      // NEWER, so a defect that merely mis-sorts cannot be mistaken for this one.
      assignedProvenance: claim({ serverTime: '2026-09-01T00:00:00.000Z' }),
    });
    expect(recentlyAssignedRows([mine, theirs], 'me').map((row) => row.ticketId)).toEqual(['mine']);
  });

  it('PLANTED DEFECT: an assignment with no provenance is not pinned — and is not dropped from the list', () => {
    const noProvenance = listRowSeed({
      ticketId: 'np',
      assignee: { id: 'me', name: 'Kiro' },
      assignedProvenance: null,
    });
    expect(recentlyAssignedRows([noProvenance], 'me')).toEqual([]);
    // The list itself still carries it — the pin is a surface, not a filter.
    expect(groupRows([noProvenance], 'flat', LABELS).flatMap((section) => section.rows)).toHaveLength(1);
  });

  it('PLANTED DEFECT: orders by the SERVER clock, not the actor-claimed one', () => {
    const early = listRowSeed({
      ticketId: 'early',
      assignee: { id: 'me', name: 'Kiro' },
      // Claimed LATER, recorded EARLIER: a client clock five hours out would
      // otherwise put this at the top of "recently assigned".
      assignedProvenance: claim({
        clientTime: '2026-09-01T00:00:00.000Z',
        serverTime: '2026-08-01T00:00:00.000Z',
      }),
    });
    const late = listRowSeed({
      ticketId: 'late',
      assignee: { id: 'me', name: 'Kiro' },
      assignedProvenance: claim({
        clientTime: '2026-08-01T00:00:00.000Z',
        serverTime: '2026-09-01T00:00:00.000Z',
      }),
    });
    expect(recentlyAssignedRows([early, late], 'me').map((row) => row.ticketId)).toEqual([
      'late',
      'early',
    ]);
  });
});

describe('3.147 columnLabel', () => {
  it('names the built-in columns', () => {
    expect(columnLabel('dueDate')).toBe('Due date');
    expect(columnLabel('progress')).toBe('Progress');
  });

  it('names a custom field column by its field id', () => {
    expect(columnLabel('field:gstin')).toBe('gstin');
  });
});
