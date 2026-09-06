import { inspect } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope, type Notification } from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import type { CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { createNotificationFanout, type CanSeeFn } from '../../src/notifications/fanout.js';
import { listNotifications } from '../../src/notifications/store.js';
import { createInAppTransport, type NotificationTransport } from '../../src/notifications/transport.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const KIRO = '01J9GUKR000000000000000000';
const ANSELMA = '01J9GUAN000000000000000000';
/** A third party, mentioned alongside ANSELMA, who CAN see the ticket in every run. */
const DIPU = '01J9GUDP000000000000000000';
/**
 * The SERVER identity that files a contest. Not a decoration: `claim.contested`
 * is appended by the server on a sync-time refusal (coordination amendment 16),
 * so its `actorId` is the server and the refused claim's `actorId` is the
 * CLAIMANT — `sync/contest-coherence.ts` records that the two differ by design
 * and refuses to bind them. Every contested fixture below therefore keeps them
 * DIFFERENT. While they were the same user, addressing the notification to the
 * contest's own actor instead of the claimant's changed nothing observable,
 * and the one branch with no visibility gate was misroutable in silence.
 */
const SERVER = '01J9GSRV000000000000000000';

const visible = new Set<string>();
/**
 * Typed as `CanSeeFn`, never `as never`. The plan's draft cast this, which
 * would have hidden exactly the `Pool` → `Queryable` signature adaptation this
 * task made — a cast at the seam you are adapting is a cast over the evidence.
 */
const canSeeTicket: CanSeeFn = async (_db, userId, ticketId) => visible.has(`${userId}:${ticketId}`);

function fanout(
  transports?: NotificationTransport[],
  log?: (m: string, e?: unknown) => void,
  canSee?: CanSeeFn,
) {
  return createNotificationFanout({
    pool: db.pool,
    transports: transports ?? [createInAppTransport(db.pool)],
    canSeeTicket: canSee ?? canSeeTicket,
    now: () => new Date('2026-08-23T05:00:00.000Z'),
    log: log ?? (() => {}),
  });
}

/**
 * A transport that RECORDS what it was handed, which the file previously had no
 * way to see: the only fake here threw, and the in-app transport names its
 * routing parameter `_userId` and reads `notification.userId` instead. So
 * `deliverToAll` could pass any user id at all — a constant, the wrong loop
 * variable — and every row still landed in the right inbox, because the row
 * carries the recipient and the argument was read by nobody.
 *
 * It is not read by nobody for long: Plans 10 and 11 route a device by that
 * argument. Handed the wrong one, a mention arrives on the wrong person's
 * phone — the leak the visibility gate exists to prevent, through a door the
 * gate does not watch. Hence a recorder, and hence assertions on the ARGUMENT
 * rather than on the stored row.
 */
type DeliveryRecord = { userId: string; notification: Notification };
function recordingTransport(name = 'recorder'): { transport: NotificationTransport; delivered: DeliveryRecord[] } {
  const delivered: DeliveryRecord[] = [];
  return {
    delivered,
    transport: {
      name,
      deliver: async (userId, notification) => {
        delivered.push({ userId, notification });
      },
    },
  };
}

/**
 * `workflow_version` and `transitions` are NOT NULL on `proj_tickets`
 * (`migrations/1787961800000_proj-tickets.sql`). The plan's draft of this
 * helper named neither, so it could never have inserted a row; the column list
 * below follows `test/read/compile-filter.test.ts`'s working pattern.
 */
async function seedTicket(ticketId: string, assigneeId: string | null, title: string): Promise<void> {
  await db.pool.query(
    `INSERT INTO proj_tickets (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id,
       workflow_version, state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
     VALUES ($1, $2, $3, 'task', NULL, 'wf-basic', 1, 'doing', 'active', $4, '[]'::jsonb, $5, '[]'::jsonb)`,
    [
      ticketId,
      WS,
      PROJECT,
      assigneeId,
      JSON.stringify({
        title: {
          value: title,
          actorId: KIRO,
          clientTime: '2026-08-19T10:00:00.000Z',
          serverTime: '2026-08-19T10:00:01.000Z',
        },
      }),
    ],
  );
}

/**
 * `workspace_id` is selected, not just `payload`: `listNotifications` filters an
 * inbox by it, so a row written under the wrong workspace vanishes from the
 * right inbox while every payload assertion still passes. It was asserted by
 * nothing until a mutation to a wrong ULID stayed green across the whole suite.
 */
async function rowsFor(userId: string) {
  const result = await db.pool.query(
    'SELECT kind, workspace_id, dedupe_key, payload FROM notifications WHERE user_id = $1 ORDER BY id',
    [userId],
  );
  return result.rows as Array<{
    kind: string;
    workspace_id: string;
    dedupe_key: string;
    payload: Record<string, unknown>;
  }>;
}

/**
 * The SAME rows, read back the way the inbox reads them.
 *
 * `rowsFor` above goes straight to SQL, which is what makes the payload
 * assertions legible — and which is also why it cannot catch the failure that
 * matters most here: `insertNotification` only `JSON.stringify`s a payload,
 * while `parseNotification` (the read path, via `rowToNotification`) validates
 * it against a `.strict()` per-kind schema. A composed payload with one extra
 * or misnamed field WRITES cleanly and reads as a thrown error in the product.
 * Every kind this fan-out emits is therefore also asserted through here.
 */
async function inboxFor(userId: string): Promise<Notification[]> {
  const page = await listNotifications(db.pool, userId, { limit: 100 });
  return page.notifications;
}

async function totalNotificationRows(): Promise<number> {
  const total = await db.pool.query('SELECT count(*)::int AS n FROM notifications');
  return (total.rows[0] as { n: number }).n;
}

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
  await db.pool.query('DELETE FROM proj_tickets');
  visible.clear();
  visible.add(`${ANSELMA}:${TICKET}`);
  visible.add(`${KIRO}:${TICKET}`);
  visible.add(`${DIPU}:${TICKET}`);
});

function assigned(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.assigned',
    entity: { kind: 'ticket', id: TICKET },
    workspaceId: WS,
    actorId: KIRO,
    payload: { assigneeId: ANSELMA },
    ...overrides,
  });
}

describe('ticket.assigned', () => {
  it("notifies the assignee with the event's provenance", async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const env = assigned();
    const recorder = recordingTransport();
    await fanout([createInAppTransport(db.pool), recorder.transport]).onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('assignment');
    expect(rows[0]?.workspace_id).toBe(WS);
    expect(rows[0]?.dedupe_key).toBe(`assignment:${env.id}`);
    // The ROUTING ARGUMENT, which the stored row cannot speak for: a push
    // transport delivers to whoever this names.
    expect(recorder.delivered.map((d) => d.userId)).toEqual([ANSELMA]);
    expect(recorder.delivered[0]?.notification.userId).toBe(ANSELMA);
    expect(recorder.delivered[0]?.notification.workspaceId).toBe(WS);
    expect(rows[0]?.payload).toEqual({
      ticketId: TICKET,
      ticketTitle: 'Renew the DLT registration',
      assignedBy: KIRO,
      eventId: env.id,
      clientTime: env.clientTime,
      serverTime: env.serverTime,
    });
    // And the same row survives the strict read path the inbox uses.
    const inbox = await inboxFor(ANSELMA);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.kind).toBe('assignment');
  });

  it('self-assignment tells nobody', async () => {
    await seedTicket(TICKET, KIRO, 'Renew the DLT registration');
    await fanout().onCommitted(assigned({ payload: { assigneeId: KIRO } }));
    expect(await rowsFor(KIRO)).toHaveLength(0);
    // Positive control for the absence above: the same fan-out, same clock,
    // same transport DOES write when the assignee is somebody else.
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  /**
   * The `assigneeId === null` guard, pinned where the row count CANNOT pin it.
   *
   * Reading rows proved nothing about that guard: delete it and `null` flows
   * into `canSeeTicket`, whose fake answers false for an id nobody granted, so
   * the table is empty either way and the test passes for the wrong reason —
   * production's `canSee` is not this fake and is not what the guard is for.
   *
   * So the gate is made permissive here (everyone sees everything) and a
   * recording transport watches the ONE observable the guard actually governs:
   * whether a delivery is attempted at all. Deleting the guard now sends a
   * notification addressed to `null`.
   */
  it('unassignment (null) tells nobody — no delivery is even attempted', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const seesEverything: CanSeeFn = async () => true;
    const recorder = recordingTransport();
    await fanout([recorder.transport], undefined, seesEverything).onCommitted(
      assigned({ payload: { assigneeId: null } }),
    );
    // The recorder is the whole instrument here, and a row count deliberately
    // is not: with only the recorder wired, the table cannot hold a row under
    // any mutation, so `totalNotificationRows()` would be zero for a reason
    // that has nothing to do with the guard.
    expect(recorder.delivered).toEqual([]);
    // Positive control on the same permissive gate and the same recorder: a
    // non-null assignee IS delivered, so the emptiness above is the guard.
    await fanout([recorder.transport], undefined, seesEverything).onCommitted(assigned());
    expect(recorder.delivered.map((d) => d.userId)).toEqual([ANSELMA]);
    // And through the real transport, the row still lands for a real assignee.
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  it('an assignee who cannot see the ticket gets nothing — the notification is not a side door (planted defect)', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    visible.delete(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
    // Positive control from this same run: restore sight, replay, row lands.
    visible.add(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  it('delivering the same committed event twice yields one row (at-least-once safe, planted defect)', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const env = assigned();
    await fanout().onCommitted(env);
    await fanout().onCommitted(env);
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    // Positive control: a DIFFERENT committed event is a different dedupe key,
    // so the single row above is idempotence, not a write that never happened.
    await fanout().onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(2);
  });
});

describe('mentions', () => {
  /**
   * Mentions carry a `label`, which is what Plan 7's editor emits
   * (`MentionNodeAttrs = { userId, label? }`). It matters to the excerpt:
   * `docToPlainText` renders a mention as `@label`, falling back to `@userId`
   * when no label is present — its own doc comment names notifications as a
   * consumer of that behaviour.
   *
   * The plan's draft of this test asserted the excerpt was
   * `'please check the GST filing'`, with the mentions absent. That was written
   * before the renderer existed and is not what any caller of `docToPlainText`
   * can get. Corrected here to the renderer's real output rather than by
   * stripping mentions in the fan-out — the product has exactly one
   * document-to-text function, shared with the search projection, and a second
   * private one would be two things to keep in step for a cosmetic gain.
   */
  const body = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { userId: ANSELMA, label: 'Anselma' } },
          { type: 'text', text: ' please check the GST filing ' },
          { type: 'mention', attrs: { userId: KIRO, label: 'Kiro' } },
        ],
      },
    ],
  };

  /** No labels — pins the `@userId` fallback the renderer documents. */
  const bodyWithoutLabels = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { userId: ANSELMA } },
          { type: 'text', text: ' please check the GST filing' },
        ],
      },
    ],
  };

  /** ANSELMA (gated in the silence test), DIPU (always visible), KIRO (the author). */
  const bodyWithThird = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'mention', attrs: { userId: ANSELMA } },
          { type: 'text', text: ' and ' },
          { type: 'mention', attrs: { userId: DIPU } },
          { type: 'text', text: ' please check the GST filing' },
          { type: 'mention', attrs: { userId: KIRO } },
        ],
      },
    ],
  };

  function commented(doc: unknown, overrides: Partial<EventEnvelope> = {}): EventEnvelope {
    return makeEnvelope({
      type: 'comment.added',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: KIRO,
      payload: { body: doc },
      ...overrides,
    });
  }

  /**
   * The payload is asserted WHOLE, the way the assignment payload always was.
   *
   * Field-by-field assertions had left three values constrained by nothing:
   * `ticketId`, `ticketTitle` and the row's `workspace_id` each survived a
   * mutation to a wrong constant across the entire server suite. None of the
   * three is cosmetic. The visibility gate is applied to `env.entity.id` while
   * the payload carries `ticketId`, and nothing else in the file says they are
   * the same ticket — a payload naming a DIFFERENT ticket would be a row that
   * passed a gate about one ticket and points the reader at another.
   * `workspace_id` is what `listNotifications` filters an inbox by, so a wrong
   * one silently removes the row from the inbox it was written for.
   *
   * A whole-object `toEqual` also fails on an ADDED field, which is the shape
   * of the leak the ruling test guards from the other side.
   */
  it('notifies each mentioned user except the author, with an excerpt', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const env = commented(body);
    const recorder = recordingTransport();
    await fanout([createInAppTransport(db.pool), recorder.transport]).onCommitted(env);
    expect(await rowsFor(KIRO)).toHaveLength(0); // the author mentioned themselves — nothing to tell
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('mention');
    expect(rows[0]?.workspace_id).toBe(WS);
    expect(rows[0]?.dedupe_key).toBe(`mention:${env.id}:${ANSELMA}`);
    // The excerpt is the shared renderer's output verbatim: mentions render as
    // `@label`, so the recipient reads the comment as it was written rather
    // than a version with the addressees silently removed.
    expect(rows[0]?.payload).toEqual({
      ticketId: TICKET,
      ticketTitle: 'Renew the DLT registration',
      mentionedBy: KIRO,
      eventId: env.id,
      source: 'comment',
      excerpt: '@Anselma please check the GST filing @Kiro',
      clientTime: env.clientTime,
      serverTime: env.serverTime,
    });
    // The routing argument, which no stored row can speak for: exactly one
    // delivery, to the mentioned user and not the author.
    expect(recorder.delivered.map((d) => d.userId)).toEqual([ANSELMA]);
    expect(recorder.delivered[0]?.notification.userId).toBe(ANSELMA);
    expect(recorder.delivered[0]?.notification.workspaceId).toBe(WS);
    const inbox = await inboxFor(ANSELMA);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.kind).toBe('mention');
  });

  it('an unlabelled mention falls back to @userId in the excerpt', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    await fanout().onCommitted(commented(bodyWithoutLabels));
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload['excerpt']).toBe(`@${ANSELMA} please check the GST filing`);
  });

  it('a description edit carries mentions too, as source description', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const env = makeEnvelope({
      type: 'ticket.field_set',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: KIRO,
      payload: { fieldId: 'description', value: body },
    });
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload['source']).toBe('description');
  });

  it('a mentioned user who cannot see the ticket gets nothing (planted defect)', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    visible.delete(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(commented(body));
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
    // Positive control from the same run: sight restored, a fresh event lands.
    visible.add(`${ANSELMA}:${TICKET}`);
    await fanout().onCommitted(commented(body));
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  /**
   * THE RULING'S OWN TEST — the one the delivery tests above cannot stand in for.
   *
   * A system with no gate at all passes every delivery test on this file. What
   * distinguishes it is that refusing a mention must be INDISTINGUISHABLE, to
   * the mentioning user, from honouring one: the gate must not become a probe
   * for who can see a ticket.
   *
   * Two different mutations break two different assertions here, which is why
   * they are one test and not five:
   *   - gate DELETED        → (a) reddens: ANSELMA gets a row.
   *   - gate LEAKY (a count in the payload, the unreachable id in the log,
   *     a refusal row back to the author) → (b)/(c)/(e) redden.
   *
   * Timing is deliberately not asserted with a harness. Nothing inside the
   * fan-out could make delivery and refusal take equal time; what makes timing
   * unobservable to the actor is the boot wiring — the listener is invoked
   * fire-and-forget AFTER the commit, so no response waits on any of this. That
   * property is pinned by the 'boot wiring' describe at the bottom of this file,
   * not here.
   */
  it("RULING: an unreachable mention is silent — same log, same payloads, no tell to the mentioner", async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');

    // World 1: everyone can see. Record what the reachable recipient receives.
    const allVisibleEnv = commented(bodyWithThird);
    const allVisibleLog: string[] = [];
    await fanout(undefined, (m) => allVisibleLog.push(m)).onCommitted(allVisibleEnv);
    const dipuWhenAllVisible = (await rowsFor(DIPU)).map((r) => r.payload);
    const totalWhenAllVisible = await totalNotificationRows();
    expect(dipuWhenAllVisible).toHaveLength(1);
    expect(await rowsFor(ANSELMA)).toHaveLength(1);

    // World 2: identical event content, ANSELMA cannot see the ticket.
    await db.pool.query('DELETE FROM notifications');
    visible.delete(`${ANSELMA}:${TICKET}`);
    const gatedEnv = commented(bodyWithThird);
    const gatedLog: string[] = [];
    await fanout(undefined, (m) => gatedLog.push(m)).onCommitted(gatedEnv);

    // (a) The refused recipient learns nothing, and neither does anyone reading
    //     their inbox: the gate is real.
    expect(await rowsFor(ANSELMA)).toHaveLength(0);

    // (b) The REACHABLE recipient's row is byte-identical to world 1's, modulo
    //     the event id that necessarily differs. No "delivered to 2 of 3", no
    //     recipient roster, no count — nothing in a delivered payload records
    //     that a sibling delivery was refused.
    const dipuWhenGated = (await rowsFor(DIPU)).map((r) => r.payload);
    expect(dipuWhenGated).toHaveLength(1);
    expect({ ...dipuWhenGated[0], eventId: null }).toEqual({ ...dipuWhenAllVisible[0], eventId: null });

    // (c) Nothing was logged. A log line naming ANSELMA would answer, to anyone
    //     with log access, the very question the gate refuses to answer.
    //     The 'resilience' describe below is this assertion's positive control:
    //     the same `log` seam DOES capture a message when one is emitted.
    expect(gatedLog).toEqual([]);
    expect(allVisibleLog).toEqual([]);

    // (d) The suppressed row is the ONLY difference in the whole table.
    expect(await totalNotificationRows()).toBe(totalWhenAllVisible - 1);

    // (e) The mentioning user gets no bounce, no failure notice, no receipt.
    expect(await rowsFor(KIRO)).toHaveLength(0);
  });

  /**
   * PER-RECIPIENT ISOLATION, and the three worlds that tell it apart from a
   * batch that aborts.
   *
   * The 'resilience' describe below pins a throwing `canSeeTicket` with ONE
   * recipient, where "contained, no rows" and "the whole batch was abandoned"
   * are the same observation. They are not the same behaviour. With a single
   * catch around the loop, a lookup that throws for the FIRST-named recipient
   * drops that recipient and everyone named after them, so who receives a
   * mention would be settled by the order the names happen to sit in the prose
   * — an order-dependent outcome on a disclosure path, decided by an author's
   * typing rather than by any rule.
   *
   * The discriminator is world 2's DIPU: one row under isolation, zero under
   * batch-abort. Worlds 1 and 3 agree under both, and are here so the test says
   * what the rule IS (the recipient who failed is the only one who loses out)
   * rather than merely that one arrangement produces one number.
   */
  it('a lookup that throws for one mentioned user does not silence the others — who fails decides, not who was named first', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    const explodingFor =
      (victim: string): CanSeeFn =>
      async (_db, userId, ticketId) => {
        if (userId === victim) throw new Error('visibility resolver is down');
        return visible.has(`${userId}:${ticketId}`);
      };

    // BOTH log arguments are captured, not just the message. The seam is
    // `(message, error?)` and the production default is
    // `console.error(message, error)`, so a leak that moves the recipient into
    // the second argument — `log(msg, { userId, error })` — reaches a real log
    // file exactly as a leak in the first would, while a spy that keeps only
    // messages sees nothing. `inspect` is used rather than `JSON.stringify`
    // because an `Error` serialises to `{}` and would hide anything hung off it.
    const named = (entries: Array<{ message: string; error?: unknown }>, userId: string): boolean =>
      entries.some((e) => e.message.includes(userId) || inspect(e.error, { depth: 6 }).includes(userId));

    // World 1 — nothing throws. Both mentioned non-authors are reached.
    const calmLog: Array<{ message: string; error?: unknown }> = [];
    await fanout(undefined, (message, error) => calmLog.push({ message, error })).onCommitted(
      commented(bodyWithThird),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    expect(await rowsFor(DIPU)).toHaveLength(1);
    expect(calmLog).toEqual([]);

    // World 2 — the FIRST-named recipient's lookup throws. This is the world
    // that distinguishes: a batch-aborting fan-out leaves DIPU with nothing.
    await db.pool.query('DELETE FROM notifications');
    const firstLog: Array<{ message: string; error?: unknown }> = [];
    await expect(
      fanout(undefined, (message, error) => firstLog.push({ message, error }), explodingFor(ANSELMA)).onCommitted(
        commented(bodyWithThird),
      ),
    ).resolves.toBeUndefined();
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
    expect(await rowsFor(DIPU)).toHaveLength(1);

    // World 3 — the SECOND-named recipient's lookup throws. The first still
    // has their row, and the loss lands on the recipient who actually failed.
    await db.pool.query('DELETE FROM notifications');
    const secondLog: Array<{ message: string; error?: unknown }> = [];
    await fanout(undefined, (message, error) => secondLog.push({ message, error }), explodingFor(DIPU)).onCommitted(
      commented(bodyWithThird),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    expect(await rowsFor(DIPU)).toHaveLength(0);

    // The failure is recorded rather than swallowed — and the record names the
    // EVENT, never the recipient. A lookup that fails must not answer the
    // question the gate above refuses to answer, and "the resolver was down for
    // this one person" answers it as plainly as a refusal would.
    expect(firstLog.length).toBeGreaterThan(0);
    expect(secondLog.length).toBeGreaterThan(0);
    expect(named(firstLog, ANSELMA)).toBe(false);
    expect(named(secondLog, DIPU)).toBe(false);
    // The control for the two assertions above: this spy DOES see an id when
    // one is passed, in either argument. Without it, `named` returning false
    // would be equally consistent with a spy that reads nothing.
    expect(named([{ message: `failed for ${ANSELMA}` }], ANSELMA)).toBe(true);
    expect(named([{ message: 'failed', error: { userId: ANSELMA } }], ANSELMA)).toBe(true);
    // And the mentioning author is told nothing either way.
    expect(await rowsFor(KIRO)).toHaveLength(0);
  });

  /**
   * The plan's draft of this test set `dueDate` to `{ date: '2026-08-30' }` —
   * a value with no mention nodes in it. Mutation testing caught that: deleting
   * the `fieldId === 'description'` discriminator entirely left the whole suite
   * green, because `extractMentionedUserIds` returned `[]` for that value and
   * nothing would have been delivered either way. The test named a property it
   * did not constrain.
   *
   * So a NON-description field is set here to a document that DOES carry
   * mentions. Now the only thing standing between that document and a
   * notification is the discriminator, and deleting it reddens this test.
   */
  it('a field_set that is not the description is not a mention source, even when its value carries mentions', async () => {
    await seedTicket(TICKET, null, 'Renew the DLT registration');
    await fanout().onCommitted(
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: KIRO,
        payload: { fieldId: 'acceptanceCriteria', value: body },
      }),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
    // And the plain non-document case, which must also stay silent.
    await fanout().onCommitted(
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: KIRO,
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      }),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(0);
    // Positive control: the same field_set handler, pointed at `description`
    // with the same mention doc, does write — so the absence above is the
    // fieldId discriminating, not the handler being dead.
    await fanout().onCommitted(
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: KIRO,
        payload: { fieldId: 'description', value: body },
      }),
    );
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });
});

describe('claim.contested (amendment 16 — Plan 10 emits; the payload shape is an Open-questions pin)', () => {
  /**
   * CONTESTER != CLAIMANT, which is the normal case and was not the case here.
   *
   * Both fixtures on this file used to set the envelope's `actorId` and the
   * embedded claim's `actorId` to the same user, so the notification's
   * addressee — `originalEvent.actorId`, the claimant — could be swapped for
   * `env.actorId`, the contest's own actor, and the whole suite stayed green.
   * That is a misrouting of the ONE branch with no visibility gate: rule,
   * reason, ticketId and another person's claim provenance handed to someone
   * who did not author them. Amendment 16 has the server file the contest
   * (`sync/contest-coherence.ts` refuses to bind the two actors precisely
   * because they differ), so the fixture now says so.
   */
  function contested(overrides: { contesterId?: string } = {}): EventEnvelope {
    return makeEnvelope({
      type: 'claim.contested',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: overrides.contesterId ?? SERVER,
      payload: {
        originalEvent: {
          id: '01J9GEVT000000000000000001',
          type: 'ticket.transitioned',
          actorId: ANSELMA,
          clientTime: '2026-08-22T18:00:00.000Z',
        },
        rule: 'require-evidence',
        reason: 'This move must carry an attachment as evidence, and none was provided.',
      },
    });
  }

  it("notifies the original claimant — not the contest's actor — with rule, reason, and their own claim's provenance", async () => {
    const env = contested();
    const recorder = recordingTransport();
    await fanout([createInAppTransport(db.pool), recorder.transport]).onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('contested-claim');
    expect(rows[0]?.workspace_id).toBe(WS);
    expect(rows[0]?.dedupe_key).toBe(`contested-claim:${env.id}`);
    // The addressee, stated twice over: the server that FILED the contest is
    // told nothing, and the routing argument a push transport would use names
    // the claimant. This branch has no visibility gate, so the addressee is
    // the only thing standing between the payload and the wrong reader.
    expect(await rowsFor(SERVER)).toHaveLength(0);
    expect(recorder.delivered.map((d) => d.userId)).toEqual([ANSELMA]);
    expect(recorder.delivered[0]?.notification.userId).toBe(ANSELMA);
    expect(rows[0]?.payload).toEqual({
      ticketId: TICKET,
      rule: 'require-evidence',
      reason: 'This move must carry an attachment as evidence, and none was provided.',
      claim: {
        eventId: '01J9GEVT000000000000000001',
        type: 'ticket.transitioned',
        actorId: ANSELMA,
        clientTime: '2026-08-22T18:00:00.000Z',
      },
      contestEventId: env.id,
      serverTime: env.serverTime,
    });
    const inbox = await inboxFor(ANSELMA);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.kind).toBe('contested-claim');
  });

  /**
   * The ABSENCE of a gate here is a decision, not an oversight, so it gets a
   * test — otherwise a later "consistency" edit that adds `canSee` to this
   * branch passes the whole file. The payload is the claimant's own refused
   * event echoed back (rule, reason, their claim's provenance) and carries no
   * title, so it discloses nothing they did not already author.
   */
  it('reaches the claimant even with no visibility at all — the echo is their own claim, not the ticket', async () => {
    visible.clear();
    await fanout().onCommitted(contested());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
  });

  /**
   * NO SELF-EXCLUSION here, unlike assignment and mention — also a decision,
   * and one that was pinned only by accident for as long as every fixture made
   * contester and claimant the same user. Now that they differ, a
   * `if (original.actorId === env.actorId) return;` added to `handleContested`
   * for symmetry with the other two branches would pass every other test on
   * this file, so the degenerate case is asserted on its own.
   *
   * The rule it states: self-assignment tells you what you just did, but a
   * refusal is not something the claimant did — it is the fact the message
   * exists to deliver. Whoever the contest is attributed to, the claimant is
   * told their claim was refused.
   */
  it("a contest filed under the claimant's own identity still reaches them — this branch excludes nobody", async () => {
    const env = contested({ contesterId: ANSELMA });
    await fanout().onCommitted(env);
    const rows = await rowsFor(ANSELMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe('contested-claim');
    expect(rows[0]?.dedupe_key).toBe(`contested-claim:${env.id}`);
  });

  it('a payload that does not match the pinned shape is logged and sends nothing', async () => {
    const logged: string[] = [];
    await fanout(undefined, (m) => logged.push(m)).onCommitted(
      makeEnvelope({
        type: 'claim.contested',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: ANSELMA,
        payload: { rule: 'require-evidence' }, // no originalEvent, no reason
      }),
    );
    expect(await totalNotificationRows()).toBe(0);
    expect(logged.some((m) => m.includes('claim.contested'))).toBe(true);
  });
});

describe('resilience', () => {
  it('a failing transport is logged and isolated; the in-app row still lands; onCommitted resolves', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const logged: string[] = [];
    const broken: NotificationTransport = {
      name: 'broken-push',
      deliver: async () => {
        throw new Error('socket closed');
      },
    };
    await fanout([broken, createInAppTransport(db.pool)], (m) => logged.push(m)).onCommitted(assigned());
    expect(await rowsFor(ANSELMA)).toHaveLength(1);
    expect(logged.some((m) => m.includes('broken-push'))).toBe(true);
  });

  /**
   * The OUTER catch in `onCommitted`, which nothing else in this file reaches.
   *
   * `deliverToAll`'s own catch swallows a transport failure before it can climb
   * any higher, and no other test makes `canSeeTicket`, the title lookup or a
   * parse throw — so without this test the outer `try/catch` is an unconstrained
   * path, in precisely the branch the disclosure ruling depends on. It is also
   * on-ruling in its own right: a visibility lookup that fails must produce
   * silence, not an ingest failure and not a differently-shaped outcome the
   * actor could observe.
   */
  it('a visibility lookup that throws is contained: no rejection, no rows, and it is logged', async () => {
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const logged: string[] = [];
    const exploding = createNotificationFanout({
      pool: db.pool,
      transports: [createInAppTransport(db.pool)],
      canSeeTicket: async () => {
        throw new Error('visibility resolver is down');
      },
      now: () => new Date('2026-08-23T05:00:00.000Z'),
      log: (m) => logged.push(m),
    });
    await expect(exploding.onCommitted(assigned())).resolves.toBeUndefined();
    expect(await totalNotificationRows()).toBe(0);
    expect(logged.some((m) => m.includes('fan-out failed'))).toBe(true);
  });

  it('an event type the fan-out does not know is silently no work', async () => {
    await fanout().onCommitted(
      makeEnvelope({
        type: 'workspace.renamed',
        entity: { kind: 'workspace', id: WS },
        workspaceId: WS,
        actorId: KIRO,
        payload: { name: 'X' },
      }),
    );
    expect(await totalNotificationRows()).toBe(0);
    // Positive control: a type the fan-out DOES know, through the same fan-out
    // and the same table, writes — so the zero above is the switch, not a
    // transport that never worked.
    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    await fanout().onCommitted(assigned());
    expect(await totalNotificationRows()).toBe(1);
  });
});

/**
 * The wiring, pinned.
 *
 * Task 5 Step 7's own check is "typecheck and run the suite", which CANNOT fail
 * if the listener is never subscribed — the same shape as the once-dead
 * `registerAttachmentRoutes`, where a correctly-written module was reachable
 * from nothing and every test still passed. (That one has since been wired:
 * `src/app.ts` registers it and `test/routes/attachments-wired.test.ts` is the
 * test that can fail on it. The shape it illustrates is what this note is
 * about, and it is unchanged by the fix.) So this asserts the subscription
 * exists, and that what it is handed actually produces a row.
 *
 * It also carries the fire-and-forget property the silence ruling leans on:
 * `buildApp` registers a listener whose return value it does not await, so no
 * request can wait on — or be timed against — a notification decision.
 */
describe('boot wiring (adaptation: the hook is app.ts, not index.ts)', () => {
  it('buildApp subscribes the fan-out to committed events, and the listener delivers', async () => {
    const listeners: CommittedEventListener[] = [];
    const recordingIngest: IngestService = {
      ingestBatch: async () => [],
      ingestClientBatch: async () => [],
      // The returned function REMOVES the listener, where this fake used to
      // return `() => {}`. A no-op unsubscribe makes the `onClose` hook in
      // `app.ts` untestable by construction: whether or not the hook exists,
      // whether or not it is ever called, this fake's listener list looks
      // identical afterwards. The comment on that hook makes a concrete claim
      // — that without it a second app over one ingest service delivers every
      // later commit twice — and a fake that cannot tell the two worlds apart
      // is not evidence for it.
      onEventCommitted: (listener) => {
        listeners.push(listener);
        return () => {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        };
      },
    };
    const app = buildApp({
      db: { query: async () => [{ ok: 1 }] },
      pool: db.pool,
      ingest: recordingIngest,
      auth: createAuth({
        pool: db.pool,
        otpSender: new LogOtpSender(() => {}),
        magicLinkSender: new LogMagicLinkSender(() => {}),
        baseUrl: 'http://localhost:3000',
        secret: 'test-secret-not-used-anywhere-real',
        // The browser's origin, so better-auth trusts the product's own client.
        webOrigin: 'http://localhost:3001',
      }),
      serverAppend: async () => [],
      webOrigin: 'http://localhost:3001',
      // Required on `AppDeps`, and free here: a `LocalDiskStore` constructor
      // touches no filesystem, and nothing in this file uploads anything.
      store: createObjectStoreFromEnv({}),
    });

    // Two subscribers: Plan 5's stream hub and this plan's notification fan-out.
    // Asserted as a lower bound with the delivery below as the real proof — a
    // count alone would pass for the wrong listener.
    expect(listeners.length).toBeGreaterThanOrEqual(2);

    await seedTicket(TICKET, ANSELMA, 'Renew the DLT registration');
    const env = { ...assigned(), workspaceSeq: 1 };
    // The real `canSee` runs here (no seam is injected at boot), and ANSELMA has
    // no `proj_visibility` row — which answers false, so the gate correctly
    // suppresses. Grant sight the only way boot honours: assert instead that the
    // listener RAN by watching the branch that needs no visibility at all.
    // Contester (the server) and claimant (ANSELMA) differ here too — the
    // notification below is addressed to the claimant, and a fixture where the
    // two are one user cannot tell that from the opposite.
    const contestEnv = {
      ...makeEnvelope({
        type: 'claim.contested',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: SERVER,
        payload: {
          originalEvent: {
            id: '01J9GEVT000000000000000002',
            type: 'ticket.transitioned',
            actorId: ANSELMA,
            clientTime: '2026-08-22T18:00:00.000Z',
          },
          rule: 'require-evidence',
          reason: 'No evidence was attached.',
        },
      }),
      workspaceSeq: 2,
    };
    for (const listener of listeners) listener(contestEnv);
    // The listener is fire-and-forget by design, so give the microtask queue and
    // the insert a turn before reading. A row that never arrives fails here.
    await expect.poll(async () => (await rowsFor(ANSELMA)).length, { timeout: 5000 }).toBe(1);
    expect((await rowsFor(ANSELMA))[0]?.dedupe_key).toBe(`contested-claim:${contestEnv.id}`);

    // Positive control on the gate at boot: the assignment for a user with no
    // visibility row is suppressed by the REAL `canSee`, not by a missing wire —
    // the contested row above proves the wire is live in this very app.
    //
    // The suppression is read AFTER a later commit has been seen to land, not
    // after a poll for zero: `expect.poll(...).toBe(0)` returns on its first
    // passing check, so it waits for nothing and cannot tell "the gate
    // suppressed it" from "the insert has not happened yet". A second contest
    // fired after the assignment gives the fire-and-forget listener a real
    // turn — when the second event's row is in the table, the first event's
    // would be too.
    for (const listener of listeners) listener(env);
    const secondContest = {
      ...makeEnvelope({
        type: 'claim.contested',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: SERVER,
        payload: {
          originalEvent: {
            id: '01J9GEVT000000000000000003',
            type: 'ticket.transitioned',
            actorId: ANSELMA,
            clientTime: '2026-08-22T18:00:00.000Z',
          },
          rule: 'require-evidence',
          reason: 'No evidence was attached.',
        },
      }),
      workspaceSeq: 3,
    };
    for (const listener of listeners) listener(secondContest);
    await expect
      .poll(async () => (await rowsFor(ANSELMA)).some((r) => r.dedupe_key === `contested-claim:${secondContest.id}`), {
        timeout: 5000,
      })
      .toBe(true);
    // Waited on the LATER event's arrival, then asserted about the earlier one:
    // the assignment was handed to the same listeners first, so if the gate had
    // let it through its row would be here by now.
    expect((await rowsFor(ANSELMA)).filter((r) => r.kind === 'assignment')).toEqual([]);

    // CLOSING THE APP LETS THE COMMIT FEED GO — the `onClose` hook beside the
    // fan-out, whose comment claims a concrete failure (several apps over one
    // ingest service would deliver every later commit once per app ever built)
    // and which, until this line, was asserted by nothing at all.
    //
    // Stated as "no subscription survives" rather than as a count going down:
    // the stream hub closes its own subscription in its own hook, so a count
    // that merely shrinks stays green with the fan-out's hook deleted.
    await app.close();
    expect(listeners).toEqual([]);

    // And behaviourally, with a positive control so the silence means
    // something: a commit arriving after close reaches no subscriber, while
    // the very same event handed to a live fan-out over the same pool writes.
    await db.pool.query('DELETE FROM notifications');
    const afterCloseEnv = {
      ...makeEnvelope({
        type: 'claim.contested',
        entity: { kind: 'ticket', id: TICKET },
        workspaceId: WS,
        actorId: SERVER,
        payload: {
          originalEvent: {
            id: '01J9GEVT000000000000000005',
            type: 'ticket.transitioned',
            actorId: ANSELMA,
            clientTime: '2026-08-22T18:00:00.000Z',
          },
          rule: 'require-evidence',
          reason: 'No evidence was attached.',
        },
      }),
      workspaceSeq: 3,
    };
    for (const listener of listeners) listener(afterCloseEnv);
    // A DIFFERENT event through a live fan-out, awaited: it is the positive
    // control AND the wait. `expect.poll(...).toBe(0)` would be no wait at all
    // here — it returns on its first passing check, so it cannot distinguish
    // "nothing was delivered" from "the insert has not happened yet". Running
    // an equivalent delivery to completion on the same pool gives the fired
    // listener's insert its turn, and its dedupe key is distinct so the two
    // could never collapse into one row.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const controlEnv = makeEnvelope({
      type: 'claim.contested',
      entity: { kind: 'ticket', id: TICKET },
      workspaceId: WS,
      actorId: SERVER,
      payload: {
        originalEvent: {
          id: '01J9GEVT000000000000000004',
          type: 'ticket.transitioned',
          actorId: ANSELMA,
          clientTime: '2026-08-22T18:00:00.000Z',
        },
        rule: 'require-evidence',
        reason: 'No evidence was attached.',
      },
    });
    await fanout().onCommitted(controlEnv);
    const afterClose = await rowsFor(ANSELMA);
    expect(afterClose.map((r) => r.dedupe_key)).toEqual([`contested-claim:${controlEnv.id}`]);
  });
});
