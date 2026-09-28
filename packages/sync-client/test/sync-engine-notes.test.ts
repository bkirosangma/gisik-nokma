import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { createOutbox } from '../src/outbox/outbox.js';
import {
  createSyncEngine,
  NotePullNotFound,
  type ReconcileAnswer,
  type StreamHandlers,
  type SyncEngine,
  type SyncTransport,
} from '../src/engine/sync-engine.js';
import type { SyncItem } from '../src/replica/sync-item.js';
import type { SyncEventResult } from '../src/outbox/outbox.js';

/**
 * The engine's note half (notes series, Plan 2 of 6, spec §5.1; cases
 * 18.083–18.087).
 *
 * ## What this file is the only witness for
 *
 * A note reaches a device by PULL, after a `reach-granted` notice named it —
 * never by the ordinary stream, because the note's own events sit below the
 * reader's cursor by construction. So every part of that path is invisible to a
 * stream-shaped test: the notice's note arm, the pending set it fills, the
 * drain that empties it, and the signal that tells an open screen to re-read.
 * This file drives all four.
 *
 * ## The fake is local, and it is deliberate about what it records
 *
 * `sync-engine.test.ts` has its own fake for the ticket half. This one does not
 * reuse it: the two answer different questions and a shared fake would have to
 * satisfy both, which is how a harness ends up proving a payload the server
 * never sends. `notePullCalls` records WHAT was pulled, not merely that
 * something was — a fake that only answered could not tell a drain that fetched
 * two notes from one that fetched the same note twice.
 */

const WS = newUlid();
const P = newUlid();
const USER_A = newUlid();
const TICKET = newUlid();
const NOTE = newUlid();
const NOTE_2 = newUlid();
const WF = newUlid();
const TYPE = newUlid();

const CLIENT_TIME = '2026-08-20T09:00:00.000Z';

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { seq?: number; workspaceSeq?: number; actorId?: string } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: CLIENT_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: opts.workspaceSeq ?? streamCounter,
  };
}

const noteCreated = (noteId: string, opts: { seq?: number; workspaceSeq?: number } = {}): LedgerEvent =>
  envelope({ kind: 'note', id: noteId }, 'note.created', { title: 'A note', homeProjectId: P, scope: { mode: 'workspace' } }, opts);

const ticketCreated = (ticketId: string, seq: number): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: TYPE, projectId: P, parentId: null, title: 'A ticket' }, { seq });

function bootstrapOf(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [P] },
    streamSeq: 7,
    definitions: [
      envelope({ kind: 'workflow', id: WF }, 'workflow.defined', {
        id: WF,
        version: 1,
        name: 'Errands',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: '*', to: 'done', rules: [] }],
      }, { seq: 1 }),
      envelope({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
        id: TYPE,
        name: 'Task',
        icon: 'check',
        rank: 3,
        workflowId: WF,
        fields: [],
      }, { seq: 1 }),
    ],
    tickets: [],
  };
}

type Script = {
  handlers: StreamHandlers | null;
  /** Every note pull the engine made, in order — WHAT was fetched, not just that something was. */
  notePullCalls: Array<{ workspaceId: string; noteId: string }>;
  notePullImpl: (workspaceId: string, noteId: string) => Promise<{ events: LedgerEvent[] }>;
  reconcileCalls: Array<{ workspaceId: string; heldIds: string[]; heldNoteIds: string[] | undefined }>;
  reconcileImpl: (workspaceId: string, heldIds: string[], heldNoteIds?: string[]) => Promise<ReconcileAnswer>;
};

function fakeTransport(script: Script): SyncTransport {
  return {
    async bootstrap() {
      return bootstrapOf();
    },
    async sync(): Promise<SyncEventResult[]> {
      return [];
    },
    openStream(_ws, _afterSeq, handlers) {
      script.handlers = handlers;
      return { close: () => handlers.onClose() };
    },
    async reconcile(workspaceId, heldIds, heldNoteIds) {
      script.reconcileCalls.push({ workspaceId, heldIds, heldNoteIds });
      return script.reconcileImpl(workspaceId, heldIds, heldNoteIds);
    },
    async purgedLookup() {
      return [];
    },
    async deletedItems() {
      return { items: [] };
    },
    async bootstrapTicket(_workspaceId, ticketId) {
      throw new Error(`fakeTransport: unexpected ticket pull for ${ticketId}`);
    },
    async bootstrapNote(workspaceId, noteId) {
      script.notePullCalls.push({ workspaceId, noteId });
      return script.notePullImpl(workspaceId, noteId);
    },
  };
}

type Fixture = { script: Script; replica: Replica; engine: SyncEngine };

/**
 * Every engine this file started, stopped after each case.
 *
 * NOT tidiness: an engine left running keeps its reconnect timer
 * (`reconnectDelayMs: 5`) and keeps draining, and the cases here share a module
 * — so a live engine from an earlier `it` re-enters the chain while a later one
 * is measuring. Measured: 18.087 saw three pulls for one note and 18.086 failed
 * outright, and BOTH passed in isolation. A leak that only shows when the file
 * runs whole is the kind a `-t` filter hides.
 */
const started: SyncEngine[] = [];
afterEach(() => {
  for (const e of started.splice(0)) e.stop();
});

async function fixture(
  over: Partial<Pick<Script, 'notePullImpl' | 'reconcileImpl'>> = {},
): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const script: Script = {
    handlers: null,
    notePullCalls: [],
    // The default REFUSES. A pull that silently succeeded with an empty payload
    // would let every case here pass whether or not the drain ran.
    notePullImpl:
      over.notePullImpl ??
      (async (_workspaceId, noteId) => {
        throw new Error(`fakeTransport: unexpected note pull for ${noteId}`);
      }),
    reconcileCalls: [],
    reconcileImpl:
      over.reconcileImpl ?? (async (workspaceId) => ({ workspaceId, restricted: [], restrictedNotes: [] })),
  };
  const storage = createBetterSqliteStorage(':memory:');
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: fakeTransport(script), reconnectDelayMs: 5 });
  await engine.start(WS);
  await engine.settled();
  started.push(engine);
  return { script, replica, engine };
}

/** The notice a widening emits, with its note arm. */
const notice = (notes: Array<{ id: string; headSeq: number }>): SyncItem => ({
  kind: 'reach-granted',
  workspaceId: WS,
  tickets: [],
  notes,
});

describe('the engine pulls notes (Plan 2 of 6)', () => {
  it('18.083 a reach-granted notice queues a note pull only when the local head is behind', async () => {
    const { script, replica, engine } = await fixture();
    // A note this device already holds, with a known local head.
    await replica.loadNoteEvents([noteCreated(NOTE, { workspaceSeq: 40, seq: 1 })]);
    const head = 40;

    // CURRENT: the notice names the head this device already has. Nothing is
    // queued — the comparison ruling P37.2 added, applied to notes.
    script.handlers!.onItem(notice([{ id: NOTE, headSeq: head }]));
    await engine.settled();
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);

    // BEHIND: a head above the local one. This is the stale-partial case an
    // id-only notice cannot see.
    script.handlers!.onItem(notice([{ id: NOTE, headSeq: head + 1 }]));
    await engine.settled();
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([{ id: NOTE, headSeq: head + 1 }]);
  });

  it('18.084 the drain pulls a queued note, loads its events, clears the entry and signals', async () => {
    const { script, replica, engine } = await fixture({
      notePullImpl: async () => ({ events: [noteCreated(NOTE, { seq: 1, workspaceSeq: 40 })] }),
    });
    const applied = vi.fn();
    const unsubscribe = engine.onPullApplied(applied);

    script.handlers!.onItem(notice([{ id: NOTE, headSeq: 40 }]));
    await engine.settled();
    expect(script.notePullCalls).toEqual([{ workspaceId: WS, noteId: NOTE }]);

    script.handlers!.onCaughtUp(7);
    await engine.settled();

    // The entry is gone (the pull landed), the row exists (the events were
    // folded, not merely stored), and the listener was told — which is the
    // whole reason an open screen refreshes after a pull.
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);
    expect((await replica.getNote(NOTE))?.noteId).toBe(NOTE);
    expect(applied).toHaveBeenCalledWith({ kind: 'note', id: NOTE });
    unsubscribe();
  });

  it('18.085 a 404 on a note pull drops the entry if unchanged — and only then', async () => {
    const { script, replica, engine } = await fixture({
      notePullImpl: async (_ws, noteId) => {
        throw new NotePullNotFound(noteId);
      },
    });
    script.handlers!.onItem(notice([{ id: NOTE, headSeq: 40 }]));
    script.handlers!.onItem(notice([{ id: NOTE_2, headSeq: 40 }]));
    await engine.settled();

    script.handlers!.onCaughtUp(7);
    await engine.settled();

    // Both were refused the same way and both went: "nothing travels" is an
    // ANSWER for a note, exactly as it is for a ticket.
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);
  });

  it('18.085 the other half: a failure that is NOT a 404 keeps the entry', async () => {
    // The control arm, and it is a separate `it` because it needs a different
    // transport behaviour — the reason 18.085's own id is cited twice rather
    // than the case being split into an id it does not own. A network wobble is
    // not an answer, and clearing on it would leave a note this device is owed
    // never delivered, silently and for ever.
    const { script, replica, engine } = await fixture({
      notePullImpl: async () => {
        throw new Error('network wobble');
      },
    });
    script.handlers!.onItem(notice([{ id: NOTE, headSeq: 40 }]));
    await engine.settled();

    script.handlers!.onCaughtUp(7);
    await engine.settled();

    expect(await replica.listPendingPulls(WS, 'note')).toEqual([{ id: NOTE, headSeq: 40 }]);
    // And the control's own control: the pull WAS attempted, so the surviving
    // entry is a statement about the failure rather than about a drain that
    // never ran.
    // `>= 1`, not `=== 1`: the engine drains after EVERY notice as well as on
    // catch-up (sync-engine's own comment: `onCaughtUp` fires once per
    // SUBSCRIPTION, so waiting for it could be hours). How many attempts a
    // failure costs is not the rule; that at least one was made is.
    expect(script.notePullCalls.length).toBeGreaterThan(0);
  });

  it('18.086 reconcile presents every held note id and purges what the server refuses', async () => {
    const { script, replica, engine } = await fixture({
      reconcileImpl: async (workspaceId, heldIds, heldNoteIds) => ({
        workspaceId,
        // Control: the ticket arm still answers as it always did.
        restricted: heldIds.slice(0, 1).map((id) => ({ kind: 'restricted' as const, id })),
        // NAMED, not "the first one presented". `listNoteIds` orders by
        // `note_id`, and two ULIDs minted in the same millisecond do NOT sort
        // in creation order — so `slice(0, 1)` picked a different note from run
        // to run and this case failed intermittently. Measured: it failed,
        // passed and failed again across three consecutive full-file runs with
        // no source change between them. A fake that names the id it refuses is
        // deterministic whatever the ordering is.
        restrictedNotes: (heldNoteIds ?? [])
          .filter((id) => id === NOTE)
          .map((id) => ({ kind: 'restricted' as const, id })),
      }),
    });
    await replica.applyServerItem(ticketCreated(TICKET, 1));
    await replica.loadNoteEvents([
      noteCreated(NOTE, { seq: 1, workspaceSeq: 40 }),
      noteCreated(NOTE_2, { seq: 1, workspaceSeq: 41 }),
    ]);
    // A DELETED note is still held, and `listNoteIds` is what offers it up —
    // `listNotes` would not, and a deleted note this user can no longer read
    // would then stay on the device for ever.
    await replica.applyServerItem(
      envelope({ kind: 'note', id: NOTE_2 }, 'note.deleted', {}, { seq: 2, workspaceSeq: 42 }),
    );

    await engine.reconcile(WS);
    await engine.settled();

    // Presented: both note ids, deleted one included, and the ticket beside
    // them in its own arm.
    const presentedNotes = script.reconcileCalls.flatMap((c) => c.heldNoteIds ?? []);
    expect(presentedNotes.sort()).toEqual([NOTE, NOTE_2].sort());
    expect(script.reconcileCalls.flatMap((c) => c.heldIds)).toEqual([TICKET]);

    // And what the server refused is GONE: the note with all its events and
    // comments, and the ticket — the note arm purges through the same door.
    expect(await replica.getNote(NOTE)).toBeNull();
    expect(await replica.listEntityEvents(NOTE)).toEqual([]);
    expect(await replica.getTicket(TICKET)).toBeNull();
    expect(await replica.getNote(NOTE_2)).not.toBeNull();
  });

  it('18.100 an event for a note this device does NOT hold is a PULL, not a stall', async () => {
    // The rule `grant-backfill.ts` states for tickets — "bootstrap-before-apply
    // on any event for an entity not held" — was never extended to notes, so an
    // unfoldable note event reached `stall`, whose latch only `start()` clears.
    //
    // Reachable with no defect in the widening: a reader added to a project
    // sees that project's notes' events for the first time, with their
    // `note.created` below their cursor and never delivered. The event arrives,
    // `applyNoteEvent` refuses it ("no note.created precedes it"),
    // `recoverByPull` answered `false` for anything that was not a ticket
    // entity, the replica's transaction rejects, and the device is bricked.
    const noteId = newUlid();
    const { script, replica, engine } = await fixture({
      notePullImpl: async () => ({ events: [noteCreated(noteId, { seq: 1, workspaceSeq: 40 })] }),
    });
    expect(await replica.getNote(noteId)).toBeNull();

    script.handlers!.onItem(
      envelope({ kind: 'note', id: noteId }, 'note.scope_set', { mode: 'workspace' }, { seq: 2, workspaceSeq: 41 }),
    );
    await engine.settled();

    // NOT stalled — the half that matters, because a stalled device needs a
    // deliberate `start()` to recover and resumes at the same cursor, so the
    // same pair arrives again and it stalls again.
    expect(engine.lastApplyFailure()).toBeNull();
    // And the recovery was a PULL: the history is here, so the event that could
    // not be folded now folds against the state it needs.
    expect(script.notePullCalls).toEqual([{ workspaceId: WS, noteId }]);
    expect(await replica.getNote(noteId)).not.toBeNull();
  });

  it('18.087 exactly one note pull per notice per note, and none once satisfied', async () => {
    const { script, replica, engine } = await fixture({
      notePullImpl: async () => ({ events: [noteCreated(NOTE, { seq: 1, workspaceSeq: 40 })] }),
    });
    // ONE notice naming the SAME note twice — what a server that over-names
    // produces. The pending set is keyed by id, so the second entry SUPERSEDES
    // the first rather than adding a second owed note, and the drain that
    // follows the notice fetches it ONCE.
    //
    // ONE notice, not two, and the distinction is the engine's own design
    // rather than a convenience: `applyOne` drains after EVERY `reach-granted`
    // frame (sync-engine's comment — `onCaughtUp` fires once per SUBSCRIPTION,
    // so waiting for it could be hours). Two notices naming a note with two
    // different heads therefore cost two pulls, and that is correct: the second
    // head is a newer one this device does not have.
    script.handlers!.onItem(
      notice([
        { id: NOTE, headSeq: 40 },
        { id: NOTE, headSeq: 41 },
      ]),
    );
    await engine.settled();
    const callsAfterFirst = script.notePullCalls.length;
    expect(callsAfterFirst).toBe(1);
    expect(await replica.listPendingPulls(WS, 'note')).toEqual([]);

    // A LATER catch-up over the same already-satisfied notice fetches nothing.
    // The entry was CLEARED, which is what makes "one per notice" true rather
    // than "one per device lifetime": a drain that left the id owed would
    // re-fetch the whole history on every reconnect for ever.
    script.handlers!.onCaughtUp(8);
    await engine.settled();
    expect(script.notePullCalls).toHaveLength(callsAfterFirst);
  });
});
