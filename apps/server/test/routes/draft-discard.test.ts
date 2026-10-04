import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE, type SubmittedEvent } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { SCENARIO_NOW } from '../helpers/read-scenario.js';
import { scan } from '../purge/scan.js';
import { ev, newMarker, projectCreated, seedWorkspace, TYPE_ID } from '../purge/world.js';

/**
 * Drafts T5, the discard door over `POST /v1/events` and the post-commit hook that erases (28.100, 28.107). The
 * owner's ruling (2026-10-04) is the bar: discard ENDS a draft and erases it, so it is probed as every person who
 * is not the author, and each must get the answer an id that does not exist gets, with nothing erased behind it.
 */
let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const WS = (): string => read.world.workspaceId;
/** The raw answer of the real door to one event. */
async function post(role: ReadRole, type: string, id: string, payload: unknown) {
  return read.app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: read.authOf(role),
    payload: {
      events: [{
        id: newUlid(), workspaceId: WS(), entity: { kind: 'ticket', id }, type, version: 1, payload,
        actorId: read.userIds[role], origin: 'web', clientTime: SCENARIO_NOW.toISOString(),
      }],
    },
  });
}
async function send(role: ReadRole, type: string, id: string, payload: unknown): Promise<Record<string, unknown>> {
  const res = await post(role, type, id, payload);
  expect(res.statusCode, res.body).toBe(200);
  return (res.json() as { results: Array<Record<string, unknown>> }).results[0] ?? {};
}
const draft = (role: ReadRole, id: string, title = 'Quokka draft') =>
  send(role, 'ticket.created', id, {
    typeId: 'task', projectId: read.world.projectId, parentId: null, title, start: 'backlog', draft: true,
  });
const detail = (role: ReadRole, id: string) =>
  read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}/tickets/${id}`, headers: read.authOf(role) });
const purgedCount = async (id: string): Promise<number> =>
  (await db.pool.query(`SELECT 1 FROM purged_entities WHERE entity_kind = 'ticket' AND entity_id = $1`, [id])).rows.length;
const answer = (result: Record<string, unknown>) => ({ status: result['status'], rule: result['rule'], reason: result['reason'] });
const settle = () => new Promise((resolve) => setTimeout(resolve, 200));

/**
 * Nothing was erased or flagged: the row still names its author and is not discarded, its stream holds no
 * discard, the registry does not name it, and its author still opens it. Read after a pause, because the erasure
 * runs after the commit (a refused event never commits, so nothing should be running; the pause is the proof).
 */
async function expectNotErased(id: string, author: ReadRole): Promise<void> {
  await settle();
  const { rows: head } = await db.pool.query<{ draft_author_id: string | null; draft_discarded: boolean | null }>(
    'SELECT draft_author_id, draft_discarded FROM proj_tickets WHERE ticket_id = $1',
    [id],
  );
  expect(head).toEqual([{ draft_author_id: read.userIds[author], draft_discarded: null }]);
  const { rows: ends } = await db.pool.query(`SELECT 1 FROM events WHERE entity_id = $1 AND type = 'ticket.discarded'`, [id]);
  expect(ends).toEqual([]);
  expect(await purgedCount(id)).toBe(0);
  expect((await detail(author, id)).statusCode).toBe(200);
}

/** Everyone who is not the author of a `member`'s draft, on and off its project (the read world's role axis). */
const OTHERS = ['owner', 'admin', 'projectLead', 'guest', 'outsider'] as const;

describe('28.100 discard through the door erases', () => {
  it('erases the draft within a moment: not found, no column holds its title, one redacted creation, later events refused purge.erased; CONTROL: a published ticket is not discardable', async () => {
    const marker = newMarker();
    const id = newUlid();
    expect(await draft('member', id, `Quokka ${marker}`)).toMatchObject({ status: 'committed' });
    expect(Object.keys(await scan(db.pool, [marker]))).toEqual(expect.arrayContaining(['events.payload', 'proj_tickets.fields'])); // CONTROL: there is something to erase
    expect((await detail('member', id)).statusCode).toBe(200);

    expect(await send('member', 'ticket.discarded', id, {})).toMatchObject({ status: 'committed' });
    await expect.poll(() => purgedCount(id), { timeout: 10_000 }).toBe(1);

    expect((await detail('member', id)).statusCode).toBe(404);
    expect(await scan(db.pool, [marker])).toEqual({});
    // the id itself survives only in the redacted creation, the tombstone, the head (its stream position) and the registry
    expect(await scan(db.pool, [id])).toEqual({
      'events.entity_id': 2,
      'proj_entity_heads.entity_id': 1,
      'purged_entities.entity_id': 1,
    });
    const { rows } = await db.pool.query(`SELECT payload FROM events WHERE entity_id = $1 AND type = 'ticket.created'`, [id]);
    expect(rows).toEqual([{ payload: { projectId: read.world.projectId, purged: true, draft: true } }]);
    expect(await send('member', 'ticket.field_set', id, { fieldId: 'title', value: 'back from the dead' })).toMatchObject({
      status: 'refused', rule: PURGE_RULE,
    });

    // CONTROL: the author's discard of a PUBLISHED ticket is refused by the engine and erases nothing
    const twin = newUlid();
    expect(
      await send('member', 'ticket.created', twin, { typeId: 'task', projectId: read.world.projectId, parentId: null, title: 'Real one' }),
    ).toMatchObject({ status: 'committed' });
    expect(await send('member', 'ticket.discarded', twin, {})).toMatchObject({ status: 'refused', rule: 'draft.not-a-draft' });
    await settle();
    expect(await purgedCount(twin)).toBe(0);
    expect((await detail('member', twin)).statusCode).toBe(200);
  });

  it('the owner, an admin, a project lead, a guest and an outsider are each answered as for an unknown ticket and erase nothing; a stranger and another workspace\'s owner never commit; then the author discards (control)', async () => {
    const id = newUlid();
    expect(await draft('member', id)).toMatchObject({ status: 'committed' });
    const unknown = { status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON };
    for (const role of OTHERS) {
      const theirs = await send(role, 'ticket.discarded', id, {});
      expect(theirs, role).toMatchObject(unknown);
      // no oracle: the same words as an id that was never a ticket
      expect(answer(theirs), role).toEqual(answer(await send(role, 'ticket.discarded', newUlid(), {})));
    }
    for (const role of ['stranger', 'neighbour'] as const) {
      const res = await post(role, 'ticket.discarded', id, {});
      expect(res.body, role).not.toContain('"committed"');
    }
    await expectNotErased(id, 'member');

    expect(await send('member', 'ticket.discarded', id, {})).toMatchObject({ status: 'committed' }); // CONTROL: the author
    await expect.poll(() => purgedCount(id), { timeout: 10_000 }).toBe(1);
  });

  it('another member ON the project cannot discard a project lead\'s draft (the unknown-ticket answer, nothing erased); its author can', async () => {
    const id = newUlid();
    expect(await draft('projectLead', id)).toMatchObject({ status: 'committed' });
    const theirs = await send('member', 'ticket.discarded', id, {});
    expect(theirs).toMatchObject({ status: 'refused', rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON });
    expect(answer(theirs)).toEqual(answer(await send('member', 'ticket.discarded', newUlid(), {})));
    await expectNotErased(id, 'projectLead');
    expect(await send('projectLead', 'ticket.discarded', id, {})).toMatchObject({ status: 'committed' }); // CONTROL: the author
    await expect.poll(() => purgedCount(id), { timeout: 10_000 }).toBe(1);
  });
});

describe('28.107 the hook is wired', () => {
  /** A counting wrapper over `onEventCommitted`: how many listeners are live on the ingest the app was built over. */
  function counter() {
    let live = 0;
    return {
      get live(): number {
        return live;
      },
      observe(ingest: IngestService): void {
        const original = ingest.onEventCommitted.bind(ingest);
        ingest.onEventCommitted = (listener) => {
          live += 1;
          const unsubscribe = original(listener);
          let done = false;
          return () => {
            if (!done) live -= 1;
            done = true;
            unsubscribe();
          };
        };
      },
    };
  }

  /** A workspace holding drafts by one author, applied through the projections (no engine), before the app is asked anything. */
  async function draftsIn(...ids: string[]) {
    resetEntitySeqs();
    const base = await seedWorkspace(db.pool);
    const P = newUlid();
    const author = newUlid();
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Hook', 'HK'),
      ...ids.map((id) =>
        ev(base, 'ticket', id, 'ticket.created', { typeId: TYPE_ID, projectId: P, parentId: null, title: `d ${id}`, start: 'backlog', draft: true }, author),
      ),
    ]);
    const submit = (type: string, id: string, payload: unknown): SubmittedEvent => ({
      id: newUlid(), workspaceId: base.WS, entity: { kind: 'ticket', id }, type, version: 1, payload,
      actorId: author, origin: 'web', clientTime: '2026-10-04T06:00:00.000Z',
    });
    return { submit };
  }

  it('registers one listener only when the callback is supplied, calls it for ticket.discarded and nothing else, and unsubscribes on close', async () => {
    const without = counter();
    const plain = buildTestApp(db, { onDraftDiscarded: null, observeIngest: without.observe });
    await plain.app.ready();
    const baseline = without.live;
    await plain.app.close();
    const baselineAfterClose = without.live;

    const calls: string[] = [];
    const withHook = counter();
    const hooked = buildTestApp(db, {
      onDraftDiscarded: async (id) => {
        calls.push(id);
      },
      observeIngest: withHook.observe,
    });
    await hooked.app.ready();
    expect(withHook.live).toBe(baseline + 1);

    const [a, b, c] = [newUlid(), newUlid(), newUlid()];
    const world = await draftsIn(a, b, c);
    const [edited] = await hooked.ingest.ingestBatch([world.submit('ticket.field_set', a, { fieldId: 'title', value: 'x' })]);
    expect(edited?.status).toBe('committed');
    const [discarded] = await hooked.ingest.ingestBatch([world.submit('ticket.discarded', b, {})]);
    expect(discarded?.status).toBe('committed');
    await expect.poll(() => calls).toEqual([b]); // the discard, once; the edit never

    await hooked.app.close();
    expect(withHook.live).toBe(baselineAfterClose); // CONTROL: the baseline counted the same app's other listeners
    const [after] = await hooked.ingest.ingestBatch([world.submit('ticket.discarded', c, {})]);
    expect(after?.status).toBe('committed');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(calls).toEqual([b]); // closed: the listener is gone
  });

  it('a callback that throws does not fail the commit and surfaces no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    try {
      const hooked = buildTestApp(db, {
        onDraftDiscarded: async () => {
          throw new Error('boom');
        },
      });
      await hooked.app.ready();
      const d = newUlid();
      const world = await draftsIn(d);
      const [result] = await hooked.ingest.ingestBatch([world.submit('ticket.discarded', d, {})]);
      expect(result?.status).toBe('committed');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(unhandled).toEqual([]);
      await hooked.app.close();
    } finally {
      process.off('unhandledRejection', record);
    }
  });
});
