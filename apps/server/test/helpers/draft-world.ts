import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { applyCommitted, makeCommitted } from './apply.js';
import type { ReadWorld } from './read-app.js';

export const DRAFT_TITLE = 'Quokka draft';
export const TWIN_TITLE = 'Quokka twin';
/** In the read world's attention window at `SCENARIO_NOW` (2026-08-20): the scenario's own due date. */
export const DUE = '2026-08-25';
/** 19 days before `SCENARIO_NOW`: stale for the default threshold (7), as the scenario's own `doing` ticket is. */
export const STALE_SINCE = '2026-08-01T09:00:05.000Z';

export type DraftWorld = {
  parentId: string;
  /** published, Backlog, assigned to `outsider`, child of the parent */
  twinId: string;
  /** published, `doing` since STALE_SINCE, due DUE, assigned to `outsider` */
  twinActiveId: string;
  /** draft by `member`, Backlog, assigned to `outsider`, child of the parent */
  draftId: string;
  /** draft by `member`, PLANTED in `doing` since STALE_SINCE, due DUE, assigned to `outsider`, child of the parent */
  draftActiveId: string;
  /** draft by `member`, PLANTED in `doing`, no parent, assigned to `member` (the author's own My Work) */
  rootDraftId: string;
  /** draft by `projectLead`, Backlog, explicit audience [guest] (planted) */
  guestDraftId: string;
  draftIds: readonly string[];
};

/**
 * Builds the world every closed-read case shares, on top of `buildReadTestApp`'s read world.
 *
 * Two of the drafts sit in `doing`. No door can produce that: a draft is born in the Backlog and
 * `ticket.transitioned` on a draft is refused (T5). They are planted with hand-built events, and that is the
 * point: a board and an Attention strip would omit a Backlog draft for an unrelated reason (the board has no
 * Backlog column), so only a draft in an ACTIVE state tests that the predicate, and not the state, is what
 * closes it. The same goes for `guestDraftId`'s explicit audience.
 */
export async function seedDraftWorld(pool: Pool, read: ReadWorld): Promise<DraftWorld> {
  const { workspaceId, projectId, owner, member } = read.world;
  const outsider = read.userIds.outsider;
  const lead = read.userIds.projectLead;
  const guest = read.userIds.guest;
  const ids = {
    parentId: newUlid(), twinId: newUlid(), twinActiveId: newUlid(),
    draftId: newUlid(), draftActiveId: newUlid(), rootDraftId: newUlid(), guestDraftId: newUlid(),
  };
  const created = (actorId: string, id: string, payload: Record<string, unknown>): LedgerEvent =>
    makeCommitted({
      workspaceId, actorId, entity: { kind: 'ticket', id }, type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, ...payload },
    });
  const toDoing = (actorId: string, id: string): LedgerEvent =>
    makeCommitted({
      workspaceId, actorId, entity: { kind: 'ticket', id }, type: 'ticket.transitioned',
      payload: { to: 'doing' }, clientTime: STALE_SINCE, serverTime: STALE_SINCE,
    });
  const due = (actorId: string, id: string): LedgerEvent =>
    makeCommitted({
      workspaceId, actorId, entity: { kind: 'ticket', id }, type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: DUE } },
    });
  const draft = { start: 'backlog', draft: true } as const;
  const events: LedgerEvent[] = [
    created(owner, ids.parentId, { typeId: 'epic', title: 'Quokka parent' }),
    created(owner, ids.twinId, { parentId: ids.parentId, title: TWIN_TITLE, assigneeId: outsider }),
    created(owner, ids.twinActiveId, { parentId: ids.parentId, title: 'Quokka twin active', assigneeId: outsider }),
    toDoing(owner, ids.twinActiveId),
    due(owner, ids.twinActiveId),
    created(member, ids.draftId, { parentId: ids.parentId, title: DRAFT_TITLE, assigneeId: outsider, ...draft }),
    created(member, ids.draftActiveId, { parentId: ids.parentId, title: `${DRAFT_TITLE} active`, assigneeId: outsider, ...draft }),
    toDoing(member, ids.draftActiveId),
    due(member, ids.draftActiveId),
    created(member, ids.rootDraftId, { title: `${DRAFT_TITLE} root`, assigneeId: member, ...draft }),
    toDoing(member, ids.rootDraftId),
    created(lead, ids.guestDraftId, { title: `${DRAFT_TITLE} for a guest`, ...draft }),
    makeCommitted({
      workspaceId, actorId: lead, entity: { kind: 'ticket', id: ids.guestDraftId }, type: 'visibility.set',
      payload: { ticketId: ids.guestDraftId, mode: 'explicit', userIds: [guest] },
    }),
  ];
  await applyCommitted(pool, events);
  return {
    ...ids,
    draftIds: [ids.draftId, ids.draftActiveId, ids.rootDraftId, ids.guestDraftId],
  };
}

/**
 * Runs `run` with the draft flag CLEARED on these tickets in both projections, then puts it back.
 *
 * This is the control of every closed-read case: the same request, by the same viewer, with the only thing
 * that differs being the flag. A closed read whose "absent" cannot be told from "the fixture never held it"
 * proves nothing.
 */
export async function withDraftsOpened<T>(pool: Pool, ids: readonly string[], run: () => Promise<T>): Promise<T> {
  const { rows } = await pool.query<{ ticket_id: string; draft_author_id: string }>(
    'SELECT ticket_id, draft_author_id FROM proj_tickets WHERE ticket_id = ANY($1::text[]) AND draft_author_id IS NOT NULL',
    [ids],
  );
  if (rows.length !== ids.length) {
    throw new Error(`withDraftsOpened: ${ids.length - rows.length} of these ${ids.length} tickets are not drafts`);
  }
  const set = async (value: (id: string) => string | null): Promise<void> => {
    for (const row of rows) {
      await pool.query('UPDATE proj_tickets SET draft_author_id = $2 WHERE ticket_id = $1', [row.ticket_id, value(row.ticket_id)]);
      await pool.query('UPDATE proj_visibility SET draft_author_id = $2 WHERE ticket_id = $1', [row.ticket_id, value(row.ticket_id)]);
    }
  };
  await set(() => null);
  try {
    return await run();
  } finally {
    const author = new Map(rows.map((row) => [row.ticket_id, row.draft_author_id]));
    await set((id) => author.get(id) ?? null);
  }
}
