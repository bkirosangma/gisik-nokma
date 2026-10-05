import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
// The `./online` subpath, for the reason `test/integration/client-contract.test.ts:16-20` gives.
import { mapHome } from '@gisik-nokma/app-core/online';
import { HOME_ID_CAP, newUlid, type AttentionResponse, type HomeResponse, type LedgerEvent } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { isWorkspaceAdmin } from '../../src/read/membership-roster.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../../src/read/membership.js';
import { LIVE_TICKET_WHERE } from '../../src/read/visible-where.js';
import { visibleMemberCount } from '../../src/read/workspace-counts.js';
import { readMembers } from '../../src/routes/builder-reads.js';
import { capIds, readHome } from '../../src/routes/home.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Knowledge Graph spec E, Task 1 — `GET /v1/workspaces/:workspaceId/home` (cases 27.601–27.616; 27.600 is the gated
 * p95 in `home-perf.test.ts`).
 *
 * ## What this file pins
 *
 * Six numbers and the ids behind them, over what the VIEWER may see. Each definition is crossed at its edge on one
 * fixture (below); each case carries its own control in the same `it()`. Open / Past due / Due soon are the rules
 * `readAttention` already applies (D-E1, D-E2), so 27.611 reads the two strips side by side.
 *
 * ## The fixtures, and the clock
 *
 * `buildReadTestApp`'s clock is `SCENARIO_NOW` = 2026-08-20T12:00Z = 17:30 IST on the 20th. The shared world
 * already carries due dates of its own (`hiddenTaskId` on the 21st, `taskInEpicId` on the 25th), so a bucket is
 * asserted by the FIXTURE ids it holds, never by whole-list equality.
 *
 * Settings are last-writer-wins per workspace and this file holds one database with one seed, so EVERY case that
 * reads a due bucket first claims its own `claimSettings(7, n)` (the same discipline as `attention.test.ts`).
 *
 * 27.606 deletes a project and is declared LAST, so the deletion cannot reach another case.
 */

let db: TestDatabase;
let read: ReadWorld;
let fx: HomeFixtures;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  fx = await seedHomeFixtures();
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A hand-built ULID-shaped id ordered by `index`; prefix `0HM` so nothing can mistake it for the shared world's. */
function homeTicketId(index: number, prefix = '0HM'): string {
  const suffix = `${CROCKFORD[Math.floor(index / CROCKFORD.length)]}${CROCKFORD[index % CROCKFORD.length]}`;
  return `${prefix}${'0'.repeat(21)}${suffix}`;
}

type HomeFixtures = {
  /** due 2026-08-19, open → Past due */
  overdueYesterday: string;
  /** due 2026-08-18, open, and an id that sorts AFTER `overdueYesterday`'s → Past due, listed BEFORE it (day, then id) */
  overdueOlder: string;
  /**
   * due 2026-08-17, open, and the SMALLEST id of the Past due fixtures (prefix `0HE` < `0HM`) → Past due, listed
   * AFTER the same-day pair and BEFORE `overdueOlder`: the one fixture on which id DESC (the SELECT's order, what a
   * deleted sort leaves) and id ASC are both wrong (27.603)
   */
  overdueOldest: string;
  /** due 2026-08-16, open, the LOWER id of a same-day pair → listed before `overdueTieHigh` (the tiebreak, 27.603) */
  overdueTieLow: string;
  /** due 2026-08-16, open, the HIGHER id of the same-day pair */
  overdueTieHigh: string;
  /** due 2026-08-20, open → Due soon (today is NOT overdue) */
  dueToday: string;
  /** due 2026-08-23, open → Due soon at N = 3 */
  dueAtN: string;
  /** due 2026-08-24, open → neither at N = 3 */
  dueAtNPlus1: string;
  /** due 2026-08-10, then `done` → tickets only */
  doneOverdue: string;
  /** due 2026-08-10, then `ticket.closed` → tickets only (D-E1) */
  closedOverdue: string;
  /** due 2026-08-19, then the date cleared → open, not Past due */
  clearedDue: string;
  /** due 2026-08-19, then `ticket.deleted` → nowhere */
  trashed: string;
  liveNote: string;
  /** Created after `liveNote`, so its `updated_at` is later → listed first (newest first) */
  liveNote2: string;
  deletedNote: string;
  /** `scope: explicit` naming only the guest, by the owner: the guest's control that visibility, not absence, hid `liveNote` (27.616) */
  guestNote: string;
  /** `scope: explicit` naming only the owner: in the owner's Notes, in no member's and no guest's (27.609, 27.616) */
  ownerOnlyNote: string;
  /** In the NEIGHBOUR's workspace, by the neighbour, in its project — never in this workspace's answer (27.613) */
  neighbourNote: string;
  /** A note homed in `doomedProject`: counted until the project is deleted (27.606) */
  doomedNote: string;
  /** In the NEIGHBOUR's workspace, due 2026-08-19 — never in this workspace's answer */
  neighbourDue: string;
  /** A third project, for 27.606 alone, with two open tickets */
  doomedProject: string;
  doomedTickets: [string, string];
};

async function seedHomeFixtures(): Promise<HomeFixtures> {
  const { workspaceId, projectId, owner } = read.world;
  const ws = { workspaceId, actorId: owner };

  const overdueYesterday = homeTicketId(0);
  const dueToday = homeTicketId(1);
  const dueAtN = homeTicketId(2);
  const dueAtNPlus1 = homeTicketId(3);
  const doneOverdue = homeTicketId(4);
  const closedOverdue = homeTicketId(5);
  const clearedDue = homeTicketId(6);
  const trashed = homeTicketId(7);
  const neighbourDue = homeTicketId(8);
  const doomedTickets: [string, string] = [homeTicketId(9), homeTicketId(10)];
  const doomedProject = newUlid();
  const overdueOlder = homeTicketId(11);
  const overdueOldest = homeTicketId(0, '0HE');
  const overdueTieLow = homeTicketId(12);
  const overdueTieHigh = homeTicketId(13);
  const guestNote = newUlid();
  const ownerOnlyNote = newUlid();
  const neighbourNote = newUlid();
  const liveNote = newUlid();
  const liveNote2 = newUlid();
  const deletedNote = newUlid();
  const doomedNote = newUlid();

  const created = (id: string, title: string, inProject = projectId): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: inProject, parentId: null, title },
    });
  const due = (id: string, date: string | null): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: date === null ? null : { date } },
    });
  const note = (id: string, title: string, homeProjectId = projectId, scope: object = { mode: 'workspace' }): LedgerEvent =>
    makeCommitted({
      ...ws,
      entity: { kind: 'note', id },
      type: 'note.created',
      payload: { title, homeProjectId, scope },
    });

  await applyCommitted(db.pool, [
    created(overdueYesterday, 'Overdue yesterday'),
    due(overdueYesterday, '2026-08-19'),
    created(overdueOlder, 'Overdue the day before'),
    due(overdueOlder, '2026-08-18'),
    created(overdueOldest, 'Overdue three days, smallest id'),
    due(overdueOldest, '2026-08-17'),
    // The same-day pair is created HIGH id first, so only an explicit id sort lists the low one first.
    created(overdueTieHigh, 'Overdue four days, higher id'),
    due(overdueTieHigh, '2026-08-16'),
    created(overdueTieLow, 'Overdue four days, lower id'),
    due(overdueTieLow, '2026-08-16'),
    created(dueToday, 'Due today'),
    due(dueToday, '2026-08-20'),
    created(dueAtN, 'Due at N'),
    due(dueAtN, '2026-08-23'),
    created(dueAtNPlus1, 'Due at N plus one'),
    due(dueAtNPlus1, '2026-08-24'),

    created(doneOverdue, 'Done and past'),
    due(doneOverdue, '2026-08-10'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: doneOverdue }, type: 'ticket.transitioned', payload: { to: 'done' } }),

    created(closedOverdue, 'Closed and past'),
    due(closedOverdue, '2026-08-10'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: closedOverdue }, type: 'ticket.closed', payload: {} }),

    created(clearedDue, 'Date cleared'),
    due(clearedDue, '2026-08-19'),
    due(clearedDue, null),

    created(trashed, 'In the trash'),
    due(trashed, '2026-08-19'),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: trashed }, type: 'ticket.deleted', payload: {} }),

    note(liveNote, 'A live note'),
    note(deletedNote, 'A deleted note'),
    makeCommitted({ ...ws, entity: { kind: 'note', id: deletedNote }, type: 'note.deleted', payload: {} }),
    note(liveNote2, 'A newer live note'),

    makeCommitted({
      workspaceId: read.neighbour.workspaceId,
      actorId: read.userIds.neighbour,
      entity: { kind: 'ticket', id: neighbourDue },
      type: 'ticket.created',
      payload: { typeId: 'nb-task', projectId: read.neighbour.projectId, parentId: null, title: 'Neighbour due' },
    }),
    makeCommitted({
      workspaceId: read.neighbour.workspaceId,
      actorId: read.userIds.neighbour,
      entity: { kind: 'ticket', id: neighbourDue },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: '2026-08-19' } },
    }),

    makeCommitted({ ...ws, entity: { kind: 'project', id: doomedProject }, type: 'project.created', payload: { name: 'Doomed' } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'project', id: doomedProject },
      type: 'project.member_added',
      payload: { userId: owner, projectAdmin: true },
    }),
    created(doomedTickets[0], 'Doomed one', doomedProject),
    created(doomedTickets[1], 'Doomed two', doomedProject),
    note(doomedNote, 'A note in the doomed project', doomedProject),

    note(guestNote, 'A note for the guest', projectId, { mode: 'explicit', userIds: [read.userIds.guest] }),
    note(ownerOnlyNote, 'A note for the owner alone', projectId, { mode: 'explicit', userIds: [owner] }),
    makeCommitted({
      workspaceId: read.neighbour.workspaceId,
      actorId: read.userIds.neighbour,
      entity: { kind: 'note', id: neighbourNote },
      type: 'note.created',
      payload: { title: 'A neighbour note', homeProjectId: read.neighbour.projectId, scope: { mode: 'workspace' } },
    }),
  ]);

  return {
    overdueYesterday,
    overdueOlder,
    overdueOldest,
    overdueTieLow,
    overdueTieHigh,
    dueToday,
    dueAtN,
    dueAtNPlus1,
    doneOverdue,
    closedOverdue,
    clearedDue,
    trashed,
    liveNote,
    liveNote2,
    deletedNote,
    doomedNote,
    guestNote,
    ownerOnlyNote,
    neighbourNote,
    neighbourDue,
    doomedProject,
    doomedTickets,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

const homeUrl = (workspaceId: string): string => `/v1/workspaces/${workspaceId}/home`;

async function homeRaw(role: ReadRole, workspaceId?: string): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: homeUrl(workspaceId ?? read.world.workspaceId), headers: read.authOf(role) });
}

async function home(role: ReadRole, workspaceId?: string): Promise<HomeResponse> {
  const response = await homeRaw(role, workspaceId);
  expect(response.statusCode).toBe(200);
  return response.json() as HomeResponse;
}

/** Claims both thresholds as the owner — a claim persists for the rest of the file, so every due case makes its own. */
async function claimSettings(staleDays: number, dueSoonDays: number): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: read.world.workspaceId,
      actorId: read.world.owner,
      entity: { kind: 'workspace', id: read.world.workspaceId },
      type: 'workspace.settings_set',
      payload: { staleDays, dueSoonDays },
    }),
  ]);
}

/** `readHome` straight from the computation at an instant of our choosing. */
async function homeAt(role: ReadRole, at: string): Promise<HomeResponse> {
  const viewerId = read.userIds[role];
  const eff = await requireMember(db.pool, viewerId, read.world.workspaceId);
  expect(eff).not.toBeNull();
  return readHome(db.pool, eff!, viewerId, read.world.workspaceId, new Date(at));
}

async function attentionAs(role: ReadRole): Promise<AttentionResponse> {
  const response = await read.app.inject({
    method: 'GET',
    url: `/v1/workspaces/${read.world.workspaceId}/attention`,
    headers: read.authOf(role),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as AttentionResponse;
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

/** The ticket fixtures this file seeded, so an order is read off OUR ids and never off the shared world's due dates. */
function ownTickets(ids: readonly string[]): string[] {
  const own = new Set<string>([
    fx.overdueYesterday, fx.overdueOlder, fx.overdueOldest, fx.overdueTieLow, fx.overdueTieHigh,
    fx.dueToday, fx.dueAtN, fx.dueAtNPlus1, fx.doneOverdue, fx.closedOverdue, fx.clearedDue, fx.trashed,
  ]);
  return ids.filter((id) => own.has(id));
}

// ---------------------------------------------------------------------------

describe('GET /v1/workspaces/:workspaceId/home — six numbers over the viewer’s own slice', () => {
  it('27.601 Tickets is every visible live ticket: done, closed and cleared-date ones are in; the trashed one is not', async () => {
    const owner = await home('owner');
    expect(owner.ids.tickets).toContain(fx.doneOverdue);
    expect(owner.ids.tickets).toContain(fx.closedOverdue);
    expect(owner.ids.tickets).toContain(fx.clearedDue);
    expect(owner.ids.tickets).not.toContain(fx.trashed);
    expect(owner.counts.tickets).toBe(owner.ids.tickets.length);
    expect(owner.counts.tickets).toBeLessThan(HOME_ID_CAP);
    // Newest first: `ticket_id DESC`.
    expect(owner.ids.tickets).toEqual([...owner.ids.tickets].sort().reverse());

    // Control: the row exists — the read drops it, the table does not.
    const { rows } = await db.pool.query('SELECT ticket_id FROM proj_tickets WHERE ticket_id = $1', [fx.trashed]);
    expect(rows).toHaveLength(1);
  });

  it('27.602 Open excludes a terminal ticket and a closed one; control: a cleared-date and a due-today ticket are open', async () => {
    const owner = await home('owner');
    expect(owner.ids.open).not.toContain(fx.doneOverdue);
    expect(owner.ids.open).not.toContain(fx.closedOverdue);
    expect(owner.ids.open).toContain(fx.clearedDue);
    expect(owner.ids.open).toContain(fx.dueToday);
    expect(owner.counts.open).toBe(owner.ids.open.length);
  });

  it('27.603 the IST boundary: yesterday is Past due, today is Due soon; and today turns Past due at 18:30:00.000Z exactly; both lists run by due day, then id', async () => {
    await claimSettings(7, 7);
    const now = await home('owner');
    expect(now.ids.pastDue).toContain(fx.overdueYesterday);
    expect(now.ids.pastDue).not.toContain(fx.dueToday);
    expect(now.ids.dueSoon).toContain(fx.dueToday);
    expect(now.ids.dueSoon).not.toContain(fx.overdueYesterday);
    // Past due is listed by due day ascending, then id ascending, read off our fixtures alone. The expected list is
    // wrong for all three wrong orders at once: id DESC (the SELECT's order, what a deleted sort leaves) puts
    // overdueOlder (id 11) before overdueYesterday (id 0) and overdueOldest (`0HE…`) last; id ASC puts overdueOldest
    // first and overdueYesterday before overdueOlder; and a tiebreak of 0 keeps the SELECT's id DESC inside the
    // same-day pair.
    expect(fx.overdueOldest < fx.overdueYesterday && fx.overdueYesterday < fx.overdueOlder).toBe(true);
    expect(fx.overdueTieLow < fx.overdueTieHigh).toBe(true);
    expect(ownTickets(now.ids.pastDue)).toEqual([
      fx.overdueTieLow, // 16th, lower id
      fx.overdueTieHigh, // 16th, higher id
      fx.overdueOldest, // 17th
      fx.overdueOlder, // 18th
      fx.overdueYesterday, // 19th
    ]);
    // Due soon is listed by due day ascending too: ids 1, 2, 3 run against the SELECT's id DESC.
    expect(ownTickets(now.ids.dueSoon)).toEqual([fx.dueToday, fx.dueAtN, fx.dueAtNPlus1]);

    // The pair (copy of 21.243's): one millisecond apart, two Indian days.
    const before = await homeAt('owner', '2026-08-20T18:29:59.999Z');
    expect(before.ids.dueSoon).toContain(fx.dueToday);
    expect(before.ids.pastDue).not.toContain(fx.dueToday);
    const after = await homeAt('owner', '2026-08-20T18:30:00.000Z');
    expect(after.ids.pastDue).toContain(fx.dueToday);
    expect(after.ids.dueSoon).not.toContain(fx.dueToday);
  });

  it('27.604 the window edge follows dueSoonDays: N = 3 admits the 23rd and not the 24th; N = 0 is today only; N = 4 admits the 24th', async () => {
    await claimSettings(7, 3);
    const three = await home('owner');
    expect(three.dueSoonDays).toBe(3);
    expect(three.ids.dueSoon).toContain(fx.dueAtN);
    expect(three.ids.dueSoon).not.toContain(fx.dueAtNPlus1);

    await claimSettings(7, 0);
    const zero = await home('owner');
    expect(zero.dueSoonDays).toBe(0);
    expect(zero.ids.dueSoon).toContain(fx.dueToday);
    expect(zero.ids.dueSoon).not.toContain(fx.dueAtN);
    expect(zero.ids.dueSoon).not.toContain(fx.dueAtNPlus1);

    // Control: widening by one admits the edge ticket.
    await claimSettings(7, 4);
    const four = await home('owner');
    expect(four.dueSoonDays).toBe(4);
    expect(four.ids.dueSoon).toContain(fx.dueAtNPlus1);
  });

  it('27.605 a cleared due date and a done ticket’s past date are in neither Past due nor Due soon; control: the live overdue one is', async () => {
    await claimSettings(7, 7);
    const owner = await home('owner');
    for (const id of [fx.clearedDue, fx.doneOverdue, fx.closedOverdue]) {
      expect(owner.ids.pastDue, id).not.toContain(id);
      expect(owner.ids.dueSoon, id).not.toContain(id);
    }
    expect(owner.ids.pastDue).toContain(fx.overdueYesterday);
  });

  it('27.607 Notes counts the live ones: a deleted note is out; control: counts.notes is the length of its ids', async () => {
    const owner = await home('owner');
    expect(owner.ids.notes).toContain(fx.liveNote);
    expect(owner.ids.notes).not.toContain(fx.deletedNote);
    expect(owner.counts.notes).toBe(owner.ids.notes.length);
    // Newest first: `updated_at DESC`.
    expect(owner.ids.notes.indexOf(fx.liveNote2)).toBeGreaterThanOrEqual(0);
    expect(owner.ids.notes.indexOf(fx.liveNote2)).toBeLessThan(owner.ids.notes.indexOf(fx.liveNote));
  });

  it('27.608 Members is the roster rule in one expression: count = visibleMemberCount = readMembers length, ids = the roster ids', async () => {
    const counts: Record<string, number | null> = {};
    for (const role of ['owner', 'admin', 'member'] as const) {
      const viewerId = read.userIds[role];
      const eff = await requireMember(db.pool, viewerId, read.world.workspaceId);
      expect(eff, role).not.toBeNull();
      const roster = await readMembers(db.pool, read.world.workspaceId, isWorkspaceAdmin(eff!));
      const body = await home(role);
      expect(body.counts.members, role).toBe(roster.length);
      expect(body.counts.members, role).toBe(await visibleMemberCount(db.pool, eff!, read.world.workspaceId));
      expect(body.ids.members, role).toEqual(roster.map((m) => m.userId));
      counts[role] = body.counts.members;
    }
    // Control: the owner's count includes the guest, the member's does not.
    expect(counts['owner']).toBeGreaterThan(counts['member'] as number);
    expect((await home('owner')).ids.members).toContain(read.userIds.guest);
    expect((await home('member')).ids.members).not.toContain(read.userIds.guest);
  });

  it('27.609 visibility: the member never sees the hidden ticket in the counts or the ids; control: the owner’s ids hold it', async () => {
    const owner = await home('owner');
    const member = await home('member');
    const { hiddenTaskId } = read.world;
    expect(owner.ids.tickets).toContain(hiddenTaskId);
    expect(member.ids.tickets).not.toContain(hiddenTaskId);
    expect(member.ids.open).not.toContain(hiddenTaskId);
    expect(member.counts.tickets).toBeLessThan(owner.counts.tickets);
    // Everything the member is told about, the owner is told about too.
    const ownerSet = new Set(owner.ids.tickets);
    expect(member.ids.tickets.every((id) => ownerSet.has(id))).toBe(true);
    expect(member.counts.tickets).toBe(member.ids.tickets.length);

    // Notes: the same rule through `visibleNotesWhere`. A note naming only the owner is the owner's alone;
    // control: the workspace-scoped note is the member's too.
    expect(owner.ids.notes).toContain(fx.ownerOnlyNote);
    expect(member.ids.notes).not.toContain(fx.ownerOnlyNote);
    expect(member.ids.notes).toContain(fx.liveNote);
    expect(member.counts.notes).toBe(member.ids.notes.length);
    expect(member.counts.notes).toBeLessThan(owner.counts.notes);
  });

  it('27.610 capIds: 2,001 → 2,000 in the same order; 2,000 → 2,000; none → none (the count-before-cap is a mutation case)', () => {
    const ids = Array.from({ length: HOME_ID_CAP + 1 }, (_, i) => homeTicketId(i));
    const capped = capIds(ids);
    expect(capped).toHaveLength(HOME_ID_CAP);
    expect(capped).toEqual(ids.slice(0, HOME_ID_CAP));
    expect(capIds(ids.slice(0, HOME_ID_CAP))).toHaveLength(HOME_ID_CAP);
    expect(capIds([])).toEqual([]);
  });

  it('27.610 the response count is the rows the SELECT found, not the capped ids: it equals an independent COUNT(*) over the live tickets', async () => {
    const owner = await home('owner');
    const { rows } = await db.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM proj_tickets t WHERE t.workspace_id = $1 AND ${LIVE_TICKET_WHERE}`,
      [read.world.workspaceId],
    );
    expect(owner.counts.tickets).toBe(Number(rows[0]?.n));
    // Control: ids are the capped list, so they can only be at most the count.
    expect(owner.ids.tickets.length).toBeLessThanOrEqual(owner.counts.tickets);
  });

  it('27.611 Past due and Due soon equal the attention strip’s overdue and due-soon buckets, for the owner and the member', async () => {
    await claimSettings(7, 7);
    for (const role of ['owner', 'member'] as const) {
      const strip = await attentionAs(role);
      const body = await home(role);
      const bucket = (kind: 'overdue' | 'due-soon'): string[] =>
        sorted(strip.items.filter((item) => item.kind === kind).map((item) => item.card.ticketId));
      expect(sorted(body.ids.pastDue), `${role} past due`).toEqual(bucket('overdue'));
      expect(sorted(body.ids.dueSoon), `${role} due soon`).toEqual(bucket('due-soon'));
      expect(body.counts.pastDue).toBe(body.ids.pastDue.length);
      expect(body.counts.dueSoon).toBe(body.ids.dueSoon.length);
    }
    // Control: the buckets are not both empty for the owner, so the equality is not vacuous.
    const owner = await home('owner');
    expect(owner.ids.pastDue.length).toBeGreaterThan(0);
    expect(owner.ids.dueSoon.length).toBeGreaterThan(0);
  });

  it('27.612 doors: no session or a forged bearer is 401; a stranger and an unknown id get one identical 404; control: a member is 200', async () => {
    const url = homeUrl(read.world.workspaceId);
    const anonymous = await read.app.inject({ method: 'GET', url });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual(UNAUTHENTICATED_BODY);
    const forged = await read.app.inject({ method: 'GET', url, headers: { authorization: 'Bearer not-a-real-session-token' } });
    expect(forged.statusCode).toBe(401);
    expect(forged.json()).toEqual(UNAUTHENTICATED_BODY);

    const stranger = await homeRaw('stranger');
    const unknown = await homeRaw('owner', newUlid());
    expect(stranger.statusCode).toBe(404);
    expect(stranger.json()).toEqual(READ_NOT_FOUND_BODY);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).toBe(stranger.body);
    expect(unknown.headers['content-length']).toBe(stranger.headers['content-length']);

    expect((await homeRaw('member')).statusCode).toBe(200);
  });

  it('27.613 tenancy: this workspace’s owner never sees the neighbour’s overdue ticket; control: the neighbour’s owner does, at home', async () => {
    await claimSettings(7, 7);
    const mine = await home('owner');
    expect(mine.ids.tickets).not.toContain(fx.neighbourDue);
    expect(mine.ids.pastDue).not.toContain(fx.neighbourDue);
    const theirs = await home('neighbour', read.neighbour.workspaceId);
    expect(theirs.ids.pastDue).toContain(fx.neighbourDue);
    expect(theirs.workspaceId).toBe(read.neighbour.workspaceId);

    // Notes are tenant-scoped too: the neighbour's workspace-scoped note is not in this owner's Notes (the owner arm
    // of `visibleNotesWhere` is TRUE, so only `n.workspace_id` keeps it out); control: it is in the neighbour's own.
    expect(mine.ids.notes).not.toContain(fx.neighbourNote);
    expect(theirs.ids.notes).toContain(fx.neighbourNote);
    expect(theirs.ids.notes).not.toContain(fx.liveNote);
  });

  it('27.614 generatedAt is the route’s clock and workspaceId is echoed; control: a second app with another clock answers its own instant', async () => {
    const body = await home('owner');
    expect(body.generatedAt).toBe(SCENARIO_NOW.toISOString());
    expect(body.workspaceId).toBe(read.world.workspaceId);

    const later = new Date('2026-09-01T08:00:00.000Z');
    const second = buildTestApp(db, { now: () => later });
    await second.app.ready();
    try {
      // The same phone signs the same user in, so this is the owner on a second app.
      const user = await signInWithPhone(second.app, second.otp, '+911111111101');
      expect(user.userId).toBe(read.userIds.owner);
      const response = await second.app.inject({
        method: 'GET',
        url: homeUrl(read.world.workspaceId),
        headers: { authorization: `Bearer ${user.token}` },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as HomeResponse).generatedAt).toBe(later.toISOString());
    } finally {
      await second.app.close();
    }
  });

  it('27.616 a guest gets members: null and no member ids, and their own slice of tickets; control: a member’s Members is a number', async () => {
    const guest = await home('guest');
    expect(guest.counts.members).toBeNull();
    expect(guest.ids.members).toEqual([]);
    expect(guest.ids.tickets).toContain(read.world.guestTaskId);
    expect(guest.ids.tickets).not.toContain(read.world.hiddenTaskId);
    expect(guest.counts.tickets).toBe(guest.ids.tickets.length);
    expect(typeof (await home('member')).counts.members).toBe('number');

    // Notes: a guest is not told the id of a workspace-scoped note, and its count is its own list's length. Control,
    // same `it`: a note that names the guest IS in their Notes, and the member holds the workspace-scoped one.
    expect(guest.ids.notes).not.toContain(fx.liveNote);
    expect(guest.ids.notes).not.toContain(fx.ownerOnlyNote);
    expect(guest.ids.notes).toContain(fx.guestNote);
    expect(guest.counts.notes).toBe(guest.ids.notes.length);
    expect(guest.counts.notes).toBeGreaterThan(0);
    expect((await home('member')).ids.notes).toContain(fx.liveNote);
    expect((await home('member')).ids.notes).not.toContain(fx.guestNote);
  });

  it('27.632 the REAL /home body maps through the client mapper unchanged; control: a mapped body differs from a mutated one', async () => {
    // `home()` already returns the parsed body; `.json()` on it would throw.
    const body = await home('member');
    // Preconditions: the lists differ, so a field swap in the mapper cannot map to an equal object.
    expect(body.ids.open.length).toBeGreaterThan(0);
    expect(body.ids.open).not.toEqual(body.ids.tickets);
    expect(typeof body.counts.members).toBe('number');
    expect(mapHome(body)).toEqual(body);
    // The guest's real body carries `members: null`; the mapper keeps it null.
    const guestBody = await home('guest');
    expect(guestBody.counts.members).toBeNull();
    expect(mapHome(guestBody)).toEqual(guestBody);
    expect(() => mapHome({ ...body, dueSoonDays: '7' })).toThrow(/home\.dueSoonDays/);
  });

  // LAST in the file: it deletes a project, and every case above reads the shared workspace.
  it('27.606 the trash: a trashed ticket is in no list, and deleting a project takes its tickets out of all four ticket lists', async () => {
    const before = await home('owner');
    expect(before.ids.tickets).not.toContain(fx.trashed);
    for (const id of fx.doomedTickets) {
      // Control: before the delete the doomed project's tickets are counted.
      expect(before.ids.tickets).toContain(id);
      expect(before.ids.open).toContain(id);
    }
    expect(before.ids.notes).toContain(fx.doomedNote);

    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: read.world.workspaceId,
        actorId: read.world.owner,
        entity: { kind: 'project', id: fx.doomedProject },
        type: 'project.deleted',
        payload: {},
      }),
    ]);

    const after = await home('owner');
    for (const id of fx.doomedTickets) {
      for (const list of [after.ids.tickets, after.ids.open, after.ids.pastDue, after.ids.dueSoon]) {
        expect(list).not.toContain(id);
      }
    }
    expect(after.counts.tickets).toBe(before.counts.tickets - fx.doomedTickets.length);
    // The notes' side of the same rule (`NOTE_PROJECT_LIVE_WHERE`): a note homed in the deleted project goes too.
    expect(after.ids.notes).not.toContain(fx.doomedNote);
    expect(after.ids.notes).toContain(fx.liveNote);
    expect(after.counts.notes).toBe(before.counts.notes - 1);
  });
});
