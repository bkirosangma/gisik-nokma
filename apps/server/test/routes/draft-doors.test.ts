import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { draftNotAllowedReason, newUlid, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { DRAFT_NOT_ALLOWED_RULE, PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { DRAFT_TITLE, seedDraftWorld, withDraftsOpened, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';

/**
 * Drafts T4 (spec §4.2, group D; §5): the HTTP doors that admit a draft's author and nobody else. Every door is
 * probed as the author (`member`), another member who has a draft of their own (`projectLead`), the owner, an
 * admin, a guest (named in the planted explicit audience of the lead's draft) and an outsider (the assignee of
 * the member's drafts); each closed answer is compared with the answer an unknown id gets, and each case carries
 * its control (the published twin, or the same request with the flag cleared) in the same `it`.
 */

let db: TestDatabase;
let read: ReadWorld;
let world: DraftWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  world = await seedDraftWorld(db.pool, read);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const WS = (): string => read.world.workspaceId;
const get = (role: ReadRole, url: string) => read.app.inject({ method: 'GET', url, headers: read.authOf(role) });
const sorted = (ids: readonly string[]): string[] => [...ids].sort();
/** Every reader who is not the author of `world.draftId`. */
const OTHERS = ['owner', 'admin', 'projectLead', 'guest', 'outsider'] as const;

describe('28.072 G5: reconcile', () => {
  const reconcile = async (role: ReadRole, heldIds: string[]): Promise<string[]> => {
    const res = await read.app.inject({
      method: 'POST', url: '/v1/sync/reconcile', headers: read.authOf(role), payload: { workspaceId: WS(), heldIds },
    });
    expect(res.statusCode, role).toBe(200);
    return sorted((res.json() as { restricted: Array<{ id: string }> }).restricted.map((r) => r.id));
  };

  it('does not tell a device to purge its author\'s own drafts, and tells everyone else to purge every draft', async () => {
    const held = [world.draftId, world.rootDraftId, world.guestDraftId, world.twinId];
    // the author's device (member): the lead's draft is not theirs, so it is restricted; their own are held
    expect(await reconcile('member', held)).toEqual([world.guestDraftId]);
    // the lead's device: the mirror image
    expect(await reconcile('projectLead', held)).toEqual(sorted([world.draftId, world.rootDraftId]));
    // owner, admin, outsider: every draft is restricted; the published twin never is (the control)
    for (const role of ['owner', 'admin', 'outsider'] as const) {
      expect(await reconcile(role, held), role).toEqual(sorted([world.draftId, world.rootDraftId, world.guestDraftId]));
    }
    // the guest is named in the lead's draft's planted audience and still told to purge it; the twin is not theirs either
    expect(await reconcile('guest', held)).toEqual(sorted(held));
  });
});

describe('28.074 G3: single bootstrap', () => {
  const single = (role: ReadRole, id: string) =>
    get(role, `/v1/sync/bootstrap/ticket?workspaceId=${WS()}&ticketId=${id}`);

  it('serves the draft to its author, the not-found answer to everyone else; cleared, the owner reads it', async () => {
    const mine = await single('member', world.draftId);
    expect(mine.statusCode).toBe(200);
    expect(mine.body).toContain(world.draftId);
    expect(mine.body).toContain('"draft":true'); // the creation event carries the flag the replica folds
    const unknown = await single('owner', newUlid());
    expect(unknown.statusCode).toBe(404);
    for (const role of OTHERS) {
      const res = await single(role, world.draftId);
      expect(res.statusCode, role).toBe(404);
      expect(res.json(), role).toEqual(unknown.json());
    }
    // the lead's own draft is theirs; the guest in its audience gets the unknown answer
    expect((await single('projectLead', world.guestDraftId)).statusCode).toBe(200);
    expect((await single('guest', world.guestDraftId)).json()).toEqual(unknown.json());
    await withDraftsOpened(db.pool, world.draftIds, async () => {
      expect((await single('owner', world.draftId)).statusCode).toBe(200);
    });
  });
});

describe('28.075 G4: full bootstrap', () => {
  const ticketIds = async (role: ReadRole): Promise<string[]> => {
    const res = await get(role, `/v1/sync/bootstrap?workspaceId=${WS()}`);
    expect(res.statusCode, role).toBe(200);
    return (res.json() as { tickets: Array<{ ticketId: string }> }).tickets.map((t) => t.ticketId);
  };

  it('appends the author\'s own drafts and nobody else\'s; the published twins reach everyone who can see them', async () => {
    const mine = await ticketIds('member');
    for (const id of [world.draftId, world.draftActiveId, world.rootDraftId, world.twinId, world.twinActiveId]) {
      expect(mine, id).toContain(id);
    }
    expect(mine).not.toContain(world.guestDraftId);
    const leads = await ticketIds('projectLead');
    expect(leads).toContain(world.guestDraftId);
    expect(leads).not.toContain(world.draftId);
    for (const role of ['owner', 'admin', 'outsider'] as const) {
      const ids = await ticketIds(role);
      expect(ids, `${role} reads the twin`).toContain(world.twinId);
      for (const id of world.draftIds) expect(ids, `${role} ${id}`).not.toContain(id);
    }
    // the guest is named in the lead's draft's planted audience: still not on their snapshot
    const guests = await ticketIds('guest');
    for (const id of world.draftIds) expect(guests, `guest ${id}`).not.toContain(id);
    expect(new Set(mine).size, 'no ticket twice').toBe(mine.length);
  });
});

describe('28.076 G6: the contests roster', () => {
  it('lists a contest on a draft to its author alone; cleared, the owner lists it', async () => {
    const original: SubmittedEvent = {
      id: newUlid(), workspaceId: WS(), entity: { kind: 'ticket', id: world.draftId }, type: 'ticket.field_set', version: 1,
      payload: { fieldId: 'title', value: 'x' }, actorId: read.userIds.member, origin: 'mobile', clientTime: '2026-08-20T09:00:00.000Z',
    };
    const contest = buildContestedClaim({ originalEvent: original, rule: 'require-field', reason: 'A due date is required.', actorId: newUlid() });
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: WS(), actorId: contest.actorId, entity: contest.entity, type: contest.type, payload: contest.payload, id: contest.id }),
    ]);
    const roster = async (role: ReadRole): Promise<string[]> => {
      const res = await get(role, `/v1/contests?workspaceId=${WS()}&ticketId=${world.draftId}`);
      expect(res.statusCode, role).toBe(200);
      return (res.json() as { contests: Array<{ contestedEventId: string }> }).contests.map((c) => c.contestedEventId);
    };
    expect(await roster('member')).toEqual([contest.id]);
    for (const role of OTHERS) expect(await roster(role), role).toEqual([]);
    await withDraftsOpened(db.pool, world.draftIds, async () => {
      expect(await roster('owner')).toEqual([contest.id]);
    });
  });
});

describe('28.077 G7: the detail read', () => {
  const detail = (role: ReadRole, id: string) => get(role, `/v1/workspaces/${WS()}/tickets/${id}`);
  type Detail = {
    ticketState: { draft?: { authorId: string; discarded?: true } };
    key: string | null;
    title: string;
    parent: { kind: string; id: string; key?: string | null } | null;
    epic: { kind: string; id: string } | null;
  };

  it('serves the draft to its author with no key, both crumbs of an own-draft chain as tickets, and the not-found answer to everyone else', async () => {
    const res = await detail('member', world.draftId);
    expect(res.statusCode).toBe(200);
    const body = res.json() as Detail;
    expect(body.ticketState.draft).toMatchObject({ authorId: read.userIds.member });
    expect(body.key).toBeNull();
    expect(body.title).toBe(DRAFT_TITLE);
    expect(body.parent).toMatchObject({ kind: 'ticket', id: world.parentId }); // a published parent, as before

    // an own-draft chain: epic draft > task draft, both by the author
    const epicDraft = newUlid();
    const childDraft = newUlid();
    const created = (id: string, payload: Record<string, unknown>): LedgerEvent =>
      makeCommitted({
        workspaceId: WS(), actorId: read.userIds.member, entity: { kind: 'ticket', id }, type: 'ticket.created',
        payload: { projectId: read.world.projectId, start: 'backlog', draft: true, ...payload },
      });
    await applyCommitted(db.pool, [
      created(epicDraft, { typeId: 'epic', parentId: null, title: 'Own epic draft' }),
      created(childDraft, { typeId: 'task', parentId: epicDraft, title: 'Own child draft' }),
    ]);
    const chain = (await detail('member', childDraft)).json() as Detail;
    expect(chain.parent).toMatchObject({ kind: 'ticket', id: epicDraft, key: null }); // the parent crumb, not `restricted`
    expect(chain.epic).toMatchObject({ kind: 'ticket', id: epicDraft }); // the epic walk, not `restricted`
    expect((await detail('owner', childDraft)).statusCode).toBe(404);

    const unknown = await detail('owner', newUlid());
    expect(unknown.statusCode).toBe(404);
    for (const role of OTHERS) {
      const other = await detail(role, world.draftId);
      expect(other.statusCode, role).toBe(404);
      expect(other.json(), role).toEqual(unknown.json());
    }
    // the guest named in the lead's draft's planted audience: the unknown answer
    expect((await detail('guest', world.guestDraftId)).json()).toEqual(unknown.json());
    // CONTROL: the published twin reads for everyone who read it before, and its own state carries no `draft`
    for (const role of ['owner', 'admin', 'member', 'projectLead', 'outsider'] as const) {
      const twin = await detail(role, world.twinId);
      expect(twin.statusCode, role).toBe(200);
      expect((twin.json() as Detail).ticketState.draft).toBeUndefined();
    }
  });
});

// LAST in the file: it renames the shared draft.
describe('28.085 the author edits their draft end to end over HTTP', () => {
  const submit = (role: ReadRole, type: string, payload: unknown, ticketId: string) =>
    read.app.inject({
      method: 'POST', url: '/v1/events', headers: read.authOf(role),
      payload: {
        events: [{
          id: newUlid(), workspaceId: WS(), entity: { kind: 'ticket', id: ticketId }, type, version: 1, payload,
          actorId: read.userIds[role], origin: 'web', clientTime: SCENARIO_NOW.toISOString(),
        }],
      },
    });
  const result = async (res: Awaited<ReturnType<typeof submit>>) => {
    expect(res.statusCode).toBe(200);
    return (res.json() as { results: Array<Record<string, unknown>> }).results[0];
  };

  it('commits the author\'s edit, shows it on the detail read, refuses the owner and the draft-forbidden types; commits the same edit on a published ticket', async () => {
    const rename = { fieldId: 'title', value: 'Quokka renamed' };
    expect(await result(await submit('member', 'ticket.field_set', rename, world.draftId))).toMatchObject({ status: 'committed' });
    expect(((await get('member', `/v1/workspaces/${WS()}/tickets/${world.draftId}`)).json() as { title: string }).title).toBe('Quokka renamed');

    for (const role of ['owner', 'projectLead'] as const) {
      expect(await result(await submit(role, 'ticket.field_set', rename, world.draftId)), role).toMatchObject({
        status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON,
      });
    }
    expect(await result(await submit('member', 'ticket.closed', {}, world.draftId))).toMatchObject({
      status: 'refused', rule: DRAFT_NOT_ALLOWED_RULE, reason: draftNotAllowedReason('ticket.closed'),
    });
    // CONTROL: the same author, the same event type, a published ticket
    expect(await result(await submit('member', 'ticket.field_set', rename, world.twinId))).toMatchObject({ status: 'committed' });
  });
});
