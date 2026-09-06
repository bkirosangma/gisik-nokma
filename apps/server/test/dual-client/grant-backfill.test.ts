import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, plainTextToDoc, type SubmittedEvent } from '@gisik-nokma/domain';
import type { SyncItem } from '@gisik-nokma/sync-client';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import {
  createHarness,
  TASK_TYPE_ID,
  USER_A,
  USER_B,
  type Harness,
  type HarnessClient,
} from './rig.js';

/**
 * Closure 5's GRANT half against two real replicas (ruling P37, reshaped by
 * P37.1, 2026-09-06).
 *
 * `test/visibility/grant-backfill.test.ts` carries who is named and which
 * tickets the walk reaches; those are questions about a generator. THESE three
 * are questions about a REPLICA and an engine, and none can be asked anywhere
 * else:
 *
 * - **12.275 is case 12.274's own probe, re-aimed.** 12.274 recorded a PRODUCT
 *   DEFECT measured twice — narrow, one unrelated visible commit, re-widen, and
 *   client B ends holding 2 events where the server holds 4, permanently, with
 *   no purge, no backfill and no resync path. P37 constraint 3 makes that probe
 *   the GREEN case. Under P37.1 it is green **only with both halves of closure
 *   5 in the script**, and that is a finding rather than a formality — see the
 *   case's own comment.
 * - **12.276 measures the over-delivery P37.1 made cheap.** Under the push
 *   shape over-delivery meant a whole history re-sent to a client that held it,
 *   and the acceptability condition was replay idempotence. The notice shape
 *   moves the cost: the server NAMES a ticket the client may already hold, and
 *   a client that holds it fetches nothing. So the measurement is the PULL
 *   COUNT, taken from the transport, with the notice itself witnessed on the
 *   wire so a zero cannot be a notice that never arrived.
 * - **12.289 is the NARROW half's client-presented path**, unchanged in
 *   substance by P37.1 and the one case that reaches `reconcileHeldIds`
 *   itself.
 *
 * ## How a pull is observed here, and why it is not the harness marking its own homework
 *
 * The rig's `syncDown()` is not the engine, and the difference used to be
 * invisible: a `reach-granted` reaching it made the replica RECORD ids in its
 * durable pending set (`applyInstruction`'s arm calls `addPendingPulls` and
 * stops, deliberately — fetching is not the store's job) and nothing fetched
 * them. So `syncDown()` now MIRRORS `sync-engine.ts`'s `drainPendingPulls` at
 * both of the engine's own sites — inside `applyOne` on a `reach-granted`, and
 * again in `onCaughtUp` ahead of the cursor write. The mirror is forced, not
 * chosen: the engine's drain is a closure behind `if (stopped || …) return`,
 * and `stopped` is cleared only by `start()`, which these clients never call
 * because their `openStream` throws on purpose. `rig.ts`'s docblock on that
 * function carries the full argument.
 *
 * What that leaves measuring the PRODUCT rather than the rig is the split
 * itself: the decision *which named ids are owed* lives entirely in
 * `replica.ts`'s `reach-granted` arm — it is the replica that asks
 * `getTicket(id) === null` and records only the misses — and every assertion
 * below is on that decision's consequences. The rig contributes the loop that
 * fetches whatever the replica said it wanted, and the count of requests that
 * loop made.
 */

let h: Harness;
let a: HarnessClient;
let b: HarnessClient;

beforeEach(async () => {
  h = await createHarness();
  a = await h.client(USER_A);
  b = await h.client(USER_B);
});

afterEach(async () => {
  await h.drop();
});

function ticketEvent(actorId: string, ticketId: string, type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: h.workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId,
    origin: actorId === USER_A ? 'desktop' : 'mobile',
  });
}

async function commit(userId: string, event: SubmittedEvent): Promise<void> {
  const [result] = await h.ingestInteractive(userId, [event]);
  expect(result, `${event.type} by ${userId} should commit`).toMatchObject({
    status: 'committed',
    eventId: event.id,
  });
}

/**
 * The instructions off one `syncDown()`, whole. Whole objects rather than a
 * projection of them, because `reach-granted`'s payload IS the case: a notice
 * naming the wrong workspace, or one extra id, is the disclosure this shape
 * risks and a `.map(i => i.kind)` would report it as correct.
 */
function instructionsOf(items: readonly SyncItem[]): SyncItem[] {
  return items.filter((item) => 'kind' in item);
}

/** The envelope ids off one `syncDown()`, in arrival order. */
function envelopeIdsOf(items: readonly SyncItem[]): string[] {
  return items.flatMap((item) => ('kind' in item ? [] : [item.id]));
}

/** A root ticket both members can see — no authored visibility, so `'project'` mode. */
async function seedSharedTicket(title: string): Promise<{ ticketId: string; created: SubmittedEvent }> {
  const ticketId = newUlid();
  const created = ticketEvent(USER_A, ticketId, 'ticket.created', {
    typeId: TASK_TYPE_ID,
    projectId: h.projectId,
    parentId: null,
    title,
  });
  await commit(USER_A, created);
  await a.syncDown();
  await b.syncDown();
  expect((await b.replica.getTicket(ticketId))?.confirmed?.stateId).toBe('todo');
  return { ticketId, created };
}

describe('closure 5 — the copy nobody gives back, against two replicas', () => {
  /**
   * ## THE HEADLINE IS NOT "the grant half closes 12.274". IT DOES NOT, ALONE
   *
   * P37.1 inverted the grant half into a NOTICE the client pulls against, and
   * the client's filter is `getTicket(id) === null` — *do I hold this?*
   * (`replica.ts`, the `reach-granted` arm). That filter is what makes a
   * repeated no-op widening free, and it is also what makes this script's
   * naive form green-looking and false: 12.274's B holds a STALE PARTIAL copy
   * of the narrowed ticket right through the narrowing, because **a narrowing
   * purges nothing** — the per-event purge walk was struck on case 6.101 and
   * the residual is 6.104, recorded at 12.271 and not reopened by P37. So the
   * re-widening's notice names a ticket B "holds", `missing` is empty, nothing
   * is fetched, and B ends on `[created, widen]` against the server's four —
   * 12.274's defect exactly, wearing closure 5's clothes.
   *
   * What actually closes it is the two halves in the order the engine runs
   * them: `reconcile` (the NARROW half) purges the stale copy at catch-up, and
   * the later notice then finds a ticket B does not hold and pulls it whole.
   * `onCaughtUp` is where that sequence lives in the product — drain, cursor,
   * flush, reconcile — so the `reconcile` call below is a step of the real
   * path and not a convenience, but it is ASSERTED as a step (its answer is
   * pinned) rather than slipped in as setup, because the case's whole meaning
   * turns on it having happened.
   *
   * **⚠️ THE RESIDUAL THIS DOCBLOCK USED TO DESCRIBE WAS WORSE THAN IT SAID, and
   * it is now CLOSED — see 12.316.** The old text called it "bounded in time"
   * by `RECONCILE_MIN_INTERVAL_MS`. It was not bounded in time at all:
   * `hub.ts` sends `caught-up` once per SUBSCRIPTION (`caughtUpSent`), so the
   * automatic reconcile is once per RECONNECT, and a narrow-and-re-widen with
   * no reconnect between them never reconciles. On a stable socket the
   * "bounded" residual was the FULL defect, and this case is green only because
   * it calls `reconcile` by hand. Found by the branch review; the wrong
   * sentence is quoted rather than deleted, because "bounded in time" is
   * exactly the reassurance a later reader takes on trust.
   * **CLOSED by ruling P37.2 — see 12.316, which runs this same script with no
   * manual reconcile and no reconnect.** Closure 5c's FIRST form (reconcile the
   * notice's named ids) could not work, and the reason is a derivation rather
   * than a measurement:
   * a notice only ever names ids the reader can see NOW (`grant-backfill.ts`
   * yields a candidate only if `canSee`), and reconcile only ever returns ids
   * the reader CANNOT see (`reconcile-route.ts` marks one restricted only if
   * `!canSee`). Same function, same instant, complementary predicates — the
   * intersection is empty by construction. The stale copy is stale in its
   * CONTENT and `canSee` answers about its AUDIENCE, so reconcile was the wrong
   * instrument rather than a mistimed one. **What closes it is the notice
   * carrying each ticket's `headSeq`** (P37.2): the client pulls iff its own
   * local maximum for that ticket is lower, which is the one thing `canSee`
   * cannot answer at any timing.
   */
  it('12.275 a re-widened ticket comes back EVEN IF the client read something else meanwhile — 12.274’s probe, green, and green only with BOTH halves', async () => {
    const { ticketId, created } = await seedSharedTicket('The shared one');
    // A second, always-visible ticket. It is the "something else meanwhile"
    // that made 12.274 a defect rather than S4's quiet shape, and below it is
    // also the boundedness control on the purge.
    const { ticketId: unrelated } = await seedSharedTicket('The unrelated one');

    // NARROW to A alone. B loses the ticket; B is not told.
    const narrow = ticketEvent(USER_A, ticketId, 'visibility.set', {
      ticketId,
      mode: 'explicit',
      userIds: [USER_A],
    });
    await commit(USER_A, narrow);
    // A row filed on the narrowed ticket while B cannot see it — the row 12.274
    // measured B losing for ever.
    const whileHidden = ticketEvent(USER_A, ticketId, 'comment.added', { body: plainTextToDoc('said while hidden') });
    await commit(USER_A, whileHidden);

    // THE UNRELATED VISIBLE COMMIT. This is the whole difference from 12.270.
    const elsewhere = ticketEvent(USER_A, unrelated, 'comment.added', { body: plainTextToDoc('elsewhere') });
    await commit(USER_A, elsewhere);
    await b.syncDown();

    // 12.274's OWN CONTROL, kept — and DEMOTED, which is worth saying because a
    // reader will otherwise take it for this case's hinge. It was the hinge
    // while the case turned on a cursor: under the push shape the only thing
    // that could re-send the hidden rows was a server that noticed the cursor
    // had run past them. Under P37.1 the pull fires on `getTicket(T) === null`
    // and on nothing else, so it would fire from a purged replica wherever B's
    // cursor stood. This block therefore still fails if the SCRIPT stops being
    // 12.274's — which is what it is now for — but it is no longer what a green
    // run depends on. The discriminating precondition is the pair below it:
    // B holds `[created.id]` and no more, and B still holds a row for the
    // ticket.
    const cursorAfterElsewhere = await b.replica.getCursor(h.workspaceId);
    const { rows: seqRows } = await h.pool.query<{ id: string; workspace_seq: string }>(
      'SELECT id, workspace_seq FROM events WHERE id = ANY($1::text[])',
      [[narrow.id, whileHidden.id]],
    );
    expect(seqRows).toHaveLength(2);
    for (const row of seqRows) {
      expect(
        Number(row.workspace_seq),
        `B's cursor must have passed ${row.id} for this to be 12.274's shape`,
      ).toBeLessThan(cursorAfterElsewhere);
    }

    // THE PRECONDITION THE HEADLINE TURNS ON: B does not hold the hidden rows,
    // and B DOES still hold a stale partial copy of the ticket. Both halves
    // matter — the second is what would make the re-widening's notice a no-op
    // if the purge below never ran.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([created.id]);
    expect(await b.replica.getTicket(ticketId)).not.toBeNull();

    // THE NARROW HALF, first, as `onCaughtUp` runs it. Its answer is pinned
    // rather than discarded: `presented: 2` says B offered both tickets and so
    // the purge was a decision about this one rather than an empty pass, and
    // `purged: [ticketId]` says exactly which copy went.
    // **THE MANUAL RECONCILE IS KEPT HERE DELIBERATELY, and 12.316 below is the
    // case that removes it.** This case witnesses the residual FIRST — a device
    // holding a stale partial copy — and then removes it explicitly, so the
    // convergence assertions further down are known to be about the pull rather
    // than about a reconcile that happened to run. 12.316 runs the same script
    // with no manual call at all and requires convergence anyway, which is what
    // closure 5c's minimal form buys.
    expect(await b.engine.reconcile(h.workspaceId)).toEqual({ presented: 2, purged: [ticketId] });
    expect(await b.replica.getTicket(ticketId)).toBeNull();
    // BOUNDED: the ticket B still legitimately holds survived. Without this the
    // pull below would be indistinguishable from a reconcile that wiped
    // everything and a bootstrap that put one thing back.
    expect(await b.replica.getTicket(unrelated)).not.toBeNull();
    // Nothing has been fetched yet, so the count below is this widening's.
    expect(b.pulls).toEqual([]);

    // RE-WIDEN.
    const widen = ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'project' });
    await commit(USER_A, widen);
    const delivered = await b.syncDown();
    await a.syncDown();

    // THE WIRE, exactly. One notice naming one ticket, ahead of one envelope —
    // and the envelope list is the P37.1 half: the pre-cursor HISTORY is not on
    // it. Under the push shape this drain carried four envelopes and the wedge
    // at 12.290 with them.
    expect(instructionsOf(delivered)).toEqual([
      { kind: 'reach-granted', workspaceId: h.workspaceId, tickets: [ticketId].map((id) => ({ id, headSeq: expect.any(Number) as unknown as number })) },
    ]);
    expect(envelopeIdsOf(delivered)).toEqual([widen.id]);
    // THE PULL, exactly: one request, for this ticket, and nothing left owed.
    // The emptiness matters on its own — `drainPendingPulls` swallows a failed
    // pull in silence and leaves the id pending, so a leftover here is the only
    // thing that turns that silence into a message rather than an equality
    // diff.
    expect(b.pulls).toEqual([ticketId]);
    expect(await b.replica.listPendingPulls(h.workspaceId)).toEqual([]);

    // 12.274 measured `bHasNarrow: false` and `replicasEqual: false` here.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([
      created.id,
      narrow.id,
      whileHidden.id,
      widen.id,
    ]);
    const onA = await a.replica.getTicket(ticketId);
    const onB = await b.replica.getTicket(ticketId);
    expect(onA).not.toBeNull();
    // THE LOAD-BEARING ONE, and it is load-bearing for a NEW reason under
    // P37.1: the two states were built by different code paths. A's is the
    // incremental fold through `applyServerItem`, envelope by envelope; B's was
    // rebuilt wholesale by `refoldTicket` inside `loadTicketBootstrap`. Equal
    // here means those two paths agree, which no single-client case can ask.
    expect(onB).toEqual(onA);
    expect(await b.replica.listEntityEvents(ticketId)).toEqual(await a.replica.listEntityEvents(ticketId));
    // Server ≡ replica, which is the line that makes convergence mean the
    // product agrees with itself rather than the two clients agreeing.
    expect(await h.projTicket(ticketId)).toEqual(onA?.confirmed);
    // Nothing left undelivered on either side. The pull wrote no cursor of its
    // own — `TicketBootstrap` carries no `streamSeq` and `loadTicketBootstrap`
    // deliberately writes none — so B standing at the head is the STREAM's
    // arithmetic, not the bootstrap's.
    const streamHead = await readStreamSeq(h.pool, h.workspaceId);
    expect(await b.replica.getCursor(h.workspaceId)).toBe(streamHead);
    expect(await a.replica.getCursor(h.workspaceId)).toBe(streamHead);
  });

  /**
   * ## What over-delivery COSTS changed shape with P37.1, so what is measured did
   *
   * `check-permission.ts` does not refuse a `visibility.set` that sets the mode
   * a ticket already has, and nothing else does either. Under the push shape
   * that was an amplifier with real teeth: a member could re-issue one per
   * commit and make the server re-walk the subtree and re-stream every
   * subscriber the whole history, over and over. `grant-backfill.ts` states the
   * repair as a consequence of the reshape — *"a client that already holds the
   * subtree does no work for it at all"* — and this case is that sentence
   * MEASURED rather than cited, which is what ruling P37.1 asks for.
   *
   * The measurement is a request COUNT, taken at the transport's own door
   * (`HarnessClient.pulls`, appended at entry so a refused pull still counts).
   * A count is a weak assertion on its own, and specifically it is weak in the
   * direction that would flatter the product: a server that yielded no notice
   * would also cost zero pulls. So every half below witnesses the NOTICE on the
   * wire first, from the items `syncDown()` returns, and only then the zero.
   * And the zero is paired with a non-zero from the same run through the same
   * door: a widening on a ticket this client does NOT hold must cost exactly
   * one.
   */
  it('12.276 over-delivery changes nothing: a notice naming what the client already holds costs it no pull', async () => {
    const { ticketId } = await seedSharedTicket('Held throughout');

    // The control's subject: a ticket B will never have held. Created visible
    // and narrowed before B's first sight of it, so neither row is ever
    // delivered — `visibleEventsFor` filters against visibility AS OF NOW, and
    // a narrowing self-excludes the viewer it narrowed away, so this costs B no
    // notice either. (B's CURSOR does not move here — nothing was delivered, so
    // there is no `workspaceSeq` to advance to. What carries it past these two
    // rows is the visible commit further down, and that is asserted where it
    // becomes load-bearing.)
    const unheld = newUlid();
    const unheldCreated = ticketEvent(USER_A, unheld, 'ticket.created', {
      typeId: TASK_TYPE_ID,
      projectId: h.projectId,
      parentId: null,
      title: 'Never seen',
    });
    await commit(USER_A, unheldCreated);
    const hideIt = ticketEvent(USER_A, unheld, 'visibility.set', {
      ticketId: unheld,
      mode: 'explicit',
      userIds: [USER_A],
    });
    await commit(USER_A, hideIt);
    expect(instructionsOf(await b.syncDown())).toEqual([]);
    expect(await b.replica.getTicket(unheld)).toBeNull();

    // The first authored `visibility.set`, setting the mode this ticket already
    // resolves to (`ROOT_DEFAULT_MODE` is `'project'`). It is a trigger, so a
    // notice fires; B holds the ticket, so nothing is owed.
    await commit(USER_A, ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'project' }));
    await b.syncDown();

    const before = {
      ticket: await b.replica.getTicket(ticketId),
      history: (await b.replica.listEntityEvents(ticketId)).map((e) => e.id),
    };
    // The state B holds is real, not empty — a vacuous "nothing changed" would
    // otherwise pass against a replica holding nothing.
    expect(before.history).toHaveLength(2);
    expect(before.ticket?.confirmed).not.toBeNull();
    expect(b.pulls).toEqual([]);

    // THE CONTROL'S OWN PRECONDITION, and it is 12.274's again. B's cursor must
    // have run PAST both rows on `unheld`, or the widening below would simply
    // re-deliver them from beneath the cursor as ordinary envelopes, B would
    // hold the ticket by the time the notice was applied, and the pull count
    // would be zero for a reason that has nothing to do with holdings. What
    // carried the cursor there is the no-op `visibility.set` above: it is
    // visible to B and the two rows on `unheld` are not, which is exactly the
    // mechanism 12.274 measured.
    const cursorBeforeControl = await b.replica.getCursor(h.workspaceId);
    const { rows: unheldSeqs } = await h.pool.query<{ id: string; workspace_seq: string }>(
      'SELECT id, workspace_seq FROM events WHERE id = ANY($1::text[])',
      [[unheldCreated.id, hideIt.id]],
    );
    expect(unheldSeqs).toHaveLength(2);
    for (const row of unheldSeqs) {
      expect(
        Number(row.workspace_seq),
        `B's cursor must have passed ${row.id}, or the pull below is not a pull`,
      ).toBeLessThan(cursorBeforeControl);
    }

    // THE REPEAT. Byte-for-byte the same claim as the one above, on a ticket
    // whose audience it cannot change — the shape `check-permission.ts` admits
    // and the amplifier P37.1 defused.
    const repeat = ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'project' });
    await commit(USER_A, repeat);
    const delivered = await b.syncDown();

    // THE NOTICE ARRIVED, and it named this very ticket. Without this line the
    // zero below would be satisfied by a product that fired no notice at all.
    expect(instructionsOf(delivered)).toEqual([
      { kind: 'reach-granted', workspaceId: h.workspaceId, tickets: [ticketId].map((id) => ({ id, headSeq: expect.any(Number) as unknown as number })) },
    ]);
    // AND IT COST NOTHING. The id was named, the replica found it held, and no
    // request left the device — `applyInstruction`'s `getTicket(id) === null`
    // filter is the only thing between the notice and a pull, so this zero is
    // that filter and nothing else.
    expect(b.pulls).toEqual([]);
    expect(await b.replica.listPendingPulls(h.workspaceId)).toEqual([]);

    // THE ROWS, not a count. `visibility.set` is one of the three ticket-entity
    // types the reducer does not fold (`ticket-state.ts`), so head state must be
    // untouched; the ONE thing that legitimately moves is the local history,
    // which gains the trigger envelope itself and nothing besides. The wire says
    // the same thing one layer out — a single envelope, no tail behind the
    // notice — and that is the P37.1 half: under the push shape this drain
    // carried the whole history for the second time.
    expect(await b.replica.getTicket(ticketId)).toEqual(before.ticket);
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([...before.history, repeat.id]);
    expect(envelopeIdsOf(delivered)).toEqual([repeat.id]);
    expect(await b.replica.getCursor(h.workspaceId)).toBe(await readStreamSeq(h.pool, h.workspaceId));

    // THE POSITIVE CONTROL, same run, same door, same counter: widen the ticket
    // B does NOT hold. If the zero above were the harness never draining, this
    // would be zero too.
    const widenUnheld = ticketEvent(USER_A, unheld, 'visibility.set', { ticketId: unheld, mode: 'project' });
    await commit(USER_A, widenUnheld);
    const deliveredControl = await b.syncDown();
    expect(instructionsOf(deliveredControl)).toEqual([
      { kind: 'reach-granted', workspaceId: h.workspaceId, tickets: [unheld].map((id) => ({ id, headSeq: expect.any(Number) as unknown as number })) },
    ]);
    expect(b.pulls).toEqual([unheld]);
    // The wire carried the trigger and NOTHING ELSE — the two earlier rows on
    // this ticket sit below B's cursor and were not re-streamed. So everything
    // B is about to be shown holding arrived through the PULL, which is the
    // claim `b.pulls` alone cannot make.
    expect(envelopeIdsOf(deliveredControl)).toEqual([widenUnheld.id]);
    // And the pull was worth making: B holds the whole history, including the
    // two rows that were committed before B was ever in the audience.
    expect((await b.replica.listEntityEvents(unheld)).map((e) => e.id)).toEqual([
      unheldCreated.id,
      hideIt.id,
      widenUnheld.id,
    ]);
    expect(await h.projTicket(unheld)).toEqual((await b.replica.getTicket(unheld))?.confirmed);

    // AND THE LOOP CLOSES: the same over-delivery that cost one pull a moment
    // ago costs none now, because the only thing that changed is that B holds
    // it. This is replay idempotence in the notice shape — the same ticket
    // handed back twice, the second time for free.
    const repeatUnheld = ticketEvent(USER_A, unheld, 'visibility.set', { ticketId: unheld, mode: 'project' });
    await commit(USER_A, repeatUnheld);
    expect(instructionsOf(await b.syncDown())).toEqual([
      { kind: 'reach-granted', workspaceId: h.workspaceId, tickets: [unheld].map((id) => ({ id, headSeq: expect.any(Number) as unknown as number })) },
    ]);
    expect(b.pulls).toEqual([unheld]);
    expect(await b.replica.listPendingPulls(h.workspaceId)).toEqual([]);
  });

  it('12.289 6.104’s residual actually closes: the client presents what it holds and the narrowed ticket goes — while the claimant’s own contest survives', async () => {
    const { ticketId } = await seedSharedTicket('Un-shared later');
    const { ticketId: stillShared } = await seedSharedTicket('Never un-shared');

    // B edits offline, then loses the ticket before the claim goes up. This is
    // S4's shape, and it is here because the purge must not take the claimant's
    // own record with it.
    const edit = ticketEvent(USER_B, ticketId, 'ticket.field_set', {
      fieldId: 'title',
      value: 'B edited this offline',
    });
    expect(await b.submit(edit)).toEqual({ status: 'pending', eventId: edit.id });
    const narrow = ticketEvent(USER_A, ticketId, 'visibility.set', {
      ticketId,
      mode: 'explicit',
      userIds: [USER_A],
    });
    await commit(USER_A, narrow);
    await b.goOnline();

    // THE RESIDUAL, witnessed before it is closed. B still holds the ticket, its
    // history and its searchable title: no tombstone ever arrived, because the
    // per-event purge walk was struck (6.101) and P37 does not reopen it.
    expect(await b.replica.getTicket(ticketId)).not.toBeNull();
    expect((await b.replica.listEntityEvents(ticketId)).length).toBeGreaterThan(0);
    expect((await b.replica.searchLocal(h.workspaceId, 'Un-shared later')).map((r) => r.ticketId)).toEqual([
      ticketId,
    ]);
    const stubsBefore = await b.replica.listContests(h.workspaceId, { claimantId: USER_B });
    expect(stubsBefore).toHaveLength(1);

    // THE CLIENT-PRESENTED PATH. Not a driver calling `purgeEntity` per id —
    // P37 constraint 3 is explicit that the residual flips only when a narrowed
    // ticket is removed by this path, because a rig that purged directly would
    // be asserting the harness rather than the product.
    //
    // ## WHAT THIS REACHES, exactly, and what it does not
    //
    // The rule is the SERVER's own, called and not restated: the rig's
    // `transport.reconcile` invokes `reconcileHeldIds` (`src/sync/
    // reconcile-route.ts`), which is the body of `POST /v1/sync/reconcile` and
    // has exactly two callers — that route and this harness. So a change to
    // which held ids come back `restricted` reddens here. That was NOT true
    // when this comment was first written: the rig then carried a hand-copy of
    // the loop, and this case's claim to reach the product was a claim about a
    // copy that was correct on the day it was made. Closure 5b deleted the
    // copy; the sentence is corrected here rather than left to flatter itself.
    //
    // The HTTP SHELL is not reached, and calling this "end to end" would be
    // wrong in a way that matters: no bearer session is checked, the 403
    // membership gate never runs, and neither the body schema nor its
    // `MAX_BATCH_SIZE` bound is exercised. Those are
    // `test/sync/reconcile-route.test.ts` (12.284-12.286, plus 12.304's guest side), and reaching them from
    // here would require the harness's seeded users to be real better-auth
    // users with ids better-auth chose. What IS reached above the rule is the
    // CLIENT half in full: `SyncEngine.reconcile` enumerates what this replica
    // holds, chunks it to `RECONCILE_CHUNK_SIZE`, and applies the answer
    // through `replica.purgeEntity`.
    const outcome = await b.engine.reconcile(h.workspaceId);
    expect(outcome.presented).toBe(2);
    expect(outcome.purged).toEqual([ticketId]);

    // Gone, by every door a replica answers through.
    expect(await b.replica.getTicket(ticketId)).toBeNull();
    expect(await b.replica.listEntityEvents(ticketId)).toEqual([]);
    expect(await b.replica.searchLocal(h.workspaceId, 'Un-shared later')).toEqual([]);
    // And BOUNDED: the ticket B still legitimately holds is untouched. Without
    // this the same assertions would pass against a reconcile that wiped
    // everything, which is the failure mode a purge has.
    expect(await b.replica.getTicket(stillShared)).not.toBeNull();

    // HONESTY INVARIANT 5: the claimant's own contested claim survives the
    // purge. `purgeEntity` keeps contests whose `claimant_id` is this user
    // deliberately — the `originalEvent` is what B typed on this device, and
    // vanishing it would silently drop B's own claim. It leaks nothing: B
    // authored it.
    expect(await b.replica.listContests(h.workspaceId, { claimantId: USER_B })).toEqual(stubsBefore);

    // A, still in the audience, is untouched by any of this — and A's own
    // catch-up costs nothing, because the narrowing's notice (A can see the
    // ticket, so A is named) reaches a device that already holds it.
    await a.syncDown();
    expect(await a.replica.getTicket(ticketId)).not.toBeNull();
    expect(a.pulls).toEqual([]);

    // Idempotent: a second reconcile presents one fewer ticket and purges nothing.
    const again = await b.engine.reconcile(h.workspaceId);
    expect(again).toEqual({ presented: 1, purged: [] });
  });


  /**
   * ## 12.316 — the same script, with nothing called by hand
   *
   * 12.275 proves the pull converges once the stale copy is gone, but it
   * removes that copy with an explicit `engine.reconcile()`. Honest, and it
   * leaves the real question open: **does a device on a live socket, with no
   * reconnect and no manual call, converge at all?**
   *
   * Under an ID-ONLY notice the answer was NO, and not "sometimes". The
   * client's test was "do I hold this ticket", which cannot see a stale partial
   * copy; and the scheduled reconcile could not rescue it, because `caught-up`
   * is sent once per SUBSCRIPTION — on a socket that never drops it never fires
   * again. Ruling P37.2 gives the notice each ticket's `headSeq`, and the
   * client pulls iff its own local maximum is lower.
   *
   * So this is the case that decides whether the branch closes 12.274 in the
   * PRODUCT rather than in a fixture that helps it along.
   */
  it('12.316 P37.2: the 12.274 script converges with NO manual reconcile and NO reconnect', async () => {
    const { ticketId, created } = await seedSharedTicket('The shared one, unaided');
    const { ticketId: unrelated } = await seedSharedTicket('The unrelated one, unaided');

    await commit(USER_A, ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'explicit', userIds: [USER_A] }));
    const whileHidden = ticketEvent(USER_A, ticketId, 'comment.added', { body: plainTextToDoc('said while hidden, unaided') });
    await commit(USER_A, whileHidden);
    await commit(USER_A, ticketEvent(USER_A, unrelated, 'comment.added', { body: plainTextToDoc('elsewhere, unaided') }));
    await b.syncDown();

    // THE PRECONDITION, and it is what makes the assertion below mean anything:
    // B holds a STALE PARTIAL copy — a `tickets` row, and only the creation
    // event. Without it, "B converged" could be satisfied by a B that simply
    // never held the ticket, which is the easy case.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toEqual([created.id]);
    expect(await b.replica.getTicket(ticketId)).not.toBeNull();

    // RE-WIDEN. No reconcile is called anywhere in this test and there is no
    // reconnect — `syncDown()` is one continuous subscription's drain.
    await commit(
      USER_A,
      ticketEvent(USER_A, ticketId, 'visibility.set', { ticketId, mode: 'explicit', userIds: [USER_A, USER_B] }),
    );
    await b.syncDown();
    await a.syncDown();

    // B PULLED IT. Under an id-only notice this list was empty: the notice named
    // a ticket B "held" and the holdings filter skipped it.
    expect(b.pulls).toEqual([ticketId]);
    expect(await b.replica.listPendingPulls(h.workspaceId)).toEqual([]);

    // And B converged — including the row filed while the ticket was hidden,
    // which is exactly what 12.274 measured B losing for ever.
    expect((await b.replica.listEntityEvents(ticketId)).map((e) => e.id)).toContain(whileHidden.id);
    const onA = await a.replica.getTicket(ticketId);
    const onB = await b.replica.getTicket(ticketId);
    expect(onA).not.toBeNull();
    expect(onB).toEqual(onA);
    expect(await b.replica.listEntityEvents(ticketId)).toEqual(await a.replica.listEntityEvents(ticketId));

    // BOUNDEDNESS CONTROL: the unrelated ticket B could always see was not
    // dragged along. Without it, a handler that pulled everything named would
    // satisfy every assertion above.
    expect(await b.replica.getTicket(unrelated)).not.toBeNull();
  });
});
